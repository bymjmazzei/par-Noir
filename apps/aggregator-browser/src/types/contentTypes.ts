/**
 * Content Type Definitions
 * 
 * Defines the mapping between content types (media, thoughts, collections) and
 * how they should be queried from the API and filtered.
 */

export type ContentType = 'media' | 'thoughts' | 'collections';

export interface ContentTypeConfig {
  // Config is kept for potential future use, but filtering is now contentClass-based
}

export const CONTENT_TYPE_MAP: Record<ContentType, ContentTypeConfig> = {
  media: {},
  thoughts: {},
  collections: {},
};


