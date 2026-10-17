/**
 * On-device adaptive feed preview encode (poster + SD + HD) under byte/duration ceilings.
 * Uses canvas / MediaRecorder — no server ffmpeg. Browser-only: call sites must have a DOM.
 */
import {
  FEED_PREVIEW_POSTER_MAX_BYTES,
  FEED_PREVIEW_POSTER_MAX_DIM,
  feedPreviewBitrate,
  feedPreviewTargetSize,
  maxBytesForVariant,
  maxHeightForVariant,
  softBytesForVariant,
  type FeedPreviewVariant,
  type PublishTierNotch,
} from './feedPreview';

export type EncodedPreview = {
  variant: FeedPreviewVariant;
  blob: Blob;
  contentType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
};

/** Bitrate backoff when a recording overshoots the variant hard cap. */
export const FEED_PREVIEW_BITRATE_BACKOFF = 0.65;
export const FEED_PREVIEW_ENCODE_ATTEMPTS = 3;

/** Prefer H.264 MP4 (better quality per byte, plays everywhere); WebM fallback. */
export function pickFeedRecorderMime(): { mimeType: string; contentType: string } {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mimeType of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      const contentType = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
      return { mimeType, contentType };
    }
  }
  return { mimeType: '', contentType: 'video/webm' };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    img.src = url;
  });
}

function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('video_load_failed'));
    };
    video.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('jpeg_encode_failed'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Poster JPEG from any drawable, capped at FEED_PREVIEW_POSTER_MAX_DIM and
 * FEED_PREVIEW_POSTER_MAX_BYTES with quality backoff.
 */
export async function encodePosterFromCanvas(
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  durationMs?: number
): Promise<EncodedPreview> {
  const scale = Math.min(1, FEED_PREVIEW_POSTER_MAX_DIM / Math.max(sourceW || 1, sourceH || 1));
  const w = Math.max(1, Math.round((sourceW || 1) * scale));
  const h = Math.max(1, Math.round((sourceH || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(source, 0, 0, w, h);
  let quality = 0.85;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > FEED_PREVIEW_POSTER_MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToJpegBlob(canvas, quality);
  }
  if (blob.size > FEED_PREVIEW_POSTER_MAX_BYTES) {
    throw new Error('poster_exceeds_max_bytes');
  }
  return {
    variant: 'poster',
    blob,
    contentType: 'image/jpeg',
    byteSize: blob.size,
    width: w,
    height: h,
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

/** Encode poster under hard max bytes with quality backoff. */
export async function encodePosterFromImage(file: Blob): Promise<EncodedPreview> {
  const img = await loadImage(file);
  return encodePosterFromCanvas(img, img.naturalWidth, img.naturalHeight);
}

export async function encodePosterFromVideo(file: Blob): Promise<EncodedPreview> {
  const video = await loadVideo(file);
  await new Promise<void>((r) => {
    if (video.readyState >= 2) r();
    else video.onloadeddata = () => r();
  });
  video.currentTime = Math.min(0.1, (video.duration || 1) * 0.05);
  await new Promise<void>((r) => {
    video.onseeked = () => r();
  });
  try {
    return await encodePosterFromCanvas(
      video,
      video.videoWidth || 1,
      video.videoHeight || 1,
      Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined
    );
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

/**
 * Adaptive video preview: if source fits budget, reuse; else MediaRecorder at constrained bitrate.
 */
export async function encodeVideoVariant(
  file: Blob,
  variant: 'sd' | 'hd',
  tier: PublishTierNotch
): Promise<EncodedPreview> {
  const maxBytes = maxBytesForVariant(variant);
  const soft = softBytesForVariant(variant);
  const maxHeight = maxHeightForVariant(variant, tier);
  const video = await loadVideo(file);
  await new Promise<void>((r) => {
    if (video.readyState >= 1) r();
    else video.onloadedmetadata = () => r();
  });
  const durationSec = video.duration;
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    URL.revokeObjectURL(video.src);
    throw new Error('invalid_video_duration');
  }
  if (durationSec > tier.maxDurationSec) {
    URL.revokeObjectURL(video.src);
    throw new Error('exceeds_tier_max_duration');
  }
  const durationMs = Math.round(durationSec * 1000);

  if (file.size <= soft && (video.videoHeight || 0) <= maxHeight) {
    URL.revokeObjectURL(video.src);
    return {
      variant,
      blob: file,
      contentType: file.type || 'video/mp4',
      byteSize: file.size,
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs,
    };
  }

  if (typeof MediaRecorder === 'undefined') {
    if (file.size <= maxBytes) {
      URL.revokeObjectURL(video.src);
      return {
        variant,
        blob: file,
        contentType: file.type || 'video/mp4',
        byteSize: file.size,
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs,
      };
    }
    URL.revokeObjectURL(video.src);
    throw new Error('mediarecorder_unavailable_and_source_too_large');
  }

  const srcH = video.videoHeight || maxHeight;
  const target =
    srcH <= maxHeight
      ? {
          w: Math.max(2, (video.videoWidth || 640) & ~1),
          h: Math.max(2, srcH & ~1),
        }
      : feedPreviewTargetSize(variant, tier, video.videoWidth || 16, video.videoHeight || 9);
  const { w, h } = target;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const { mimeType, contentType } = pickFeedRecorderMime();
  let videoBitsPerSecond = feedPreviewBitrate(variant, durationSec);

  for (let attempt = 0; attempt < FEED_PREVIEW_ENCODE_ATTEMPTS; attempt++) {
    const stream = canvas.captureStream(30);
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
      : new MediaRecorder(stream, { videoBitsPerSecond });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || contentType }));
      recorder.onerror = () => reject(new Error('mediarecorder_failed'));
    });
    recorder.start(200);
    await video.play().catch(() => undefined);
    const draw = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, w, h);
      requestAnimationFrame(draw);
    };
    draw();
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      setTimeout(resolve, (durationSec + 0.5) * 1000);
    });
    video.pause();
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    const blob = await done;
    if (blob.size <= maxBytes) {
      URL.revokeObjectURL(video.src);
      return {
        variant,
        blob,
        contentType: blob.type || contentType,
        byteSize: blob.size,
        width: w,
        height: h,
        durationMs,
      };
    }
    videoBitsPerSecond = Math.floor(videoBitsPerSecond * FEED_PREVIEW_BITRATE_BACKOFF);
    video.currentTime = 0;
  }

  URL.revokeObjectURL(video.src);
  throw new Error('could_not_fit_preview_under_size_limit');
}

