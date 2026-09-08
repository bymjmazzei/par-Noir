/**
 * On-device adaptive feed preview encode (poster + SD + HD) under byte/duration ceilings.
 * Uses canvas / MediaRecorder — no server ffmpeg.
 */
import {
  FEED_PREVIEW_HD_MAX_HEIGHT_DEFAULT,
  FEED_PREVIEW_POSTER_MAX_BYTES,
  FEED_PREVIEW_SD_MAX_HEIGHT,
  softBytesForVariant,
  maxBytesForVariant,
  type FeedPreviewVariant,
  type PublishTierNotch,
} from '@par-noir/aggregator-domain';

export type EncodedPreview = {
  variant: FeedPreviewVariant;
  blob: Blob;
  contentType: string;
  byteSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
};

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

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('jpeg_encode_failed'))),
      'image/jpeg',
      quality
    );
  });
}

/** Encode poster under hard max bytes with quality backoff. */
export async function encodePosterFromImage(file: Blob): Promise<EncodedPreview> {
  const img = await loadImage(file);
  const maxDim = 720;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(img, 0, 0, w, h);
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
  };
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
  const maxDim = 720;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth || 1, video.videoHeight || 1));
  const w = Math.max(1, Math.round((video.videoWidth || 1) * scale));
  const h = Math.max(1, Math.round((video.videoHeight || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(video, 0, 0, w, h);
  URL.revokeObjectURL(video.src);
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
    durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
  };
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
  const maxHeight =
    variant === 'hd' ? Math.min(tier.maxHeight, 1080) : Math.min(tier.maxHeight, FEED_PREVIEW_SD_MAX_HEIGHT);
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

  const scale = Math.min(1, maxHeight / Math.max(video.videoHeight || maxHeight, 1));
  const w = Math.max(2, Math.round((video.videoWidth || 640) * scale) & ~1);
  const h = Math.max(2, Math.round((video.videoHeight || 360) * scale) & ~1);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const targetBits = Math.floor((soft * 8) / Math.max(durationSec, 0.5));
  let videoBitsPerSecond = Math.min(Math.max(targetBits, 250_000), variant === 'hd' ? 2_500_000 : 1_200_000);

  for (let attempt = 0; attempt < 3; attempt++) {
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
      videoBitsPerSecond,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
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
        contentType: blob.type || 'video/webm',
        byteSize: blob.size,
        width: w,
        height: h,
        durationMs,
      };
    }
    videoBitsPerSecond = Math.floor(videoBitsPerSecond * 0.65);
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
        hd = await encodeVideoVariant(file, 'hd', {
          ...tier,
          maxHeight: Math.max(tier.maxHeight, FEED_PREVIEW_HD_MAX_HEIGHT_DEFAULT),
        });
      } catch {
        hd = undefined;
      }
    }
    return { poster, sd, hd };
  }
  // Non-AV: poster from empty — reject for public video path
  throw new Error('unsupported_media_for_feed_preview');
}
