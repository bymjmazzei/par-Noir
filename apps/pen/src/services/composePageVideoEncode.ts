/**
 * On-device compose encode: record the Pen page surface (static backdrop +
 * live video layers) to a video blob + JPEG poster. No server ffmpeg.
 *
 * Only blob:/data: video masters are drawn — MediaStream mirrors and
 * cross-origin http frames taint canvas.toBlob / captureStream exports.
 */

import { rasterizeElementToPosterBlob, rasterizeElementSafeStill } from './rasterizePagePoster';

export const COMPOSE_VIDEO_MAX_DURATION_SEC = 60;
export const COMPOSE_VIDEO_MAX_EDGE = 1080;

export type ComposePageVideoResult = {
  videoBlob: Blob;
  videoContentType: string;
  posterBlob: Blob;
  width: number;
  height: number;
  durationMs: number;
};

export function isUntaintedMediaUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

function pickRecorderMime(): { mimeType: string; contentType: string } {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (const mimeType of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      const contentType = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
      return { mimeType, contentType };
    }
  }
  return { mimeType: '', contentType: 'video/webm' };
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
export function resolveUntaintedDrawableVideo(
  viewer: HTMLVideoElement
): HTMLVideoElement | null {
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
  const own = viewer.currentSrc || viewer.src || '';
  if (isUntaintedMediaUrl(own) && !viewer.srcObject) return viewer;
  return null;
}

/** Visible on-page video slots backed by blob:/data: masters only. */
export function collectUntaintedVideoSlots(root: HTMLElement): VideoSlot[] {
  const rootRect = root.getBoundingClientRect();
  const videos = Array.from(root.querySelectorAll('video')) as HTMLVideoElement[];
  const slots: VideoSlot[] = [];
  for (const el of videos) {
    if (el.dataset.penMediaDrawable === '1') continue;
    const drawable = resolveUntaintedDrawableVideo(el);
    if (!drawable) continue;
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
 * Flatten page chrome + TipTap text with transparent video holes, then encode
 * live video frames on top. Must include prose — safe-still-images-only left
 * gallery tiles white beside the video.
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

  const paintJpeg = async (jpeg: Blob) => {
    const url = URL.createObjectURL(jpeg);
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
    const jpeg = await rasterizeElementToPosterBlob(root, {
      maxEdge: COMPOSE_VIDEO_MAX_EDGE,
      punchVideos: true
    });
    await paintJpeg(jpeg);
  } catch {
    try {
      const jpeg = await rasterizeElementSafeStill(root, { maxEdge: COMPOSE_VIDEO_MAX_EDGE });
      await paintJpeg(jpeg);
    } catch {
      const fill = getComputedStyle(root).backgroundColor;
      ctx.fillStyle =
        fill && fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent' ? fill : '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
  }
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('poster_encode_failed'))),
        'image/jpeg',
        quality
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error('poster_canvas_tainted'));
    }
  });
}

/**
 * Encode the live Pen preview root into a composed video + JPEG poster.
 * `root` should be the page sheet / content box that contains Body + layers.
 */
export async function composePageToVideo(
  root: HTMLElement,
  opts?: { maxDurationSec?: number; onProgress?: (pct: number) => void }
): Promise<ComposePageVideoResult> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('mediarecorder_unavailable');
  }
  const maxDurationSec = opts?.maxDurationSec ?? COMPOSE_VIDEO_MAX_DURATION_SEC;
  const rect = root.getBoundingClientRect();
  const srcW = Math.max(2, Math.round(rect.width || root.clientWidth || 640));
  const srcH = Math.max(2, Math.round(rect.height || root.clientHeight || 360));
  const scale = Math.min(1, COMPOSE_VIDEO_MAX_EDGE / Math.max(srcW, srcH));
  const w = Math.max(2, Math.round(srcW * scale) & ~1);
  const h = Math.max(2, Math.round(srcH * scale) & ~1);
  const sx = w / srcW;
  const sy = h / srcH;

  const slots = collectUntaintedVideoSlots(root);
  if (!slots.length) {
    throw new Error('compose_no_untainted_video');
  }

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

  let durationSec = 0;
  for (const slot of slots) {
    const d = slot.el.duration;
    if (Number.isFinite(d) && d > durationSec) durationSec = d;
  }
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    durationSec = 5;
  }
  durationSec = Math.min(durationSec, maxDurationSec);

  const backdrop = await buildStaticBackdrop(root, w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('canvas_unavailable');

  // Poster at ~0.5s or first frame — only untainted draws
  const seekPoster = Math.min(0.5, durationSec * 0.1);
  for (const slot of slots) {
    try {
      slot.el.currentTime = seekPoster;
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
  ctx.drawImage(backdrop, 0, 0);
  for (const slot of slots) {
    ctx.drawImage(slot.el, slot.x * sx, slot.y * sy, slot.w * sx, slot.h * sy);
  }
  const posterBlob = await canvasToJpegBlob(canvas);

  for (const slot of slots) {
    try {
      slot.el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }

  const { mimeType, contentType } = pickRecorderMime();
  const stream = canvas.captureStream(30);
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 })
    : new MediaRecorder(stream, { videoBitsPerSecond: 2_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () =>
      resolve(new Blob(chunks, { type: recorder.mimeType || contentType }));
    recorder.onerror = () => reject(new Error('mediarecorder_failed'));
  });

  opts?.onProgress?.(5);
  recorder.start(200);

  await Promise.all(slots.map((s) => s.el.play().catch(() => undefined)));

  const started = performance.now();
  let raf = 0;
  let framesDrawn = 0;
  const draw = () => {
    ctx.drawImage(backdrop, 0, 0);
    for (const slot of slots) {
      if (slot.el.readyState >= 2) {
        ctx.drawImage(slot.el, slot.x * sx, slot.y * sy, slot.w * sx, slot.h * sy);
        framesDrawn += 1;
      }
    }
    const elapsed = (performance.now() - started) / 1000;
    opts?.onProgress?.(Math.min(95, 5 + (elapsed / durationSec) * 90));
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => resolve(), (durationSec + 0.35) * 1000);
    const checkEnded = () => {
      if (slots.every((s) => s.el.ended || s.el.paused)) {
        window.clearTimeout(timer);
        resolve();
      }
    };
    for (const s of slots) {
      s.el.addEventListener('ended', checkEnded);
    }
  });

  cancelAnimationFrame(raf);
  for (const s of slots) {
    s.el.pause();
  }
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  const videoBlob = await stopped;
  if (!videoBlob.size) throw new Error('compose_empty_video');
  if (framesDrawn < 1) throw new Error('compose_no_video_frames');
  opts?.onProgress?.(100);

  return {
    videoBlob,
    videoContentType: videoBlob.type || contentType,
    posterBlob,
    width: w,
    height: h,
    durationMs: Math.round(durationSec * 1000)
  };
}
