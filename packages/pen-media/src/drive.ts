/**
 * Drive → device media. Downloads decrypt PNM1 with the doc key or pass raw media
 * through; uploads happen on attach (see attach.ts).
 */

import { deviceDriveDownloadBlobForSession } from '@par-noir/device-cloud-credentials';
import { isPenMediaHeader, PEN_MEDIA_HEADER_BYTES } from '@par-noir/dm-crypto';
import { trackActivity } from './activity';
import { penMediaConfig } from './config';
import { openMedia } from './crypto';
import { isPenMediaRef, parsePenMediaFileId } from './refs';
import { putLocalMediaForDriveFile, resolvePenMediaSrc } from './store';

const SNIFF_BYTES = 16;

function startsWith(head: Uint8Array, sig: number[], at = 0): boolean {
  return sig.every((b, i) => head[at + i] === b);
}

/** Container mime from magic bytes; Drive copies of PNM1 files carry no useful type. */
export function sniffMediaMime(head: Uint8Array): string {
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) {
    return startsWith(head, [0x71, 0x74], 8) ? 'video/quicktime' : 'video/mp4';
  }
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46])) {
    if (startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
    if (startsWith(head, [0x57, 0x41, 0x56, 0x45], 8)) return 'audio/wav';
  }
  if (startsWith(head, [0x49, 0x44, 0x33]) || startsWith(head, [0xff, 0xfb])) return 'audio/mpeg';
  if (startsWith(head, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
  return '';
}

async function headBytes(blob: Blob, n: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, n).arrayBuffer());
}

function withType(blob: Blob, mime: string): Blob {
  return mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
}

/** PNM1 bytes already downloaded while the doc key was not yet on the device. */
const sealedAwaitingKey = new Map<string, Blob>();

/** Download a Drive file; PNM1 → decrypted with the doc key, otherwise the raw media. */
export async function downloadPenMedia(params: {
  pnIdentifier: string;
  /** Needed only when the file is PNM1 (encrypted under that doc's key). */
  docId?: string;
  fileId: string;
}): Promise<Blob> {
  const raw =
    sealedAwaitingKey.get(params.fileId) ??
    (await trackActivity('download', () =>
      deviceDriveDownloadBlobForSession({
        pnIdentifier: params.pnIdentifier,
        fileId: params.fileId
      })
    ));
  const head = await headBytes(raw, PEN_MEDIA_HEADER_BYTES);
  if (!isPenMediaHeader(head)) {
    const type = raw.type && raw.type !== 'application/octet-stream' ? raw.type : '';
    return withType(raw, type || sniffMediaMime(await headBytes(raw, SNIFF_BYTES)));
  }
  const key = params.docId ? penMediaConfig().loadDocKey(params.docId) : null;
  if (!key) {
    sealedAwaitingKey.set(params.fileId, raw);
    throw new Error('doc_key_required');
  }
  sealedAwaitingKey.delete(params.fileId);
  const plain = await openMedia(raw, key, '');
  return withType(plain, sniffMediaMime(await headBytes(plain, SNIFF_BYTES)));
}

const inflight = new Map<string, Promise<string | null>>();

/**
 * Ref → playable blob: URL. Local refs and cached Drive files resolve from IndexedDB;
 * an uncached `penmedia:` file is downloaded once (deduped) and cached.
 */
export async function ensurePenMediaUrl(params: {
  src: string | null | undefined;
  docId?: string;
  pnIdentifier?: string;
}): Promise<string | null> {
  const { src, docId, pnIdentifier } = params;
  const local = await resolvePenMediaSrc(src);
  if (local || !src || !isPenMediaRef(src) || !docId || !pnIdentifier) return local;
  const fileId = parsePenMediaFileId(src);
  if (!fileId) return null;
  const hit = inflight.get(fileId);
  if (hit) return hit;
  const job = (async () => {
    const blob = await downloadPenMedia({ pnIdentifier, docId, fileId });
    const put = await putLocalMediaForDriveFile({ docId, fileId, blob });
    return put.blobUrl;
  })().finally(() => inflight.delete(fileId));
  inflight.set(fileId, job);
  return job;
}
