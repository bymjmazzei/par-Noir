/**
 * Flatten a page's non-action layers, frame by frame.
 *
 * Frame N samples the page at timeline time t = N / fps: the playhead poses the
 * layers, every video seeks to its file time, and the page paints bottom-up in
 * layer order — still bands rasterized between the videos. Frames are encoded
 * with WebCodecs at their exact timestamps, so cuts, speed, reverse and start
 * points match the editor and the loop restarts on frame 0.
 *
 * Only blob:/data: video masters are drawn; other sources taint the canvas.
 */

import { flushSync } from 'react-dom';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec
} from 'mediabunny';
import {
  FEED_PREVIEW_BITRATE_BACKOFF,
  FEED_PREVIEW_ENCODE_ATTEMPTS,
  encodePosterFromCanvas,
  feedPreviewBitrate,
  getPublishTier,
  maxBytesForVariant,
  type EncodedPreview,
  type PublishTierNotch
} from '@par-noir/aggregator-domain';
import {
  isVisibleVideoLayer,
  normalizeSection,
  partitionLayersForCompose,
  resolveTimelineDuration,
  sampleSectionLayers,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import {
  composeOutputSizes,
  isUntaintedMediaUrl,
  type ComposePageVideoResult
} from './composePageVideoEncode';
import {
  rasterOutputSize,
  rasterizeElementSafeStill,
  rasterizeElementToPosterBlob,
  visualScale
} from './rasterizePagePoster';
import { findLayerVideoMaster, seekSectionVideosAtTime, seekVideoTo } from './timelineVideoDrive';
import {
  mixPageAudio,
  pageAudioPlan,
  PAGE_AUDIO_CHANNELS,
  PAGE_AUDIO_SAMPLE_RATE
} from './mixPageAudio';
import { setPlayheadSec } from './playheadStore';
import { playbackMode } from './playbackMode';
import { PEN_PUBLISH_PLAN_ID } from './penPublishPlan';

export const PAGE_VIDEO_FPS = 30;
export const VIDEO_ENCODER_UNAVAILABLE = 'video_encoder_unavailable';
export const PAGE_BACKGROUND_ID = '@page-background';
export const PAGE_BODY_ID = '@page-body';
export const BACKGROUND_VIDEO_ID = '@background-video';

const VIDEO_READY_TIMEOUT_MS = 20_000;
const VIDEO_READY_POLL_MS = 200;
const AUDIO_BITRATE = 128_000;
const KEY_FRAME_INTERVAL_SEC = 2;

export type PageEncodeContext = {
  section: PenSectionContent;
  manifest: { pagePresentation?: Pick<PenPagePresentation, 'backgroundVideo'> | null };
};

/** Timeline time of every frame: frame 0 at 0, the last one frame before the end. */
export function frameTimes(durationSec: number, fps = PAGE_VIDEO_FPS): number[] {
  const count = Math.max(1, Math.round(Math.max(0, durationSec) * fps));
  return Array.from({ length: count }, (_, i) => i / fps);
}

export type PaintEntry = { id: string; video: boolean };

/** Still runs between videos, bottom first: bands[0], videos[0], bands[1], … bands[videos.length]. */
export function splitPaintBands(entries: PaintEntry[]): { bands: string[][]; videos: string[] } {
  const bands: string[][] = [[]];
  const videos: string[] = [];
  for (const entry of entries) {
    if (entry.video) {
      videos.push(entry.id);
      bands.push([]);
    } else {
      bands[bands.length - 1]!.push(entry.id);
    }
  }
  return { bands, videos };
}

/**
 * Bottom-up paint order of a sampled page: page background, background video,
 * wrapped objects, body text, then free layers by zIndex. Action layers are left out.
 */
export function pagePaintOrder(
  layers: PenPageLayer[],
  opts: { backgroundVideo: boolean }
): PaintEntry[] {
  const shown = partitionLayersForCompose(layers).inert.filter(
    (layer) => layer.visible !== false && layer.kind !== 'guide'
  );
  const entries: PaintEntry[] = [{ id: PAGE_BACKGROUND_ID, video: false }];
  if (opts.backgroundVideo) entries.push({ id: BACKGROUND_VIDEO_ID, video: true });
  for (const layer of shown) {
    if (layer.bodyWrap) entries.push({ id: layer.id, video: isVisibleVideoLayer(layer) });
  }
  entries.push({ id: PAGE_BODY_ID, video: false });
  const free = shown
    .filter((layer) => !layer.bodyWrap)
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => (a.layer.zIndex ?? 0) - (b.layer.zIndex ?? 0) || a.index - b.index);
  for (const { layer } of free) {
    entries.push({ id: layer.id, video: isVisibleVideoLayer(layer) });
  }
  return entries;
}

