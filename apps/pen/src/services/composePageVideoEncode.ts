/**
 * On-device compose encode: record the Pen page surface (static backdrop +
 * live video layers) into the CDN feed preview variants (HD + SD + poster).
 * Output size comes from the publish tier, never from the on-screen preview size.
 * No server ffmpeg.
 *
 * Only blob:/data: video masters are drawn — MediaStream mirrors and
 * cross-origin http frames taint canvas.toBlob / captureStream exports.
 */

import {
  FEED_PREVIEW_BITRATE_BACKOFF,
  FEED_PREVIEW_ENCODE_ATTEMPTS,
  encodePosterFromCanvas,
  feedPreviewBitrate,
  feedPreviewTargetSize,
  getPublishTier,
  maxBytesForVariant,
  pickFeedRecorderMime,
  type EncodedPreview,
  type PublishTierNotch
} from '@par-noir/aggregator-domain';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import {
  rasterOutputSize,
  rasterizeElementToPosterBlob,
  rasterizeElementSafeStill,
  visualScale
} from './rasterizePagePoster';
import { playbackMode } from './playbackMode';
import { PEN_PUBLISH_PLAN_ID } from './penPublishPlan';

export type ComposePageVideoResult = {
  poster: EncodedPreview;
  sd: EncodedPreview;
  hd?: EncodedPreview;
};

/** Largest composed variant — the canonical file (Drive envelope, download, gallery). */
export function composedMaster(result: ComposePageVideoResult): EncodedPreview {
  return result.hd ?? result.sd;
}

export function isUntaintedMediaUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

function waitVideoReady(video: HTMLVideoElement, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && (video.videoWidth > 0 || video.duration > 0)) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('compose_video_load_timeout'));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('compose_video_load_failed'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadeddata', onOk);
      video.removeEventListener('canplay', onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadeddata', onOk);
    video.addEventListener('canplay', onOk);
    video.addEventListener('error', onErr);
  });
}

export type VideoSlot = {
  el: HTMLVideoElement;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Prefer the blob-backed master video over a captureStream mirror viewer.
 * Returns null when no untainted drawable exists (caller must not draw).
 */
export function resolveUntaintedDrawableVideo(viewer: HTMLElement): HTMLVideoElement | null {
  const key = viewer.dataset.penMediaKey;
  if (key) {
    const master = document.querySelector(
      `video[data-pen-media-drawable="1"][data-pen-media-key="${CSS.escape(key)}"]`
    );
    if (master instanceof HTMLVideoElement) {
      const src = master.currentSrc || master.src || '';
      if (isUntaintedMediaUrl(src)) return master;
    }
  }
  if (viewer instanceof HTMLVideoElement) {
    const own = viewer.currentSrc || viewer.src || '';
    if (isUntaintedMediaUrl(own) && !viewer.srcObject) return viewer;
  }
  return null;
}

/** Visible on-page video slots backed by blob:/data: masters only. */
export function collectUntaintedVideoSlots(root: HTMLElement): VideoSlot[] {
  const rootRect = root.getBoundingClientRect();
  const videos = Array.from(root.querySelectorAll('video, [data-pen-media-key]'));
  const slots: VideoSlot[] = [];
  const seen = new Set<HTMLElement>();
  for (const el of videos) {
    if (!(el instanceof HTMLElement) || seen.has(el)) continue;
    seen.add(el);
    if (el.dataset.penMediaDrawable === '1') continue;
    const drawable = resolveUntaintedDrawableVideo(el);
    if (!drawable) continue;
    if (playbackMode() === 'publish') {
      const marked = el.closest('[data-pen-playback]');
      if (!(marked instanceof HTMLElement) || marked.dataset.penPlayback !== 'publish') continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    slots.push({
      el: drawable,
      x: r.left - rootRect.left,
      y: r.top - rootRect.top,
      w: r.width,
      h: r.height
    });
  }
  return slots;
}

export function rootHasUntaintedPlayableVideo(root: HTMLElement): boolean {
  return collectUntaintedVideoSlots(root).length > 0;
}

/**
 * Output pixel sizes for a compose of `root`: master (HD when the tier allows it,
 * else SD) and SD, both at the root's aspect. On-screen size only sets the aspect.
 */
export function composeOutputSizes(
  rootW: number,
  rootH: number,
  tier: PublishTierNotch
): { master: { w: number; h: number }; sd: { w: number; h: number }; hdOn: boolean } {
  const hdOn = tier.allowHd;
  const sd = feedPreviewTargetSize('sd', tier, rootW, rootH);
  const master = hdOn ? feedPreviewTargetSize('hd', tier, rootW, rootH) : sd;
  return { master, sd, hdOn };
}

/**
 * Flatten page chrome + TipTap text with transparent video holes at the output
 * size, then encode live video frames on top. Must include prose — safe-still-images-only
 * left gallery tiles white beside the video.
 */
async function buildStaticBackdrop(
  root: HTMLElement,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const paintImage = async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('compose_backdrop_load_failed'));
        i.src = url;
      });
      ctx.drawImage(img, 0, 0, width, height);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  try {
    const png = await rasterizeElementToPosterBlob(root, {
      targetWidth: width,
      targetHeight: height,
      punchVideos: true,
      mime: 'image/png'
    });
    await paintImage(png);
  } catch {
    try {
      const jpeg = await rasterizeElementSafeStill(root, {
        targetWidth: width,
        targetHeight: height
      });
      await paintImage(jpeg);
    } catch {
      const fill = getComputedStyle(root).backgroundColor;
      ctx.fillStyle =
        fill && fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent' ? fill : '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
  }
  return canvas;
}

