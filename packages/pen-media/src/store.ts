/**
 * Device media store — pluggable backend (IndexedDB default; Cap/Electron via configure).
 * Layer fields hold refs; this module turns refs into blob: URLs for playback.
 */

import {
  configurePenMediaBackend,
  getPenMediaBackend,
  hasPenMediaBackend,
  type PenMediaRecord
} from './backend';
import { createIdbPenMediaBackend } from './idbBackend';
import {
  isInlineMediaSrc,
  isPenMediaSrcRef,
  parsePenLocalMediaId,
  parsePenMediaFileId,
  penLocalRef,
  penMediaRef
} from './refs';

export type { PenMediaRecord };

const urlCache = new Map<string, string>();

function ensureBackend() {
  if (!hasPenMediaBackend()) {
    configurePenMediaBackend(createIdbPenMediaBackend());
  }
  return getPenMediaBackend();
}

function newMediaId(): string {
  return `m_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function driveMediaId(fileId: string): string {
  return `drive_${fileId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}`;
}

function cacheBlobUrl(cacheKey: string, blob: Blob): string {
  const prev = urlCache.get(cacheKey);
  if (prev) return prev;
  const url = URL.createObjectURL(blob);
  urlCache.set(cacheKey, url);
  return url;
}

function linkFileUrl(fileId: string, url: string): void {
  urlCache.set(`file:${fileId}`, url);
}

export async function putLocalMedia(params: {
  docId: string;
  blob: Blob;
  mediaId?: string;
  driveFileId?: string;
}): Promise<{ mediaId: string; ref: string; blobUrl: string; mime: string }> {
  const mediaId = params.mediaId || newMediaId();
  const mime = params.blob.type || 'application/octet-stream';
  await ensureBackend().put({
    id: mediaId,
    docId: params.docId,
    mime,
    blob: params.blob,
    updatedAt: new Date().toISOString(),
    ...(params.driveFileId ? { driveFileId: params.driveFileId } : {})
  });
  const blobUrl = cacheBlobUrl(mediaId, params.blob);
  if (params.driveFileId) linkFileUrl(params.driveFileId, blobUrl);
  return { mediaId, ref: penLocalRef(mediaId), blobUrl, mime };
}

/**
 * Cache media that already lives on Drive (picked or downloaded) under its file id.
 */
export async function putLocalMediaForDriveFile(params: {
  docId: string;
  fileId: string;
  blob: Blob;
}): Promise<{ mediaId: string; ref: string; blobUrl: string }> {
  const mediaId = driveMediaId(params.fileId);
  const ref = penMediaRef(params.fileId);
  try {
    const put = await putLocalMedia({
      docId: params.docId,
      blob: params.blob,
      mediaId,
      driveFileId: params.fileId
    });
    return { mediaId, ref, blobUrl: put.blobUrl };
  } catch (e) {
    console.warn('[pen-media] device cache write failed; using the Drive copy', {
      reason: e instanceof DOMException ? e.name : e instanceof Error ? e.message : String(e)
    });
    const blobUrl = cacheBlobUrl(mediaId, params.blob);
    linkFileUrl(params.fileId, blobUrl);
    return { mediaId, ref, blobUrl };
  }
}

export async function getLocalMedia(
  mediaId: string
): Promise<{ docId: string; mime: string; blob: Blob; driveFileId?: string } | null> {
  try {
    const rec = await ensureBackend().get(mediaId);
    if (!rec) return null;
    return { docId: rec.docId, mime: rec.mime, blob: rec.blob, driveFileId: rec.driveFileId };
  } catch {
    return null;
  }
}

export async function resolveLocalMediaUrl(mediaId: string): Promise<string | null> {
  const cached = urlCache.get(mediaId);
  if (cached) return cached;
  const hit = await getLocalMedia(mediaId);
  if (!hit) return null;
  const url = cacheBlobUrl(mediaId, hit.blob);
  if (hit.driveFileId) linkFileUrl(hit.driveFileId, url);
  return url;
}

export async function resolvePenMediaSrc(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (!isPenMediaSrcRef(src) || isInlineMediaSrc(src)) return src;
  const localId = parsePenLocalMediaId(src);
  if (localId) return resolveLocalMediaUrl(localId);
  const fileId = parsePenMediaFileId(src);
  if (!fileId) return null;
  const byFile = urlCache.get(`file:${fileId}`);
  if (byFile) return byFile;
  try {
    const rec = await ensureBackend().getByDriveFileId(fileId);
    if (!rec) return null;
    const url = cacheBlobUrl(rec.id, rec.blob);
    linkFileUrl(fileId, url);
    return url;
  } catch {
    return null;
  }
}

function dropUrl(mediaId: string): void {
  const url = urlCache.get(mediaId);
  if (!url) return;
  for (const [k, v] of urlCache) if (v === url) urlCache.delete(k);
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

export async function deleteLocalMedia(mediaId: string): Promise<void> {
  dropUrl(mediaId);
  try {
    await ensureBackend().delete(mediaId);
  } catch {
    /* ignore */
  }
}

export async function deleteMediaForDoc(docId: string): Promise<void> {
  try {
    const keys = await ensureBackend().listIdsForDoc(docId);
    for (const k of keys) await deleteLocalMedia(k);
  } catch {
    /* ignore */
  }
}

export { configurePenMediaBackend } from './backend';
export type { PenMediaBackend } from './backend';
export { createIdbPenMediaBackend } from './idbBackend';
export { createMemoryPenMediaBackend } from './memoryBackend';
