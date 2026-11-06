/**
 * Thumbnail source for a row. Order: feed CDN poster → encrypted thumb sidecar →
 * decrypted small image → collection cover (first child) → type icon.
 */
import type { OwnerFileRow } from './model';
import { hasFeedPreview } from './publicMedia';

export type OwnerFileIcon =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'note'
  | 'collection'
  | 'pen'
  | 'file';

export const MAX_DECRYPTED_THUMB_BYTES = 15 * 1024 * 1024;

export type OwnerThumbSource =
  | { type: 'cdn'; metadataIndexFileId: string; variant: 'poster' | 'sd' }
  | { type: 'collection-cover'; childMetadataIndexFileId: string }
  | { type: 'stored'; accountKey: string; driveFileId: string; encrypted: boolean; thumbnail?: boolean }
  | { type: 'icon'; icon: OwnerFileIcon };

export function iconForRow(row: Pick<OwnerFileRow, 'kind' | 'mimeType'>): OwnerFileIcon {
  if (row.kind === 'collection') return 'collection';
  if (row.kind === 'note') return 'note';
  if (row.kind === 'pen-post') return 'pen';
  const mime = row.mimeType || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return 'file';
}

export function resolveThumbSource(row: OwnerFileRow): OwnerThumbSource {
  const meta = row.metadata;
  if (row.metadataIndexFileId && hasFeedPreview(meta)) {
    return {
      type: 'cdn',
      metadataIndexFileId: row.metadataIndexFileId,
      variant: meta?.feedPoster ? 'poster' : 'sd'
    };
  }
  if (row.thumbDriveFileId) {
    return { type: 'stored', accountKey: row.accountKey, driveFileId: row.thumbDriveFileId, encrypted: true };
  }
  if (row.kind === 'collection' && row.collectionFileIds?.length) {
    return { type: 'collection-cover', childMetadataIndexFileId: row.collectionFileIds[0]! };
  }
  const mime = row.mimeType || '';
  if (row.origin !== 'catalog' && row.driveFileId && row.kind === 'encrypted-upload') {
    if (row.encrypted && mime.startsWith('image/') && row.size <= MAX_DECRYPTED_THUMB_BYTES) {
      return { type: 'stored', accountKey: row.accountKey, driveFileId: row.driveFileId, encrypted: true };
    }
    if (!row.encrypted && (mime.startsWith('image/') || mime.startsWith('video/'))) {
      return {
        type: 'stored',
        accountKey: row.accountKey,
        driveFileId: row.driveFileId,
        encrypted: false,
        thumbnail: true
      };
    }
  }
  return { type: 'icon', icon: iconForRow(row) };
}