/** Drive editor playhead for layer poses during encode. Do not seek shared pen-layer masters here. */
function sampleTimeline(
  opts: {
    onSample?: (timeSec: number) => void;
  },
  _root: HTMLElement,
  timeSec: number
) {
  opts.onSample?.(timeSec);
}

async function seekSlots(slots: VideoSlot[], timeSec: number): Promise<void> {
  for (const slot of slots) {
    try {
      slot.el.currentTime = timeSec;
      await new Promise<void>((r) => {
        const done = () => {
          slot.el.removeEventListener('seeked', done);
          r();
        };
        slot.el.addEventListener('seeked', done);
        setTimeout(r, 400);
      });
    } catch {
      /* ignore */
    }
  }
}

/** Flattened JPEG of the page with each video's first frame in its slot. No encode. */
export async function composePageStill(root: HTMLElement): Promise<Blob> {
  const srcW = Math.max(2, Math.round(root.offsetWidth || 360));
  const srcH = Math.max(2, Math.round(root.offsetHeight || 640));
  const { cw, ch, sx: layoutSx, sy: layoutSy } = rasterOutputSize(srcW, srcH);
  const zoom = visualScale(root);
  const sx = layoutSx / zoom;
  const sy = layoutSy / zoom;
  const slots = collectUntaintedVideoSlots(root);
  const canvas = await buildStaticBackdrop(root, cw, ch);
  if (slots.length) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    const resume = slots.map((slot) => ({ el: slot.el, time: slot.el.currentTime }));
    await seekSlots(slots, 0);
    for (const slot of slots) {
      if (slot.el.readyState >= 2) {
        ctx.drawImage(slot.el, slot.x * sx, slot.y * sy, slot.w * sx, slot.h * sy);
      }
    }
    for (const { el, time } of resume) {
      try {
        el.currentTime = time;
      } catch {
        /* ignore */
      }
    }
  }
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('compose_still_failed'))),
        'image/jpeg',
        0.85
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error('compose_still_tainted'));
    }
  });
}

type VideoVariant = 'sd' | 'hd';

/**
 * Encode the live Pen preview root into poster + SD + HD at the tier's CDN sizes.
 * `root` should be the page sheet / content box that contains Body + layers.
 */
