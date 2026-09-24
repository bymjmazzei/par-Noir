/**
 * Attach helpers: device file, Drive cloud list/download, URL.
 * Image/video bytes uploaded to Drive are AES-GCM envelopes under docKey.
 */

import { encryptMediaBytes, decryptMediaBytes, isDmEnvelope } from '@par-noir/dm-crypto';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import { loadDocKey, mintDocKey } from './penDocCrypto';

export function pickDeviceImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      resolve(input.files?.[0] || null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function pickDeviceVideoFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => {
      resolve(input.files?.[0] || null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

/** Natural width/height ratio for a playable media src (blob:/http:/data:). */
export function probeMediaAspect(
  src: string,
  kind: 'image' | 'video'
): Promise<number> {
  if (kind === 'image') {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        resolve(w > 0 && h > 0 ? w / h : 1);
      };
      img.onerror = () => resolve(1);
      img.src = src;
    });
  }
  return probeVideoDisplayAspect(src);
}

/**
 * Display aspect (width/height) after orientation — phone videos often store
 * landscape coded size with a 90° rotation; `videoWidth`/`videoHeight` alone lie.
 */
export async function probeVideoDisplayAspect(src: string): Promise<number> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');

  const waitReady = () =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      video.addEventListener('loadeddata', finish, { once: true });
      video.addEventListener('error', finish, { once: true });
      window.setTimeout(finish, 800);
      video.src = src;
      try {
        void video.load();
      } catch {
        finish();
      }
    });

  await waitReady();
  const oriented = await readOrientedAspect(video);
  try {
    video.removeAttribute('src');
    video.load();
  } catch {
    /* ignore */
  }
  return oriented ?? 16 / 9;
}

/** Prefer oriented frame size over coded videoWidth/videoHeight. */
export async function readOrientedAspect(
  video: HTMLVideoElement
): Promise<number | null> {
  const codedW = video.videoWidth || 0;
  const codedH = video.videoHeight || 0;

  // Layout probe: width fixed / height:auto lets the browser apply rotation.
  const layoutAspect = measureLaidOutVideoAspect(video);
  if (layoutAspect) return layoutAspect;

  // MP4 track matrix — phone portrait often coded landscape + 90°/270°.
  const rot = await rotationDegreesFromVideo(video);
  if ((rot === 90 || rot === 270) && codedW > 0 && codedH > 0) {
    return codedH / codedW;
  }

  // createImageBitmap may apply container rotation → display pixels.
  try {
    if (typeof createImageBitmap === 'function' && codedW > 0 && codedH > 0) {
      const bmp = await createImageBitmap(video);
      const w = bmp.width;
      const h = bmp.height;
      bmp.close();
      if (w > 0 && h > 0) return w / h;
    }
  } catch {
    /* fall through */
  }

  // VideoFrame.displayWidth/Height account for rotation when available.
  try {
    const VF = (globalThis as unknown as { VideoFrame?: typeof VideoFrame }).VideoFrame;
    if (VF && codedW > 0 && codedH > 0) {
      const frame = new VF(video);
      const w = frame.displayWidth || frame.codedWidth;
      const h = frame.displayHeight || frame.codedHeight;
      frame.close();
      if (w > 0 && h > 0) return w / h;
    }
  } catch {
    /* fall through */
  }

  if (codedW > 0 && codedH > 0) return codedW / codedH;
  return null;
}

async function rotationDegreesFromVideo(video: HTMLVideoElement): Promise<number> {
  const src = video.currentSrc || video.src;
  if (!src) return 0;
  try {
    const res = await fetch(src);
    if (!res.ok) return 0;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return readMp4RotationDegrees(bytes);
  } catch {
    return 0;
  }
}