type StyleSave = { el: HTMLElement; prop: string; value: string; priority: string };

function overrideStyle(saves: StyleSave[], el: HTMLElement, prop: string, value: string): void {
  saves.push({
    el,
    prop,
    value: el.style.getPropertyValue(prop),
    priority: el.style.getPropertyPriority(prop)
  });
  el.style.setProperty(prop, value, 'important');
}

/** Show only `band` under `root` (visibility, so layout stays put). Returns the undo. */
function showBandOnly(root: HTMLElement, band: Set<string>): () => void {
  const saves: StyleSave[] = [];
  const pageBackground = band.has(PAGE_BACKGROUND_ID);
  if (!pageBackground) {
    overrideStyle(saves, root, 'background-color', 'transparent');
    overrideStyle(saves, root, 'background-image', 'none');
  }
  root.querySelectorAll<HTMLElement>('[data-pen-page-background]').forEach((el) => {
    const show = pageBackground && el.dataset.penPageBackground === 'image';
    overrideStyle(saves, el, 'visibility', show ? 'visible' : 'hidden');
  });
  root.querySelectorAll<HTMLElement>('[data-pen-page-body]').forEach((el) => {
    overrideStyle(saves, el, 'visibility', band.has(PAGE_BODY_ID) ? 'visible' : 'hidden');
  });
  root.querySelectorAll<HTMLElement>('[data-layer-id]').forEach((el) => {
    const id = el.getAttribute('data-layer-id') || '';
    overrideStyle(saves, el, 'visibility', band.has(id) ? 'visible' : 'hidden');
  });
  return () => {
    for (const save of saves.reverse()) {
      if (save.value) save.el.style.setProperty(save.prop, save.value, save.priority);
      else save.el.style.removeProperty(save.prop);
    }
  };
}

async function rasterizeBand(
  root: HTMLElement,
  band: string[],
  w: number,
  h: number,
  opaque: boolean
): Promise<ImageBitmap | null> {
  if (!band.length) return null;
  const restore = showBandOnly(root, new Set(band));
  try {
    const size = { targetWidth: w, targetHeight: h, transparent: !opaque };
    let blob: Blob;
    try {
      blob = await rasterizeElementToPosterBlob(root, { ...size, punchVideos: true, mime: 'image/png' });
    } catch {
      blob = await rasterizeElementSafeStill(root, size);
    }
    return await createImageBitmap(blob);
  } finally {
    restore();
  }
}

function backgroundVideo(root: HTMLElement): HTMLVideoElement | null {
  const el = root.querySelector('[data-pen-page-background="video"] video');
  return el instanceof HTMLVideoElement ? el : null;
}

/** The decoded video behind `id`, once it can be drawn without tainting; null while loading. */
function drawableVideo(root: HTMLElement, id: string): HTMLVideoElement | null {
  const isBackground = id === BACKGROUND_VIDEO_ID;
  const el = isBackground ? backgroundVideo(root) : findLayerVideoMaster(root, id);
  if (!el || el.srcObject) return null;
  if (!isUntaintedMediaUrl(el.currentSrc || el.src || '')) return null;
  if (el.readyState < 2 || !(el.videoWidth > 0)) return null;
  if (playbackMode() === 'publish') {
    const scope = isBackground
      ? el
      : root.querySelector(`[data-layer-id="${CSS.escape(id)}"] [data-pen-playback]`);
    const marker = scope?.closest('[data-pen-playback]');
    if (!(marker instanceof HTMLElement) || marker.dataset.penPlayback !== 'publish') return null;
  }
  return el;
}

