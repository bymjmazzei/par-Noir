/**
 * On-device compose encode: record the Pen page surface (static backdrop +
 * live video layers) to a video blob + JPEG poster. No server ffmpeg.
 */

import { rasterizeElementToPosterBlob } from './rasterizePagePoster';

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

function waitVideoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('compose_video_load_failed'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadeddata', onOk);
    video.addEventListener('error', onErr);
  });
}

type VideoSlot = {
  el: HTMLVideoElement;
  x: number;
  y: number;
  w: number;
  h: number;
};

function collectVideoSlots(root: HTMLElement): VideoSlot[] {
  const rootRect = root.getBoundingClientRect();
  const videos = Array.from(root.querySelectorAll('video')) as HTMLVideoElement[];
  const slots: VideoSlot[] = [];
  for (const el of videos) {
    const src = el.currentSrc || el.src || '';
    if (!src) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    slots.push({
      el,
      x: r.left - rootRect.left,
      y: r.top - rootRect.top,
      w: r.width,
      h: r.height
    });
  }
  return slots;
}

async function buildStaticBackdrop(
  root: HTMLElement,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('video').forEach((v) => {
    const ph = document.createElement('div');
    ph.style.width = '100%';
    ph.style.height = '100%';
    ph.style.background = '#111';
    v.replaceWith(ph);
  });
  // Off-DOM host for rasterize sizing
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${root.offsetWidth}px;height:${root.offsetHeight}px;overflow:hidden;pointer-events:none;opacity:0;`;
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const jpeg = await rasterizeElementToPosterBlob(clone, { maxEdge: COMPOSE_VIDEO_MAX_EDGE });
    const url = URL.createObjectURL(jpeg);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('compose_backdrop_load_failed'));
        i.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_unavailable');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    host.remove();
  }
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

  const slots = collectVideoSlots(root);
  if (!slots.length) {
    throw new Error('compose_no_video_elements');
  }

  for (const slot of slots) {
    slot.el.muted = true;
    slot.el.playsInline = true;
    slot.el.currentTime = 0;
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
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  // Poster at ~0.5s or first frame
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
  const posterBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('poster_encode_failed'))),
      'image/jpeg',
      0.85
    );
  });

  for (const slot of slots) {
    slot.el.currentTime = 0;
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
  const draw = () => {
    ctx.drawImage(backdrop, 0, 0);
    for (const slot of slots) {
      if (slot.el.readyState >= 2) {
        ctx.drawImage(slot.el, slot.x * sx, slot.y * sy, slot.w * sx, slot.h * sy);
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
