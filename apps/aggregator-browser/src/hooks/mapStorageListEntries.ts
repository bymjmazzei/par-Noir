/**
 * Pure helpers for Storage Drive→list mapping.
 * Orphan Drive files (no public metadata-index row) must still appear in Storage.
 */

import { ownerCatalogDriveId } from '@par-noir/aggregator-domain';
import { hasFeedPreviewPlayback } from '../services/feedPreviewPlayback';

export type DriveListFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  [key: string]: unknown;
};

export type NoteThumbnailListEntry = DriveListFile & {
  isThumbnail: true;
  mainFileId: string;
  displayName: string;
  isPartOfCollection: boolean;
  fileType: string;
  mainFileType?: string;
  indexMissing?: boolean;
};

export type CollectionListEntry = DriveListFile & {
  fileType: string;
  collection?: unknown;
  isNoteCollection?: boolean;
  displayName: string;
  indexMissing?: boolean;
};

export type OwnerCatalogListEntry = DriveListFile & {
  fileType: string;
  contentClass?: string;
  catalogBacked: true;
  /** metadata-index fileId (DELETE / share). */
  metadataIndexFileId: string;
  displayName: string;
  penDocId?: string;
  collection?: unknown;
  /** Indexed feedPoster / feedPreviewSd — Storage grid can show CDN thumb. */
  hasCatalogFeedPoster: boolean;
  indexMissing: false;
};

export function cleanNoteThumbDisplayName(name: string): string {
  return name
    .replace(/^thumb_/i, '')
    .replace(/\.encrypted$/i, '')
    .replace(/\.[^.]+$/, '');
}

export function cleanCollectionDisplayName(name: string): string {
  return name.replace(/\.encrypted$/i, '').replace(/\.collection$/i, '');
}

/**
 * Build a Storage list entry for a note thumbnail.
 * When metadata is missing (public-index 404), keep the Drive file as unindexed/private.
 */
export function mapNoteThumbnailEntry(params: {
  thumb: DriveListFile;
  noteFileId?: string;
  metadata: Record<string, unknown> | null | undefined;
}): NoteThumbnailListEntry {
  const { thumb, noteFileId, metadata } = params;
  const displayName = cleanNoteThumbDisplayName(thumb.name);

  if (!metadata) {
    return {
      ...thumb,
      isThumbnail: true,
      mainFileId: noteFileId || thumb.id,
      displayName,
      isPartOfCollection: false,
      fileType: 'note-thumbnail',
      indexMissing: true,
    };
  }

  const fileType =
    typeof metadata.fileType === 'string' && metadata.fileType
      ? metadata.fileType
      : 'note-thumbnail';
  const mainFileIdFromMetadata =
    typeof metadata.mainFileId === 'string' ? metadata.mainFileId : undefined;
  let mainFileType: string | undefined;
  if (fileType === 'note-collection-thumbnail') {
    mainFileType = 'note-collection';
  }

  return {
    ...thumb,
    isThumbnail: true,
    mainFileId: mainFileIdFromMetadata || noteFileId || thumb.id,
    displayName,
    isPartOfCollection: metadata.isPartOfCollection === true,
    fileType,
    mainFileType,
    indexMissing: false,
  };
}

/**
 * Build a Storage list entry for a collection file.
 * When metadata is missing, keep the Drive file as an unindexed collection.
 */
/** Indexed owner-catalog row (Pen publish, etc.) — id is the metadata-index fileId / Drive envelope. */
export function mapOwnerCatalogEntry(params: {
  fileId: string;
  metadata: Record<string, unknown>;
}): OwnerCatalogListEntry {
  const { fileId, metadata } = params;
  const driveId = ownerCatalogDriveId(metadata as { publicContentRef?: { objectId?: string }; fileId?: string }, fileId);
  const id = driveId || fileId;
  const title =
    (typeof metadata.title === 'string' && metadata.title) ||
    (typeof metadata.name === 'string' && metadata.name) ||
    id;
  const fileType = (typeof metadata.fileType === 'string' && metadata.fileType) || 'other';
  const contentClass =
    typeof metadata.contentClass === 'string' ? metadata.contentClass : undefined;
  const penDocId = typeof metadata.penDocId === 'string' ? metadata.penDocId : undefined;
  const name =
    (typeof metadata.name === 'string' && metadata.name) ||
    `pen-catalog-${fileId.slice(0, 8)}`;

  return {
    id,
    name,
    mimeType: 'application/json',
    size: '0',
    fileType,
    contentClass,
    catalogBacked: true,
    metadataIndexFileId: fileId,
    displayName: title.replace(/\.encrypted$/i, ''),
    penDocId,
    collection: metadata.collection,
    hasCatalogFeedPoster: hasFeedPreviewPlayback(metadata),
    indexMissing: false
  };
}

export function mapCollectionEntry(params: {
  file: DriveListFile;
  metadata: Record<string, unknown> | null | undefined;
}): CollectionListEntry {
  const { file, metadata } = params;

  if (!metadata) {
    return {
      ...file,
      fileType: 'collection',
      displayName: cleanCollectionDisplayName(file.name),
      indexMissing: true,
    };
  }

  return {
    ...file,
    fileType: (typeof metadata.fileType === 'string' && metadata.fileType) || 'collection',
    collection: metadata.collection,
    isNoteCollection: metadata.isNoteCollection === true,
    displayName:
      (typeof metadata.name === 'string' && metadata.name) ||
      (typeof metadata.title === 'string' && metadata.title) ||
      cleanCollectionDisplayName(file.name),
    indexMissing: false,
  };
}