async function waitForVideos(
  root: HTMLElement,
  ids: string[],
  timeoutMs: number
): Promise<Map<string, HTMLVideoElement>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = new Map<string, HTMLVideoElement>();
    for (const id of ids) {
      const el = drawableVideo(root, id);
      if (el) found.set(id, el);
    }
    if (found.size === ids.length) return found;
    if (Date.now() > deadline) throw new Error('gallery_video_not_ready');
    await new Promise((resolve) => window.setTimeout(resolve, VIDEO_READY_POLL_MS));
  }
}

type VideoSlot = {
  el: HTMLVideoElement;
  /** Center and size in root layout px. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotate: number;
  fit: 'contain' | 'cover';
  opacity: number;
  filter: string;
};

function measureSlot(
  root: HTMLElement,
  id: string,
  el: HTMLVideoElement,
  layer: PenPageLayer | undefined
): VideoSlot | null {
  const rootW = root.offsetWidth;
  const rootH = root.offsetHeight;
  if (id === BACKGROUND_VIDEO_ID) {
    return { el, cx: rootW / 2, cy: rootH / 2, w: rootW, h: rootH, rotate: 0, fit: 'cover', opacity: 1, filter: 'none' };
  }
  const wrapper = root.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(id)}"]`);
  if (!wrapper) return null;
  const viewer = wrapper.querySelector<HTMLElement>('[data-pen-media-key]') || wrapper;
  // The rotated box's center survives the bounding rect; its size comes from layout.
  const scale = visualScale(root);
  const rootRect = root.getBoundingClientRect();
  const r = viewer.getBoundingClientRect();
  let opacity = 1;
  for (let node: HTMLElement | null = viewer; node && node !== root; node = node.parentElement) {
    opacity *= Number(getComputedStyle(node).opacity) || 0;
  }
  return {
    el,
    cx: (r.left + r.width / 2 - rootRect.left) / scale,
    cy: (r.top + r.height / 2 - rootRect.top) / scale,
    w: viewer.offsetWidth || r.width / scale,
    h: viewer.offsetHeight || r.height / scale,
    rotate: layer?.rotate ?? 0,
    fit: 'contain',
    opacity,
    filter: getComputedStyle(viewer).filter || 'none'
  };
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: VideoSlot, sx: number, sy: number): void {
  const v = slot.el;
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  if (!(vw > 0 && vh > 0) || v.readyState < 2 || !(slot.opacity > 0)) return;
  const w = slot.w * sx;
  const h = slot.h * sy;
  const fit = slot.fit === 'cover' ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  const dw = vw * fit;
  const dh = vh * fit;
  ctx.save();
  ctx.translate(slot.cx * sx, slot.cy * sy);
  if (slot.rotate) ctx.rotate((slot.rotate * Math.PI) / 180);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.globalAlpha = Math.min(1, slot.opacity);
  if (slot.filter && slot.filter !== 'none') ctx.filter = slot.filter;
  ctx.drawImage(v, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 120);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(timer);
        resolve();
      })
    );
  });
}

/**
 * Poses the mounted page at a timeline time and paints it. Bands are re-flattened
 * only when the sampled layer state changes; videos are re-seeked every frame.
 */
class PageSampler {
  private key: string | null = null;
  private bands: Array<ImageBitmap | null> = [];
  private slots: Array<VideoSlot | null> = [];
  private background: HTMLVideoElement | null = null;
  /** File each drawn video layer played from, for the audio mix. */
  readonly videoSrcByLayerId: Record<string, string> = {};

  constructor(
    private readonly root: HTMLElement,
    private readonly section: PenSectionContent,
    private readonly hasBackgroundVideo: boolean,
    private readonly width: number,
    private readonly height: number
  ) {}

  async sample(t: number): Promise<void> {
    const layers = sampleSectionLayers(this.section, t);
    const key = JSON.stringify(layers);
    if (key !== this.key) {
      flushSync(() => setPlayheadSec(t));
      await settle();
      const { bands, videos } = splitPaintBands(
        pagePaintOrder(layers, { backgroundVideo: this.hasBackgroundVideo })
      );
      const ready = await waitForVideos(this.root, videos, VIDEO_READY_TIMEOUT_MS);
      const byId = new Map(layers.map((layer) => [layer.id, layer]));
      const nextBands: Array<ImageBitmap | null> = [];
      for (let i = 0; i < bands.length; i++) {
        nextBands.push(await rasterizeBand(this.root, bands[i]!, this.width, this.height, i === 0));
      }
      this.disposeBands();
      this.bands = nextBands;
      this.slots = videos.map((id) => measureSlot(this.root, id, ready.get(id)!, byId.get(id)));
      for (const id of videos) {
        const el = ready.get(id)!;
        if (id === BACKGROUND_VIDEO_ID) this.background = el;
        else this.videoSrcByLayerId[id] = el.currentSrc || el.src;
      }
      this.key = key;
    }
    const seeks = [seekSectionVideosAtTime(this.section, this.root, t)];
    const bg = this.background;
    if (bg) {
      bg.pause();
      const dur = bg.duration;
      seeks.push(seekVideoTo(bg, Number.isFinite(dur) && dur > 0 ? t % dur : t));
    }
    await Promise.all(seeks);
  }

  paint(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const sx = w / Math.max(1, this.root.offsetWidth);
    const sy = h / Math.max(1, this.root.offsetHeight);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      if (band) ctx.drawImage(band, 0, 0, w, h);
      const slot = this.slots[i];
      if (slot) drawSlot(ctx, slot, sx, sy);
    }
  }

  private disposeBands(): void {
    for (const band of this.bands) band?.close();
    this.bands = [];
  }

  dispose(): void {
    this.disposeBands();
    this.slots = [];
  }
}