export async function encodeFeedPreviewsForPublish(
  file: File | Blob,
  mimeType: string,
  tier: PublishTierNotch
): Promise<{ poster: EncodedPreview; sd?: EncodedPreview; hd?: EncodedPreview }> {
  const isVideo = mimeType.startsWith('video/');
  const isImage = mimeType.startsWith('image/');
  if (isImage) {
    const poster = await encodePosterFromImage(file);
    return { poster };
  }
  if (isVideo) {
    const poster = await encodePosterFromVideo(file);
    const sd = await encodeVideoVariant(file, 'sd', tier);
    let hd: EncodedPreview | undefined;
    if (tier.allowHd) {
      try {
        hd = await encodeVideoVariant(file, 'hd', tier);
      } catch {
        hd = undefined;
      }
    }
    return { poster, sd, hd };
  }
  throw new Error('unsupported_media_for_feed_preview');
}

const PLACEHOLDER_MAX_CHARS = 2800;

/** Tiny LQIP (or solid color fallback) for first-paint underlay. */
export async function encodeFeedPosterPlaceholder(
  posterBlob: Blob
): Promise<{ type: 'lqip'; data: string } | { type: 'color'; data: string } | undefined> {
  try {
    const img = await loadImage(posterBlob);
    const sample = document.createElement('canvas');
    sample.width = 1;
    sample.height = 1;
    const sctx = sample.getContext('2d');
    if (!sctx) return undefined;
    sctx.drawImage(img, 0, 0, 1, 1);
    const [r, g, b] = sctx.getImageData(0, 0, 1, 1).data;
    const color = `#${[r, g, b].map((n) => n!.toString(16).padStart(2, '0')).join('')}`;

    const tw = 24;
    const th = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * tw));
    const tiny = document.createElement('canvas');
    tiny.width = tw;
    tiny.height = th;
    const ctx = tiny.getContext('2d');
    if (!ctx) return { type: 'color', data: color };
    ctx.drawImage(img, 0, 0, tw, th);
    const dataUrl = tiny.toDataURL('image/jpeg', 0.45);
    if (dataUrl.length > PLACEHOLDER_MAX_CHARS) {
      return { type: 'color', data: color };
    }
    return { type: 'lqip', data: dataUrl };
  } catch {
    return undefined;
  }
}
