import { trackActivity } from './activity';
import type { PenMediaBackend, PenMediaRecord } from './backend';

const DB_NAME = 'pen_media_v2';
const STORE = 'media';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
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

export function createIdbPenMediaBackend(): PenMediaBackend {
  return {
    async put(record) {
      const db = await openDb();
      await trackActivity(
        'idb-write',
        () =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('idb_put_failed'));
            tx.onabort = () => reject(tx.error || new Error('idb_put_aborted'));
          })
      );
    },
    async get(mediaId) {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readonly');
      const hit = await request(tx.objectStore(STORE).get(mediaId));
      return (hit as PenMediaRecord | undefined) ?? null;
    },
    async getByDriveFileId(fileId) {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readonly');
      const hit = await request(tx.objectStore(STORE).index('driveFileId').get(fileId));
      return (hit as PenMediaRecord | undefined) ?? null;
    },
    async delete(mediaId) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(mediaId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('idb_delete_failed'));
        tx.onabort = () => reject(tx.error || new Error('idb_delete_aborted'));
      });
    },
    async listIdsForDoc(docId) {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readonly');
      const keys = await request(tx.objectStore(STORE).index('docId').getAllKeys(docId));
      return keys.map(String);
    }
  };
}