function pageHasBackgroundVideo(manifest: PageEncodeContext['manifest']): boolean {
  return Boolean(manifest.pagePresentation?.backgroundVideo?.trim());
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('compose_still_failed'))),
        mime,
        quality
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error('compose_still_tainted'));
    }
  });
}

/**
 * The page's flattened background at timeline 0: every non-action layer, each video
 * on its first timeline frame. Same paint path as frame 0 of encodePageVideo.
 */
export async function composePageStill(
  root: HTMLElement,
  page: PageEncodeContext,
  opts?: { mime?: 'image/jpeg' | 'image/png' }
): Promise<Blob> {
  const mime = opts?.mime ?? 'image/jpeg';
  const srcW = Math.max(2, Math.round(root.offsetWidth || 360));
  const srcH = Math.max(2, Math.round(root.offsetHeight || 640));
  const { cw, ch } = rasterOutputSize(srcW, srcH);
  const sampler = new PageSampler(
    root,
    normalizeSection(page.section),
    pageHasBackgroundVideo(page.manifest),
    cw,
    ch
  );
  try {
    await sampler.sample(0);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    sampler.paint(ctx);
    return await canvasBlob(canvas, mime, mime === 'image/jpeg' ? 0.9 : undefined);
  } finally {
    sampler.dispose();
    setPlayheadSec(0);
  }
}

type VideoVariant = 'sd' | 'hd';

type ContainerChoice = {
  format: () => Mp4OutputFormat | WebMOutputFormat;
  contentType: string;
  video: VideoCodec;
  audio: AudioCodec | null;
};

function even(n: number): number {
  const r = Math.max(2, Math.round(n));
  return r % 2 ? r + 1 : r;
}

