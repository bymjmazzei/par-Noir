/**
 * Device media store — IndexedDB holds each file as a Blob (no byte copies, no base64).
 * Layer fields hold refs; this module turns refs into blob: URLs for playback.
 */

import {
  isInlineMediaSrc,
  isPenMediaSrcRef,
  parsePenLocalMediaId,
  parsePenMediaFileId,
  penLocalRef,
  penMediaRef
} from './refs';

const DB_NAME = 'pen_media_v2';
const STORE = 'media';
const DB_VERSION = 1;

export type PenMediaRecord = {
  id: string;
  docId: string;
  mime: string;
  blob: Blob;
  updatedAt: string;
  /** Drive file this blob mirrors (set after upload or when cached from Drive). */
  driveFileId?: string;
};

const urlCache = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb_unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('docId', 'docId', { unique: false });
        store.createIndex('driveFileId', 'driveFileId', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('idb_open_failed'));
    };
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_request_failed'));
  });
}

async function readRecord(mediaId: string): Promise<PenMediaRecord | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const hit = await request(tx.objectStore(STORE).get(mediaId));
  return (hit as PenMediaRecord | undefined) ?? null;
}

async function readRecordByDriveFileId(fileId: string): Promise<PenMediaRecord | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const hit = await request(tx.objectStore(STORE).index('driveFileId').get(fileId));
  return (hit as PenMediaRecord | undefined) ?? null;
}

async function writeRecord(record: PenMediaRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('idb_put_failed'));
  });
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
  await writeRecord({
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

/** Cache media that already lives on Drive (picked or downloaded) under its file id. */
export async function putLocalMediaForDriveFile(params: {
  docId: string;
  fileId: string;
  blob: Blob;
}): Promise<{ mediaId: string; ref: string; blobUrl: string }> {
  const put = await putLocalMedia({
    docId: params.docId,
    blob: params.blob,
    mediaId: driveMediaId(params.fileId),
    driveFileId: params.fileId
  });
  return { mediaId: put.mediaId, ref: penMediaRef(params.fileId), blobUrl: put.blobUrl };
}

export async function getLocalMedia(
  mediaId: string
): Promise<{ docId: string; mime: string; blob: Blob; driveFileId?: string } | null> {
  try {
    const rec = await readRecord(mediaId);
    if (!rec) return null;
    return { docId: rec.docId, mime: rec.mime, blob: rec.blob, driveFileId: rec.driveFileId };
  } catch {
    return null;
  }
}

/** Record that a local blob now lives on Drive so it is never uploaded twice. */
export async function setLocalMediaDriveFileId(mediaId: string, fileId: string): Promise<void> {
  const rec = await readRecord(mediaId);
  if (!rec) return;
  await writeRecord({ ...rec, driveFileId: fileId });
  const url = urlCache.get(mediaId);
  if (url) linkFileUrl(fileId, url);
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

/**
 * Ref → playable URL from this device only (no network). Returns null for a
 * `penmedia:` file not cached yet; see `ensurePenMediaUrl` for the download path.
 */
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
    const rec = await readRecordByDriveFileId(fileId);
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
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(mediaId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('idb_delete_failed'));
    });
  } catch {
    /* ignore */
  }
}

export async function deleteMediaForDoc(docId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const keys = await request(tx.objectStore(STORE).index('docId').getAllKeys(docId));
    for (const k of keys) await deleteLocalMedia(String(k));
  } catch {
    /* ignore */
  }
}
