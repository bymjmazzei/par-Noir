/**
 * Content Type Definitions
 * 
 * Defines the mapping between content types (media, thoughts, collections) and
 * how they should be queried from the API and filtered.
 */

export type ContentType = 'media' | 'thoughts' | 'collections';

export interface ContentTypeConfig {
  apiFileTypes: string[];
  excludeThumbnails?: boolean;
  excludeMainFileId?: boolean;
  includeOnlyThoughtThumbnails?: boolean; // For thoughts: only include files with isThoughtThumbnail flag
  excludeThoughtThumbnails?: boolean; // For media: exclude thought thumbnails
}

export const CONTENT_TYPE_MAP: Record<ContentType, ContentTypeConfig> = {
  media: {
    apiFileTypes: ['image', 'video'],
    excludeThumbnails: false, // Media thumbnails ARE media
    excludeThoughtThumbnails: true, // But exclude thought thumbnails (they have isThoughtThumbnail flag)
  },
  thoughts: {
    // CRITICAL: Thoughts are rendered as thumbnails in feeds (for performance)
    // Thought thumbnails have fileType: 'image' but isThoughtThumbnail: true
    // Collection thought thumbnails have fileType: 'thought-collection-thumbnail'
    // The actual thought files (thought-*.thought) are private and not indexed
    apiFileTypes: ['thought', 'text', 'image', 'thought-collection-thumbnail'],
    // Filter to only include thought thumbnails, not regular images
    includeOnlyThoughtThumbnails: true,
  },
  collections: {
    apiFileTypes: ['collection'],
  },
};

export function getContentTypeForFileType(fileType: string): ContentType | null {
  if (['image', 'video'].includes(fileType)) return 'media';
  if (['thought', 'text'].includes(fileType)) return 'thoughts';
  if (fileType === 'collection') return 'collections';
  return null;
}