async function pickContainer(
  w: number,
  h: number,
  bitrate: number,
  withAudio: boolean
): Promise<ContainerChoice> {
  const options = [
    {
      format: () => new Mp4OutputFormat({ fastStart: 'in-memory' }),
      contentType: 'video/mp4',
      video: ['avc', 'vp9', 'av1'] as VideoCodec[],
      audio: ['aac', 'opus'] as AudioCodec[]
    },
    {
      format: () => new WebMOutputFormat(),
      contentType: 'video/webm',
      video: ['vp9', 'vp8', 'av1'] as VideoCodec[],
      audio: ['opus'] as AudioCodec[]
    }
  ];
  for (const option of options) {
    const video = await getFirstEncodableVideoCodec(option.video, {
      width: w,
      height: h,
      quality: new Quality({ bitrate })
    });
    if (!video) continue;
    const audio = withAudio
      ? await getFirstEncodableAudioCodec(option.audio, {
          numberOfChannels: PAGE_AUDIO_CHANNELS,
          sampleRate: PAGE_AUDIO_SAMPLE_RATE,
          quality: new Quality({ bitrate: AUDIO_BITRATE })
        })
      : null;
    return { format: option.format, contentType: option.contentType, video, audio };
  }
  throw new Error(VIDEO_ENCODER_UNAVAILABLE);
}

function silence(durationSec: number): AudioBuffer {
  return new AudioBuffer({
    length: Math.max(1, Math.ceil(durationSec * PAGE_AUDIO_SAMPLE_RATE)),
    numberOfChannels: PAGE_AUDIO_CHANNELS,
    sampleRate: PAGE_AUDIO_SAMPLE_RATE
  });
}

/**
 * Encode the mounted page (`root`, the compose export root) into poster + SD + HD
 * at the tier's CDN sizes, with the page's sound mixed into one audio track.
 */
