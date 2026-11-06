/**
 * App-supplied I/O for the owner explorer. Each app wires its own auth (browse session token,
 * dashboard owner API token) behind this interface; the package never touches credentials.
 */
import type { FeedPreviewVariant } from '@par-noir/aggregator-domain';
import type {
  DriveListing,
  OwnerAccount,
  OwnerCatalogRow,
  OwnerIndexEntry
} from './model';

export interface StoredFileRef {
  accountKey: string;
  driveFileId: string;
  /** Ask the backend for its own thumbnail rendition (plain files only). */
  thumbnail?: boolean;
}

/** AES-GCM private file package written by browse / dashboard / Pen uploads. */
export interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata?: {
    originalName?: string;
    originalMimeType?: string;
    originalSize?: number;
    [key: string]: unknown;
  };
}

export interface OwnerFilesTransport {
  /** Lists the owner's canonical blob folders for one account. */
  listDriveFiles(account: OwnerAccount): Promise<DriveListing[]>;
  /** Device owner index (dashboard uploads). `null` = no index, scan Drive instead. */
  fetchOwnerIndex?(account: OwnerAccount): Promise<OwnerIndexEntry[] | null>;
  /** Indexed rows owned by this pN (`/api/aggregator/owner-catalog`). */
  fetchOwnerCatalog(): Promise<OwnerCatalogRow[]>;
  /** Single metadata-index row; used only when the catalog is unavailable. */
  fetchMetadata?(metadataIndexFileId: string): Promise<Record<string, unknown> | null>;
  downloadFile(ref: StoredFileRef): Promise<Blob>;
  /** Signed or cached URL for a feed CDN variant. The transport owns the URL lifetime. */
  resolvePublicMediaUrl(metadataIndexFileId: string, variant: FeedPreviewVariant): Promise<string>;
  decryptPackage(pkg: EncryptedFilePackage): Promise<Blob>;
  openInPen?(penDocId: string): void;
}
