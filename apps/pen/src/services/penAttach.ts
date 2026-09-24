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

export {
  probeMediaAspect,
  probeVideoDisplayAspect,
  readOrientedAspect,
  readMp4RotationDegrees,
  cachedMediaAspect
} from './penMediaAspect';

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
