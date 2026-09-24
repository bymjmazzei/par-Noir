/**
 * Local media bytes for Pen drafts — IndexedDB, not localStorage.
 * Layer fields store tiny refs: penlocal:{id} | penmedia:{driveFileId}
 */

const DB_NAME = 'pen_media_v1';
const STORE = 'blobs';
const DB_VERSION = 1;

export type PenLocalMediaRecord = {
  id: string;
  docId: string;
  mime: string;
  bytes: ArrayBuffer;
  updatedAt: string;
  /** After cloud sync — Drive file id this blob mirrors. */
  driveFileId?: string;
};

const urlCache = new Map<string, string>();

export function isPenLocalMediaRef(src: string | null | undefined): boolean {
  return Boolean(src && src.startsWith('penlocal:'));
}

export function isPenMediaRef(src: string | null | undefined): boolean {
  return Boolean(src && src.startsWith('penmedia:'));
}

export function isPenMediaSrcRef(src: string | null | undefined): boolean {
  return isPenLocalMediaRef(src) || isPenMediaRef(src);
}

export function isInlineMediaSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  return src.startsWith('data:') || src.startsWith('blob:');
}

export function parsePenLocalMediaId(src: string): string | null {
  if (!isPenLocalMediaRef(src)) return null;
  const id = src.slice('penlocal:'.length).trim();
  return id || null;
}

export function parsePenMediaFileId(src: string): string | null {
  if (!isPenMediaRef(src)) return null;
  const id = src.slice('penmedia:'.length).trim();
  return id || null;
}

export function penLocalRef(mediaId: string): string {
  return `penlocal:${mediaId}`;
}

export function penMediaRef(fileId: string): string {
  return `penmedia:${fileId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_open_failed'));
  });
}

function newMediaId(): string {
  return `m_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function putLocalMedia(params: {
  docId: string;
  blob: Blob | File;
  mediaId?: string;
  driveFileId?: string;
}): Promise<{ mediaId: string; ref: string; blobUrl: string; mime: string }> {
  const mediaId = params.mediaId || newMediaId();
  const mime = params.blob.type || 'application/octet-stream';
  const bytes = await params.blob.arrayBuffer();
  const record: PenLocalMediaRecord = {
    id: mediaId,
    docId: params.docId,
    mime,
    bytes,
    updatedAt: new Date().toISOString(),
    driveFileId: params.driveFileId
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('idb_put_failed'));
  });
  db.close();
  const blobUrl = cacheBlobUrl(mediaId, new Blob([bytes], { type: mime }));
  return { mediaId, ref: penLocalRef(mediaId), blobUrl, mime };
}

/** Cache decrypted Drive media under a stable id linked to fileId. */
export async function putLocalMediaForDriveFile(params: {
  docId: string;
  fileId: string;
  blob: Blob;
}): Promise<{ mediaId: string; ref: string; blobUrl: string }> {
  const mediaId = `drive_${params.fileId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}`;
  const put = await putLocalMedia({
    docId: params.docId,
    blob: params.blob,
    mediaId,
    driveFileId: params.fileId
  });
  // Also cache under fileId key for resolve by penmedia:
  urlCache.set(`file:${params.fileId}`, put.blobUrl);
  return { mediaId: put.mediaId, ref: penMediaRef(params.fileId), blobUrl: put.blobUrl };
}

export async function getLocalMedia(
  mediaId: string
): Promise<{ mime: string; bytes: ArrayBuffer; driveFileId?: string } | null> {
  try {
    const db = await openDb();
    const record = await new Promise<PenLocalMediaRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(mediaId);
      req.onsuccess = () => resolve(req.result as PenLocalMediaRecord | undefined);
      req.onerror = () => reject(req.error || new Error('idb_get_failed'));
    });
    db.close();
    if (!record) return null;
    return { mime: record.mime, bytes: record.bytes, driveFileId: record.driveFileId };
  } catch {
    return null;
  }
}

export async function getLocalMediaByDriveFileId(
  fileId: string
): Promise<{ mediaId: string; mime: string; bytes: ArrayBuffer } | null> {
  try {
    const db = await openDb();
    const record = await new Promise<PenLocalMediaRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const idx = tx.objectStore(STORE).index('driveFileId');
      const req = idx.get(fileId);
      req.onsuccess = () => resolve(req.result as PenLocalMediaRecord | undefined);
      req.onerror = () => reject(req.error || new Error('idb_index_get_failed'));
    });
    db.close();
    if (!record) return null;
    return { mediaId: record.id, mime: record.mime, bytes: record.bytes };
  } catch {
    return null;
  }
}

function cacheBlobUrl(cacheKey: string, blob: Blob): string {
  const prev = urlCache.get(cacheKey);
  if (prev) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      /* ignore */
    }
  }
  const url = URL.createObjectURL(blob);
  urlCache.set(cacheKey, url);
  return url;
}

export async function resolveLocalMediaUrl(mediaId: string): Promise<string | null> {
  const cached = urlCache.get(mediaId);
  if (cached) return cached;
  const hit = await getLocalMedia(mediaId);
  if (!hit) return null;
  return cacheBlobUrl(mediaId, new Blob([hit.bytes], { type: hit.mime }));
}

export async function resolvePenMediaSrc(
  src: string | null | undefined,
  _docId?: string
): Promise<string | null> {
  if (!src) return null;
  if (!isPenMediaSrcRef(src) && !isInlineMediaSrc(src)) {
    // http(s) or other
    return src;
  }
  if (src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('http')) {
    return src;
  }
  const localId = parsePenLocalMediaId(src);
  if (localId) return resolveLocalMediaUrl(localId);

  const fileId = parsePenMediaFileId(src);
  if (fileId) {
    const byFile = urlCache.get(`file:${fileId}`);
    if (byFile) return byFile;
    const fromIdb = await getLocalMediaByDriveFileId(fileId);
    if (fromIdb) {
      const url = cacheBlobUrl(
        fromIdb.mediaId,
        new Blob([fromIdb.bytes], { type: fromIdb.mime })
      );
      urlCache.set(`file:${fileId}`, url);
      return url;
    }
    // Caller (ensure/hydrate) must download — return null so UI can wait.
    return null;
  }
  return src;
}

export async function deleteLocalMedia(mediaId: string): Promise<void> {
  const url = urlCache.get(mediaId);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    urlCache.delete(mediaId);
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(mediaId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('idb_delete_failed'));
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function deleteMediaForDoc(docId: string): Promise<void> {
  try {
    const db = await openDb();
    const ids = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const idx = tx.objectStore(STORE).index('docId');
      const req = idx.getAllKeys(docId);
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
      req.onerror = () => reject(req.error || new Error('idb_list_failed'));
    });
    db.close();
    for (const id of ids) await deleteLocalMedia(id);
  } catch {
    /* ignore */
  }
}

/** Migrate a data: or fetchable blob: URL into IDB; return penlocal ref. */
export async function ingestInlineMediaSrc(params: {
  docId: string;
  src: string;
}): Promise<string | null> {
  const { docId, src } = params;
  if (isPenMediaSrcRef(src)) return src;
  if (!isInlineMediaSrc(src)) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const put = await putLocalMedia({ docId, blob });
    return put.ref;
  } catch {
    return null;
  }
}

export const MEDIA_SRC_FIELDS = [
  'imageSrc',
  'videoSrc',
  'backgroundImage',
  'backgroundVideo',
  'paintOverlaySrc'
] as const;

export type MediaSrcField = (typeof MEDIA_SRC_FIELDS)[number];
