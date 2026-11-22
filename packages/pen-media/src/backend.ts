/** Pluggable device media persistence (IDB web / Cap FS / Electron secure volume). */

export type PenMediaRecord = {
  id: string;
  docId: string;
  mime: string;
  blob: Blob;
  updatedAt: string;
  driveFileId?: string;
};

export interface PenMediaBackend {
  put(record: PenMediaRecord): Promise<void>;
  get(mediaId: string): Promise<PenMediaRecord | null>;
  getByDriveFileId(fileId: string): Promise<PenMediaRecord | null>;
  delete(mediaId: string): Promise<void>;
  listIdsForDoc(docId: string): Promise<string[]>;
}

let active: PenMediaBackend | null = null;

export function configurePenMediaBackend(backend: PenMediaBackend): void {
  active = backend;
}

export function getPenMediaBackend(): PenMediaBackend {
  if (!active) {
    // Lazy default — IndexedDB (browser / Cap without configure).
    // Imported dynamically would cycle; callers in store create idb on first use.
    throw new Error('pen_media_backend_unconfigured');
  }
  return active;
}

export function hasPenMediaBackend(): boolean {
  return active != null;
}
