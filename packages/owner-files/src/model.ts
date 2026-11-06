/**
 * Owner file row model shared by browse and dashboard explorers.
 * One row = one thing the owner sees in their storage, regardless of where it was listed from.
 */

export type OwnerFileKind = 'encrypted-upload' | 'note' | 'collection' | 'pen-post';

/** Where the row was discovered. Catalog rows exist only in the metadata index (e.g. Pen publish). */
export type OwnerFileOrigin = 'drive' | 'index' | 'catalog';

export type OwnerFileVisibility = 'public' | 'private';

export interface OwnerAccount {
  /** Stable backend key (e.g. `google_drive::account-123`). Used for downloads and row grouping. */
  accountKey: string;
  provider: string;
  accountId: string;
  label: string;
}

export interface OwnerFilePending {
  progress: number;
  taskId: string;
}

export interface OwnerFileRow {
  /** Unique within the explorer (`${accountKey}:${id}`). */
  key: string;
  /** Primary id used for actions (share, delete, metadata). */
  id: string;
  accountKey: string;
  accountId: string;
  provider: string;
  /** Raw storage name (e.g. `photo.jpg.encrypted`). */
  name: string;
  displayName: string;
  kind: OwnerFileKind;
  origin: OwnerFileOrigin;
  /** Main stored object. Empty for catalog rows that have no owner-cloud object. */
  driveFileId: string;
  thumbDriveFileId?: string;
  /** Metadata-index / public-media id (feed CDN refs live under this id). */
  metadataIndexFileId?: string;
  mimeType?: string;
  size: number;
  modifiedTime?: string;
  visibility: OwnerFileVisibility;
  encrypted: boolean;
  indexed: boolean;
  penDocId?: string;
  metadata?: Record<string, unknown>;
  collectionFileIds?: string[];
  pending?: OwnerFilePending;
}

/** Raw listing entry from a Drive-like backend folder scan. */
export interface DriveListing {
  id: string;
  name: string;
  mimeType?: string;
  size?: number | string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
}

/** Device owner-index entry (dashboard uploads). Mirrors the sheet columns used today. */
export interface OwnerIndexEntry {
  fileId?: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: string;
  modifiedAt?: string;
  backendFileId?: string;
  googleDriveFileId?: string;
  visibility?: string;
  encrypted?: boolean;
  metadata?: Record<string, unknown>;
}

/** One row from `/api/aggregator/owner-catalog`. */
export interface OwnerCatalogRow {
  fileId: string;
  metadata: Record<string, unknown>;
}

export interface OwnerInventory {
  rows: OwnerFileRow[];
  rowsByAccount: Record<string, OwnerFileRow[]>;
  /** Metadata keyed by every id a row is known by (main, thumb, metadata index). */
  metadataById: Record<string, Record<string, unknown>>;
  errors: Record<string, string>;
}