/** Read QuickTime/MPEG-4 tkhd matrix rotation (0 / 90 / 180 / 270). */
export function readMp4RotationDegrees(bytes: Uint8Array): number {
  const n = bytes.byteLength;
  for (let i = 0; i + 8 < n; i++) {
    if (
      bytes[i] === 0x74 &&
      bytes[i + 1] === 0x6b &&
      bytes[i + 2] === 0x68 &&
      bytes[i + 3] === 0x64
    ) {
      const version = bytes[i + 4] ?? 0;
      let o = i + 4 + 4; // skip version+flags
      if (version === 1) {
        o += 8 + 8 + 4 + 4 + 8 + 8;
      } else {
        o += 4 + 4 + 4 + 4 + 4 + 8;
      }
      o += 2 + 2 + 2 + 2; // layer, alternate_group, volume, reserved
      if (o + 16 > n) continue;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const a = view.getInt32(o);
      const b = view.getInt32(o + 4);
      const c = view.getInt32(o + 8);
      const d = view.getInt32(o + 12);
      if (a === 0 && d === 0) {
        if (b > 0 && c < 0) return 90;
        if (b < 0 && c > 0) return 270;
      }
      if (b === 0 && c === 0 && a < 0 && d < 0) return 180;
      // First tkhd is enough (video track typically precedes others meaningfully).
      return 0;
    }
  }
  return 0;
}

/**
 * Temporarily lay out the video off-screen so CSS can apply rotation and we
 * can read the displayed box (fixes phone portrait files stored as landscape).
 */
function measureLaidOutVideoAspect(video: HTMLVideoElement): number | null {
  if (typeof document === 'undefined') return null;
  const codedW = video.videoWidth || 0;
  const codedH = video.videoHeight || 0;
  if (!(codedW > 0 && codedH > 0)) return null;

  const needsAttach = !document.body.contains(video);
  if (needsAttach) document.body.appendChild(video);
  const prevStyle = video.getAttribute('style');
  try {
    video.setAttribute(
      'style',
      'position:fixed;left:-10000px;top:0;width:160px;height:auto;max-height:none;opacity:0;pointer-events:none;visibility:hidden;'
    );
    void video.offsetHeight;
    const w = video.offsetWidth || 0;
    const h = video.offsetHeight || 0;
    if (w > 0 && h > 0) return w / h;
  } catch {
    /* ignore */
  } finally {
    if (prevStyle == null) video.removeAttribute('style');
    else video.setAttribute('style', prevStyle);
    if (needsAttach && video.parentElement === document.body) {
      document.body.removeChild(video);
    }
  }
  return null;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToB64(bytes)}`;
}

export interface CloudImageItem {
  id: string;
  name: string;
  mimeType?: string;
}

export async function listCloudMedia(
  _accessToken: string,
  pnIdentifier?: string,
  kind: 'image' | 'video' | 'any' = 'any'
): Promise<CloudImageItem[]> {
  const clauses: string[] = ['trashed=false'];
  if (kind === 'image') clauses.unshift("mimeType contains 'image/'");
  else if (kind === 'video') clauses.unshift("mimeType contains 'video/'");
  else clauses.unshift("(mimeType contains 'image/' or mimeType contains 'video/')");
  const q = encodeURIComponent(clauses.join(' and '));
  const res = await ownerGet(`/api/drive/files?q=${q}&pageSize=60`, { pnIdentifier });
  if (!res.ok) throw new Error('cloud_list_failed');
  const data = (await res.json()) as {
    files?: Array<{ id?: string; name?: string; mimeType?: string }>;
  };
  return (data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: String(f.id),
      name: String(f.name),
      mimeType: f.mimeType
    }));
}

/** @deprecated Prefer listCloudMedia */
export async function listCloudImages(
  accessToken: string,
  pnIdentifier?: string
): Promise<CloudImageItem[]> {
  return listCloudMedia(accessToken, pnIdentifier, 'image');
}

/**
 * Encrypt image/video bytes with docKey, upload opaque envelope to Drive.
 * Returns Drive fileId when ok.
 */
export async function uploadDeviceImageToDrive(
  _accessToken: string,
  file: File,
  pnIdentifier?: string,
  docId?: string
): Promise<string | null> {
  try {
    if (!docId) throw new Error('doc_id_required');
    return uploadBytesAsPenMedia({
      blob: file,
      fileName: `${file.name || 'pen-media'}.penmedia`,
      pnIdentifier,
      docId
    });
  } catch {
    return null;
  }
}

/** Encrypt raw bytes / Blob under docKey and upload as *.penmedia. */
export async function uploadBytesAsPenMedia(params: {
  blob: Blob;
  fileName: string;
  pnIdentifier?: string;
  docId: string;
}): Promise<string | null> {
  try {
    const docKey = mintDocKey(params.docId);
    const plain = new Uint8Array(await params.blob.arrayBuffer());
    const envelope = await encryptMediaBytes(plain, docKey);
    const base64 = bytesToB64(new TextEncoder().encode(envelope));
    const res = await ownerFetch(
      'POST',
      '/api/drive/files',
      {
        fileData: base64,
        fileName: params.fileName,
        mimeType: 'application/octet-stream',
        encrypt: false
      },
      { pnIdentifier: params.pnIdentifier }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; file?: { id?: string } };
    return data.id || data.file?.id || null;
  } catch {
    return null;
  }
}

/**
 * Download Drive file bytes into a Blob (decrypt DM envelope when docId set).
 */
export async function downloadCloudMediaBlob(
  fileId: string,
  pnIdentifier?: string,
  docId?: string
): Promise<{ blob: Blob; mime: string }> {
  const res = await ownerGet(
    `/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error('cloud_download_failed');
  const raw = await res.blob();
  const bytes = new Uint8Array(await raw.arrayBuffer());
  const asText = new TextDecoder().decode(bytes);
  if (isDmEnvelope(asText) && docId) {
    const key = loadDocKey(docId);
    if (!key) throw new Error('doc_key_required');
    const plain = await decryptMediaBytes(asText, key);
    const mime = guessMimeFromBytes(plain) || 'application/octet-stream';
    return { blob: new Blob([plain], { type: mime }), mime };
  }
  return { blob: raw, mime: raw.type || 'application/octet-stream' };
}

function guessMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'video/mp4';
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf) {
    return 'video/webm';
  }
  return null;
}

/**
 * Download Drive file bytes. If the body is a DM envelope and docId is set,
 * decrypt with docKey before returning a data URL for the editor.
 * @deprecated Prefer downloadCloudMediaBlob + IndexedDB refs.
 */
export async function downloadCloudImageAsDataUrl(
  _accessToken: string,
  fileId: string,
  pnIdentifier?: string,
  docId?: string
): Promise<string> {
  const { blob, mime } = await downloadCloudMediaBlob(fileId, pnIdentifier, docId);
  return fileToDataUrl(new File([blob], 'cloud-image', { type: mime }));
}

/** Decrypt a stored envelope string (or pass through legacy raw bytes as data URL). */
export async function mediaBytesForEditor(
  payload: string | Uint8Array,
  docId: string,
  mime = 'image/png'
): Promise<string> {
  const key = loadDocKey(docId);
  if (typeof payload === 'string' && isDmEnvelope(payload)) {
    if (!key) throw new Error('doc_key_required');
    const plain = await decryptMediaBytes(payload, key);
    return bytesToDataUrl(plain, mime);
  }
  if (payload instanceof Uint8Array) {
    const asText = new TextDecoder().decode(payload);
    if (isDmEnvelope(asText)) {
      if (!key) throw new Error('doc_key_required');
      const plain = await decryptMediaBytes(asText, key);
      return bytesToDataUrl(plain, mime);
    }
    return bytesToDataUrl(payload, mime);
  }
  return payload;
}

export { b64ToBytes, bytesToB64 };