export async function encodePageVideo(
  root: HTMLElement,
  page: PageEncodeContext,
  opts?: {
    /** Publish tier; sizes, duration cap and HD allowance. Defaults to Pen's publish plan. */
    tier?: PublishTierNotch;
    onProgress?: (pct: number) => void;
  }
): Promise<ComposePageVideoResult> {
  if (typeof VideoEncoder === 'undefined') throw new Error(VIDEO_ENCODER_UNAVAILABLE);
  const tier = opts?.tier ?? getPublishTier(PEN_PUBLISH_PLAN_ID);
  const section = normalizeSection(page.section);
  const hasBackgroundVideo = pageHasBackgroundVideo(page.manifest);
  const backgroundSrc = page.manifest.pagePresentation?.backgroundVideo?.trim();
  const clock = resolveTimelineDuration(
    section,
    undefined,
    backgroundSrc ? { pageBackgroundVideo: backgroundSrc } : {}
  );
  const times = frameTimes(Math.min(clock > 0 ? clock : 5, tier.maxDurationSec));
  const frameSec = 1 / PAGE_VIDEO_FPS;
  const durationSec = times.length * frameSec;
  const durationMs = Math.round(durationSec * 1000);
  const withAudio = pageAudioPlan(section, durationSec).length > 0;

  const srcW = Math.max(2, Math.round(root.offsetWidth || 360));
  const srcH = Math.max(2, Math.round(root.offsetHeight || 640));
  const sizes = composeOutputSizes(srcW, srcH, tier);
  const variantSize: Record<VideoVariant, { w: number; h: number }> = {
    hd: { w: even(sizes.master.w), h: even(sizes.master.h) },
    sd: { w: even(sizes.sd.w), h: even(sizes.sd.h) }
  };
  const master = sizes.hdOn ? variantSize.hd : variantSize.sd;

  const canvas = document.createElement('canvas');
  canvas.width = master.w;
  canvas.height = master.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  const sdCanvas = sizes.hdOn ? document.createElement('canvas') : canvas;
  if (sizes.hdOn) {
    sdCanvas.width = variantSize.sd.w;
    sdCanvas.height = variantSize.sd.h;
  }
  const sdCtx = sizes.hdOn ? sdCanvas.getContext('2d') : null;
  if (sizes.hdOn && !sdCtx) throw new Error('canvas_unavailable');

  const bitrate: Record<VideoVariant, number> = {
    hd: feedPreviewBitrate('hd', durationSec),
    sd: feedPreviewBitrate('sd', durationSec)
  };
  const containers: Partial<Record<VideoVariant, ContainerChoice>> = {};
  const done: Partial<Record<VideoVariant, EncodedPreview>> = {};
  let pending: VideoVariant[] = sizes.hdOn ? ['hd', 'sd'] : ['sd'];
  let poster: EncodedPreview | null = null;
  let audio: AudioBuffer | null | undefined;

  const sampler = new PageSampler(root, section, hasBackgroundVideo, master.w, master.h);
  try {
    for (let attempt = 0; attempt < FEED_PREVIEW_ENCODE_ATTEMPTS && pending.length; attempt++) {
      const runs: Array<{
        variant: VideoVariant;
        output: Output<Mp4OutputFormat | WebMOutputFormat, BufferTarget>;
        video: CanvasSource;
        sound: AudioBufferSource | null;
        choice: ContainerChoice;
      }> = [];
      for (const variant of pending) {
        const size = variantSize[variant];
        const choice =
          containers[variant] ??
          (containers[variant] = await pickContainer(size.w, size.h, bitrate[variant], withAudio));
        const output = new Output({ format: choice.format(), target: new BufferTarget() });
        const video = new CanvasSource(variant === 'hd' || !sizes.hdOn ? canvas : sdCanvas, {
          codec: choice.video,
          quality: new Quality({ bitrate: bitrate[variant] }),
          keyFrameInterval: KEY_FRAME_INTERVAL_SEC
        });
        output.addVideoTrack(video, { frameRate: PAGE_VIDEO_FPS });
        const sound = choice.audio
          ? new AudioBufferSource({
              codec: choice.audio,
              quality: new Quality({ bitrate: AUDIO_BITRATE })
            })
          : null;
        if (sound) output.addAudioTrack(sound);
        await output.start();
        runs.push({ variant, output, video, sound, choice });
      }

      try {
        for (let i = 0; i < times.length; i++) {
          const t = times[i]!;
          await sampler.sample(t);
          sampler.paint(ctx);
          if (sdCtx) sdCtx.drawImage(canvas, 0, 0, sdCanvas.width, sdCanvas.height);
          if (!poster) poster = await encodePosterFromCanvas(canvas, master.w, master.h, durationMs);
          await Promise.all(runs.map((run) => run.video.add(t, frameSec)));
          if (attempt === 0) opts?.onProgress?.(Math.min(95, ((i + 1) / times.length) * 95));
        }
        if (runs.some((run) => run.sound)) {
          if (audio === undefined) {
            audio = await mixPageAudio({
              section,
              durationSec,
              videoSrcByLayerId: sampler.videoSrcByLayerId
            });
          }
          const track = audio ?? silence(durationSec);
          for (const run of runs) if (run.sound) await run.sound.add(track);
        }
        await Promise.all(runs.map((run) => run.output.finalize()));
      } catch (e) {
        await Promise.all(runs.map((run) => run.output.cancel().catch(() => undefined)));
        throw e;
      }

      const nextPending: VideoVariant[] = [];
      for (const run of runs) {
        const buffer = run.output.target.buffer;
        if (!buffer?.byteLength) throw new Error('compose_empty_video');
        if (buffer.byteLength <= maxBytesForVariant(run.variant)) {
          const blob = new Blob([buffer], { type: run.choice.contentType });
          done[run.variant] = {
            variant: run.variant,
            blob,
            contentType: run.choice.contentType,
            byteSize: blob.size,
            width: variantSize[run.variant].w,
            height: variantSize[run.variant].h,
            durationMs
          };
        } else {
          bitrate[run.variant] = Math.floor(bitrate[run.variant] * FEED_PREVIEW_BITRATE_BACKOFF);
          nextPending.push(run.variant);
        }
      }
      pending = nextPending;
    }
  } finally {
    sampler.dispose();
    setPlayheadSec(0);
  }

  if (pending.length || !done.sd || !poster) {
    throw new Error('could_not_fit_preview_under_size_limit');
  }
  opts?.onProgress?.(100);
  return { poster, sd: done.sd, ...(done.hd ? { hd: done.hd } : {}) };
}
