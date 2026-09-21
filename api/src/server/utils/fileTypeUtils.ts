/**
 * File Type Utilities
 * Centralized file type determination logic for consistency across all services
 */

export function getFileTypeFromMime(mimeType?: string): string {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('text')) return 'text';
  return 'other';
}

/**
 * Determine file type from metadata content.
 * Note (ex-Thought) collection thumbnails / text posts included.
 */
export function determineFileType(options: {
  fileType?: string;
  collection?: { collectionFileIds: string[] };
  textPost?: any;
  thought?: any;
  note?: any;
  mimeType?: string;
  isThoughtThumbnail?: boolean;
  isNoteThumbnail?: boolean;
  isPartOfCollection?: boolean;
}): string {
  if (options.fileType) {
    return options.fileType;
  }

  if (options.collection?.collectionFileIds && options.collection.collectionFileIds.length > 0) {
    return 'collection';
  }

  if ((options.isNoteThumbnail || options.isThoughtThumbnail) && options.isPartOfCollection) {
    return 'note-collection-thumbnail';
  }

  if (options.isNoteThumbnail || options.isThoughtThumbnail) {
    return 'image';
  }

  if (options.textPost || options.note || options.thought) {
    return 'text';
  }

  return getFileTypeFromMime(options.mimeType);
}

/**
 * contentClass for feed filtering. Notes replace Thoughts.
 */
export function determineContentClass(options: {
  fileType?: string;
  collection?: { collectionFileIds: string[] };
  textPost?: any;
  thought?: any;
  note?: any;
  isThoughtThumbnail?: boolean;
  isNoteThumbnail?: boolean;
  isPartOfCollection?: boolean;
}): 'media' | 'note' | 'collection' {
  if (options.collection?.collectionFileIds && options.collection.collectionFileIds.length > 0) {
    return 'collection';
  }

  if (
    options.isNoteThumbnail ||
    options.isThoughtThumbnail ||
    options.note ||
    options.thought ||
    options.textPost
  ) {
    return 'note';
  }

  return 'media';
}

export type FileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'text'
  | 'other'
  | 'collection'
  | 'note'
  | 'note-collection-thumbnail'
  | 'note-collection-page'
  | 'note-collection';
