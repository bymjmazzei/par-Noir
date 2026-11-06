/**
 * Full preview source for a row. Owner-cloud objects decrypt locally; catalog-only rows
 * (Pen posts) play from the feed CDN and never download the public share envelope as content.
 */
import type { OwnerFileRow } from './model';
import { hasFeedPreview } from './publicMedia';

export type OwnerPreviewSource =
  | { type: 'cdn'; metadataIndexFileId: string; variant: 'poster' | 'sd'; media: 'image' | 'video' }
  | { type: 'collection-cover'; childMetadataIndexFileId: string }
  | { type: 'stored'; accountKey: string; driveFileId: string; encrypted: boolean; mimeType?: string }
  | { type: 'unavailable'; reason: string };

function cdnSource(row: OwnerFileRow): OwnerPreviewSource | null {
  const meta = row.metadata;
  if (!row.metadataIndexFileId || !hasFeedPreview(meta)) return null;
  if (meta?.feedPreviewSd) {
    return { type: 'cdn', metadataIndexFileId: row.metadataIndexFileId, variant: 'sd', media: 'video' };
  }
  return { type: 'cdn', metadataIndexFileId: row.metadataIndexFileId, variant: 'poster', media: 'image' };
}

export function resolvePreviewSource(row: OwnerFileRow): OwnerPreviewSource {
  if (row.pending) return { type: 'unavailable', reason: 'Still uploading' };

  if (row.origin === 'catalog') {
    const cdn = cdnSource(row);
    if (cdn) return cdn;
    if (row.kind === 'collection' && row.collectionFileIds?.length) {
      return { type: 'collection-cover', childMetadataIndexFileId: row.collectionFileIds[0]! };
    }
    return {
      type: 'unavailable',
      reason: row.penDocId ? 'This post has no preview yet. Open it in Pen.' : 'No preview available'
    };
  }

  if (row.kind === 'note' || row.kind === 'collection') {
    if (row.thumbDriveFileId) {
      return {
        type: 'stored',
        accountKey: row.accountKey,
        driveFileId: row.thumbDriveFileId,
        encrypted: true,
        mimeType: 'image/png'
      };
    }
    const cdn = cdnSource(row);
    if (cdn) return cdn;
    if (row.kind === 'collection' && row.collectionFileIds?.length) {
      return { type: 'collection-cover', childMetadataIndexFileId: row.collectionFileIds[0]! };
    }
    return { type: 'unavailable', reason: 'No preview available' };
  }

  if (row.driveFileId) {
    return {
      type: 'stored',
      accountKey: row.accountKey,
      driveFileId: row.driveFileId,
      encrypted: row.encrypted,
      mimeType: row.mimeType
    };
  }
  return cdnSource(row) || { type: 'unavailable', reason: 'No preview available' };
}