export async function composePageToVideo(
  root: HTMLElement,
  opts?: {
    /** Publish tier; sizes, duration cap and HD allowance. Defaults to Pen's publish plan. */
    tier?: PublishTierNotch;
    maxDurationSec?: number;
    onProgress?: (pct: number) => void;
    clockDurationSec?: number;
    onSample?: (timeSec: number) => void;
    /** Section clock — seeks videos and drives playhead via onSample. */
    section?: PenSectionContent;
    /** Record timeline-length video with no video layers (graphics / action-only inert). */
    allowInertOnly?: boolean;
  }
): Promise<ComposePageVideoResult> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('mediarecorder_unavailable');
  }
  const tier = opts?.tier ?? getPublishTier(PEN_PUBLISH_PLAN_ID);
  const rect = root.getBoundingClientRect();
  const srcW = Math.max(2, Math.round(rect.width || root.clientWidth || 360));
  const srcH = Math.max(2, Math.round(rect.height || root.clientHeight || 640));
  const sizes = composeOutputSizes(srcW, srcH, tier);
  const { w, h } = sizes.master;
  const sx = w / srcW;
  const sy = h / srcH;

  let slots = collectUntaintedVideoSlots(root);
  const inertOnly = Boolean(opts?.allowInertOnly && slots.length === 0);
  if (!slots.length && !inertOnly) {
    throw new Error('compose_no_untainted_video');
  }

  const timelineLocked = Boolean(opts?.section && (opts.onSample || opts.clockDurationSec));

  if (!inertOnly) {
    for (const slot of slots) {
      slot.el.muted = true;
      slot.el.playsInline = true;
      try {
        slot.el.currentTime = 0;
      } catch {
        /* ignore */
      }
      await waitVideoReady(slot.el);
    }
  }

  let durationSec = 0;
  if (opts?.clockDurationSec && opts.clockDurationSec > 0) {
    durationSec = opts.clockDurationSec;
  } else if (!inertOnly) {
    for (const slot of slots) {
      const d = slot.el.duration;
      if (Number.isFinite(d) && d > durationSec) durationSec = d;
    }
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      durationSec = 5;
    }
  } else {
    durationSec = 5;
  }
  durationSec = Math.min(durationSec, tier.maxDurationSec, opts?.maxDurationSec ?? Infinity);
  const durationMs = Math.round(durationSec * 1000);

  sampleTimeline(opts || {}, root, 0);
  let backdrop = await buildStaticBackdrop(root, w, h);
  let backdropTicket = 0;
  let backdropInFlight = false;

  const scheduleBackdropRefresh = () => {
    if (!opts?.onSample || backdropInFlight) return;
    backdropInFlight = true;
    const ticket = ++backdropTicket;
    void buildStaticBackdrop(root, w, h)
      .then((next) => {
        if (ticket === backdropTicket) backdrop = next;
      })
      .catch(() => {
        /* keep last backdrop */
      })
      .finally(() => {
        backdropInFlight = false;
      });
  };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) {
    throw new Error('canvas_unavailable');
  }
  const sdCanvas = sizes.hdOn ? document.createElement('canvas') : canvas;
  if (sizes.hdOn) {
    sdCanvas.width = sizes.sd.w;
    sdCanvas.height = sizes.sd.h;
  }
  const sdCtx = sizes.hdOn ? sdCanvas.getContext('2d') : null;
  if (sizes.hdOn && !sdCtx) {
    throw new Error('canvas_unavailable');
  }

  const paintFrame = (drawSlots: VideoSlot[]) => {
    ctx.drawImage(backdrop, 0, 0);
    if (!inertOnly) {
      for (const slot of drawSlots) {
        if (slot.el.readyState >= 2) {
          ctx.drawImage(slot.el, slot.x * sx, slot.y * sy, slot.w * sx, slot.h * sy);
        }
      }
    }
    if (sdCtx) sdCtx.drawImage(canvas, 0, 0, sdCanvas.width, sdCanvas.height);
  };

  const seekPoster = Math.min(0.5, durationSec * 0.1);
  if (!inertOnly && !timelineLocked) {
    await seekSlots(slots, seekPoster);
  } else if (!inertOnly) {
    sampleTimeline(opts || {}, root, seekPoster);
    slots = collectUntaintedVideoSlots(root);
  }
  paintFrame(slots);
  const poster = await encodePosterFromCanvas(canvas, w, h, durationMs);

  const { mimeType, contentType } = pickFeedRecorderMime();
  const bitrate: Record<VideoVariant, number> = {
    hd: feedPreviewBitrate('hd', durationSec),
    sd: feedPreviewBitrate('sd', durationSec)
  };
  const variantSize: Record<VideoVariant, { w: number; h: number }> = {
    hd: sizes.master,
    sd: sizes.sd
  };
  const done: Partial<Record<VideoVariant, EncodedPreview>> = {};
  let pending: VideoVariant[] = sizes.hdOn ? ['hd', 'sd'] : ['sd'];

  for (let attempt = 0; attempt < FEED_PREVIEW_ENCODE_ATTEMPTS && pending.length; attempt++) {
    if (!inertOnly && !timelineLocked) {
      await seekSlots(slots, 0);
    } else if (!inertOnly) {
      sampleTimeline(opts || {}, root, 0);
      slots = collectUntaintedVideoSlots(root);
    }

    const recordings = pending.map((variant) => {
      const source = variant === 'hd' || !sizes.hdOn ? canvas : sdCanvas;
      const stream = source.captureStream(30);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate[variant] })
        : new MediaRecorder(stream, { videoBitsPerSecond: bitrate[variant] });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: recorder.mimeType || contentType }));
        recorder.onerror = () => reject(new Error('mediarecorder_failed'));
      });
      return { variant, stream, recorder, stopped };
    });

    opts?.onProgress?.(5);
    for (const r of recordings) r.recorder.start(200);

    if (!inertOnly) {
      await Promise.all(slots.map((s) => s.el.play().catch(() => undefined)));
    }

    const started = performance.now();
    let raf = 0;
    let framesDrawn = 0;
    const draw = () => {
      const elapsed = (performance.now() - started) / 1000;
      const t = Math.min(durationSec, elapsed);
      sampleTimeline(opts || {}, root, t);
      scheduleBackdropRefresh();
      const live =
        !inertOnly && (timelineLocked || opts?.onSample) ? collectUntaintedVideoSlots(root) : slots;
      paintFrame(live.length ? live : slots);
      framesDrawn += 1;
      opts?.onProgress?.(Math.min(95, 5 + (elapsed / durationSec) * 90));
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), (durationSec + 0.35) * 1000);
    });

    cancelAnimationFrame(raf);
    if (!inertOnly) {
      for (const s of slots) s.el.pause();
    }
    for (const r of recordings) {
      r.recorder.stop();
      r.stream.getTracks().forEach((t) => t.stop());
    }
    if (framesDrawn < 1) throw new Error('compose_no_video_frames');

    const nextPending: VideoVariant[] = [];
    for (const r of recordings) {
      const blob = await r.stopped;
      if (!blob.size) throw new Error('compose_empty_video');
      if (blob.size <= maxBytesForVariant(r.variant)) {
        done[r.variant] = {
          variant: r.variant,
          blob,
          contentType: blob.type || contentType,
          byteSize: blob.size,
          width: variantSize[r.variant].w,
          height: variantSize[r.variant].h,
          durationMs
        };
      } else {
        bitrate[r.variant] = Math.floor(bitrate[r.variant] * FEED_PREVIEW_BITRATE_BACKOFF);
        nextPending.push(r.variant);
      }
    }
    pending = nextPending;
  }

  if (pending.length || !done.sd) {
    throw new Error('could_not_fit_preview_under_size_limit');
  }
  opts?.onProgress?.(100);
  return { poster, sd: done.sd, ...(done.hd ? { hd: done.hd } : {}) };
}
