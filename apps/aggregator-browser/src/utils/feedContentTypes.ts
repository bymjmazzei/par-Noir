import type { ContentType } from '../types/contentTypes';
import { COMMUNITY_FEED_PREFIX } from './communityFeed';

const ALL_CONTENT_TYPES: ContentType[] = ['media', 'notes', 'collections'];

/** Content classes needed for the active feed tab (discovery loads none). */
export function getContentTypesForFeed(activeFeedId: string): ContentType[] {
  if (activeFeedId === 'discovery') return [];
  if (activeFeedId.startsWith(COMMUNITY_FEED_PREFIX)) return ALL_CONTENT_TYPES;
  if (activeFeedId === 'media') return ['media'];
  if (activeFeedId === 'notes') return ['notes'];
  if (activeFeedId === 'collections') return ['collections'];
  return ALL_CONTENT_TYPES;
}

export function contentClassToContentType(
  contentClass: 'media' | 'note' | 'collection'
): ContentType {
  if (contentClass === 'note') return 'notes';
  if (contentClass === 'collection') return 'collections';
  return 'media';
}

export const CONTENT_CLASS_BY_TYPE: Record<
  ContentType,
  'media' | 'note' | 'collection'
> = {
  media: 'media',
  notes: 'note',
  collections: 'collection',
};
