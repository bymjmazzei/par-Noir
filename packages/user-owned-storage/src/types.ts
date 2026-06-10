/** Supported user-owned storage backends */
export type StorageProviderId =
  | 'google_drive'
  | 'dropbox'
  | 'aws_s3'
  | 'azure_blob'
  | 'onedrive'
  | 'ftp';

export interface BlobHead {
  etag?: string;
  version?: string;
  size: number;
  lastModified?: string;
}

export interface BlobEntry {
  key: string;
  size: number;
  lastModified?: string;
}

export interface PutOptions {
  /** Optimistic concurrency — fail if etag/version mismatch */
  ifMatch?: string;
  contentType?: string;
}

export interface PutResult {
  etag?: string;
  version?: string;
}

export type TableRow = Record<string, unknown>;

export interface ScanOptions {
  limit?: number;
  offset?: number;
}

export interface TableSchema {
  /** Logical table id, e.g. `third-party-permissions` */
  id: string;
  /** Primary key column name */
  keyColumn: string;
  /** Blob-relative path without extension, e.g. `_metadata/third-party-permissions` */
  path: string;
  /** Portable file extension for non-Google providers */
  portableExtension?: '.db' | '.json';
}

export interface PnCachedNodeIds {
  pnFolderId?: string;
  metadataFolderId?: string;
  integratorsRootId?: string;
  messagesFolderId?: string;
  inboxSheetId?: string;
}

export interface CachedLayout {
  pathPrefix?: string;
  nodeIds?: PnCachedNodeIds;
}
