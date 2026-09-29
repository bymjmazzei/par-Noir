/**
 * One 720-long-edge proxy per original. Built once, stored as penlocal media.
 * Playback of the original stays on publish.
 */

import {
  publishPlaybackSrc,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import { downloadCloudMediaBlob } from './penAttach';
import {
  isPenMediaRef,
  parsePenMediaFileId,
  putLocalMedia,
  putLocalMediaForDriveFile,
  resolvePenMediaSrc
} from './penLocalMedia';

export const EDIT_PROXY_LONG_EDGE = 720;

const ready = new Map<string, string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();

export function proxySize(
  width: number,
  height: number
): { width: number; height: number; reuse: boolean } {
  const long = Math.max(width, height);
  if (!(long > 0) || long <= EDIT_PROXY_LONG_EDGE) {
    return {
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(height)),
      reuse: true
    };
  }
  const scale = EDIT_PROXY_LONG_EDGE / long;
  return {
    width: Math.max(2, Math.round(width * scale) & ~1),
    height: Math.max(2, Math.round(height * scale) & ~1),
    reuse: false
  };
}

/** Original ref when the frame is already within 720. Null when a proxy must be encoded. */
export function proxyRefForFrame(
  originalRef: string,
  width: number,
  height: number
): string | null {
  const sized = proxySize(width, height);
  return sized.reuse ? originalRef : null;
}

/** Original ref that still needs a proxy, or null when this layer is not a video or already has one. */
export function layerOriginalForProxy(layer: PenPageLayer): string | null {
  if (layer.editProxySrc?.trim()) return null;
  if (layer.kind === 'image') return null;
  if (layer.kind !== 'video' && !layer.backgroundVideo?.trim()) return null;
  return publishPlaybackSrc(layer) || null;
}

function cacheKey(docId: string, originalRef: string): string {
  return `${docId}\n${originalRef}`;
}

function pickRecorderMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (const mimeType of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return '';
}

function waitVideoMeta(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1 && video.videoWidth > 0) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('proxy_metadata_timeout'));
    }, 15_000);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('proxy_metadata_failed'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onOk);
    video.addEventListener('error', onErr);
  });
}

/**
 * Play the original once into a 720 canvas. Returns 'reuse' when no second file is needed.
 * Returns null when recording fails — the caller leaves editProxySrc unset.
 */
export async function encodeEditProxyBlob(fileUrl: string): Promise<Blob | 'reuse' | null> {
  if (typeof document === 'undefined') return null;
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  video.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
  video.src = fileUrl;
  document.body.appendChild(video);
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  try {
    await waitVideoMeta(video);
    const sized = proxySize(video.videoWidth, video.videoHeight);
    if (sized.reuse) return 'reuse';
    if (typeof MediaRecorder === 'undefined') return null;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = sized.width;
    canvas.height = sized.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') return null;
    const mimeType = pickRecorderMime();
    stream = canvas.captureStream(30);
    const capture = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    try {
      const audio = capture.captureStream?.().getAudioTracks()[0];
      if (audio) stream.addTrack(audio);
    } catch {
      /* picture-only proxy */
    }
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const done = new Promise<Blob>((resolve, reject) => {
      recorder!.onstop = () =>
        resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType || 'video/webm' }));
      recorder!.onerror = () => reject(new Error('proxy_record_failed'));
    });
    recorder.start(200);
    await video.play();
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, (duration + 0.5) * 1000);
      const draw = () => {
        if (video.ended || video.paused) return;
        ctx.drawImage(video, 0, 0, sized.width, sized.height);
        requestAnimationFrame(draw);
      };
      video.onended = () => {
        window.clearTimeout(timer);
        resolve();
      };
      draw();
    });
    video.pause();
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await done;
    if (!blob.size) return null;
    return blob;
  } catch {
    return null;
  } finally {
    try {
      video.pause();
    } catch {
      /* already gone */
    }
    video.removeAttribute('src');
    video.load();
    video.remove();
    stream?.getTracks().forEach((track) => track.stop());
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}

async function playableUrl(
  docId: string,
  originalRef: string,
  session?: { pnIdentifier: string } | null
): Promise<string | null> {
  const resolved = await resolvePenMediaSrc(originalRef, docId);
  if (resolved) return resolved;
  if (!isPenMediaRef(originalRef) || !session?.pnIdentifier) return null;
  const fileId = parsePenMediaFileId(originalRef);
  if (!fileId) return null;
  const { blob } = await downloadCloudMediaBlob(fileId, session.pnIdentifier, docId);
  const put = await putLocalMediaForDriveFile({ docId, fileId, blob });
  return put.blobUrl;
}

async function buildProxy(params: {
  docId: string;
  originalRef: string;
  session?: { pnIdentifier: string } | null;
}): Promise<string | null> {
  const key = cacheKey(params.docId, params.originalRef);
  if (ready.has(key)) return ready.get(key) || null;
  if (failed.has(key)) return null;
  try {
    const url = await playableUrl(params.docId, params.originalRef, params.session);
    if (!url) return null;
    const encoded = await encodeEditProxyBlob(url);
    if (encoded === 'reuse') {
      ready.set(key, params.originalRef);
      return params.originalRef;
    }
    if (!encoded) {
      failed.add(key);
      return null;
    }
    const put = await putLocalMedia({ docId: params.docId, blob: encoded });
    ready.set(key, put.ref);
    return put.ref;
  } catch {
    failed.add(key);
    return null;
  }
}

/** Resolve or build the proxy ref. One attempt per original per session. Does not re-encode. */
export function ensureEditProxy(params: {
  docId: string;
  originalRef: string;
  session?: { pnIdentifier: string } | null;
}): Promise<string | null> {
  const key = cacheKey(params.docId, params.originalRef);
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = buildProxy(params).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}
