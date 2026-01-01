/**
 * File Type Utilities
 * Centralized file type determination logic for consistency across all services
 */

/**
 * Get file type from MIME type
 * Standardized across all services
 */
export function getFileTypeFromMime(mimeType?: string): string {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('text')) return 'text'; // Text MIME types map to 'text' fileType
  return 'other';
}

/**
 * Determine file type from metadata content
 * Takes precedence over MIME type when content-specific data is present
 * 
 * Priority order:
 * 1. Explicit fileType (if provided)
 * 2. Collection data -> 'collection'
 * 3. Thought collection thumbnail -> 'thought-collection-thumbnail'
 * 4. Thought thumbnail -> 'image' (single thoughts)
 * 5. Text post/thought -> 'text'
 * 6. MIME type -> fileType
 */
export function determineFileType(options: {
  fileType?: string;
  collection?: { collectionFileIds: string[] };
  textPost?: any;
  thought?: any;
  mimeType?: string;
  isThoughtThumbnail?: boolean;
  isPartOfCollection?: boolean;
}): string {
  // Explicit fileType takes precedence
  if (options.fileType) {
    return options.fileType;
  }
  
  // Collection data -> 'collection'
  if (options.collection?.collectionFileIds && options.collection.collectionFileIds.length > 0) {
    return 'collection';
  }
  
  // Thought collection thumbnail -> 'thought-collection-thumbnail'
  if (options.isThoughtThumbnail && options.isPartOfCollection) {
    return 'thought-collection-thumbnail';
  }
  
  // Thought thumbnail -> 'image' (for single thoughts, not collections)
  if (options.isThoughtThumbnail) {
    return 'image'; // Single thought thumbnails are images
  }
  
  // Text post/thought -> 'text'
  if (options.textPost || options.thought) {
    return 'text';
  }
  
  // Fallback to MIME type
  return getFileTypeFromMime(options.mimeType);
}

/**
 * Determine content class from metadata content
 * This is separate from fileType - it classifies content for feed filtering
 * 
 * Priority order:
 * 1. Collection data -> 'collection'
 * 2. Thought (including thumbnails) -> 'thought'
 * 3. Media (images, videos, audio) -> 'media'
 * 4. Default -> 'media'
 */
export function determineContentClass(options: {
  fileType?: string;
  collection?: { collectionFileIds: string[] };
  textPost?: any;
  thought?: any;
  isThoughtThumbnail?: boolean;
  isPartOfCollection?: boolean;
}): 'media' | 'thought' | 'collection' {
  // Collection takes precedence
  if (options.collection?.collectionFileIds && options.collection.collectionFileIds.length > 0) {
    return 'collection';
  }
  
  // Thought (including thumbnails)
  if (options.thought || options.textPost || options.isThoughtThumbnail) {
    return 'thought';
  }
  
  // Media (images, videos, audio)
  if (['image', 'video', 'audio'].includes(options.fileType || '')) {
    return 'media';
  }
  
  // Default to media for unknown types
  return 'media';
}

/**
 * Valid file type values
 */
export type FileType = 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'text' 
  | 'thought' 
  | 'document' 
  | 'collection' 
  | 'thought-collection-thumbnail' 
  | 'thought-collection-page' 
  | 'thought-collection' 
  | 'other';

