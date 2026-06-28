import type { ContentType } from '../types/contentTypes';

const ALL_CONTENT_TYPES: ContentType[] = ['media', 'thoughts', 'collections'];

/** Content classes needed for the active feed tab (discovery loads none). */
export function getContentTypesForFeed(activeFeedId: string): ContentType[] {
  if (activeFeedId === 'discovery') return [];
  if (activeFeedId === 'media') return ['media'];
  if (activeFeedId === 'thoughts') return ['thoughts'];
  if (activeFeedId === 'collections') return ['collections'];
  return ALL_CONTENT_TYPES;
}

export function contentClassToContentType(
  contentClass: 'media' | 'thought' | 'collection'
): ContentType {
  if (contentClass === 'thought') return 'thoughts';
  if (contentClass === 'collection') return 'collections';
  return 'media';
}

export const CONTENT_CLASS_BY_TYPE: Record<
  ContentType,
  'media' | 'thought' | 'collection'
> = {
  media: 'media',
  thoughts: 'thought',
  collections: 'collection',
};
