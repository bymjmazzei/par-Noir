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

/** Natural width/height ratio for a data URL or remote media src. */
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
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;
      resolve(w > 0 && h > 0 ? w / h : 16 / 9);
    };
    video.onerror = () => resolve(16 / 9);
    video.src = src;
  });
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

async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
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
 * Download Drive file bytes. If the body is a DM envelope and docId is set,
 * decrypt with docKey before returning a data URL for the editor.
 */
export async function downloadCloudImageAsDataUrl(
  _accessToken: string,
  fileId: string,
  pnIdentifier?: string,
  docId?: string
): Promise<string> {
  const res = await ownerGet(
    `/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error('cloud_download_failed');
  const blob = await res.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const asText = new TextDecoder().decode(bytes);
  if (isDmEnvelope(asText) && docId) {
    const key = loadDocKey(docId);
    if (!key) throw new Error('doc_key_required');
    const plain = await decryptMediaBytes(asText, key);
    return bytesToDataUrl(plain, blob.type || 'image/png');
  }
  return fileToDataUrl(new File([blob], 'cloud-image', { type: blob.type || 'image/png' }));
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
    const docKey = mintDocKey(docId);
    const plain = await fileToBytes(file);
    const envelope = await encryptMediaBytes(plain, docKey);
    const base64 = bytesToB64(new TextEncoder().encode(envelope));
    const res = await ownerFetch(
      'POST',
      '/api/drive/files',
      {
        fileData: base64,
        fileName: `${file.name || 'pen-media'}.penmedia`,
        mimeType: 'application/octet-stream',
        encrypt: false
      },
      { pnIdentifier }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; file?: { id?: string } };
    return data.id || data.file?.id || null;
  } catch {
    return null;
  }
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
