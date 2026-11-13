/** What an embedded post may show, and where its links point. */

import { isPenFeedPlaybackMetadata } from '@par-noir/feed-tile';
import { hasFeedPreviewPlayback, type FeedPlaybackMetadata } from '../services/feedPreviewPlayback';

export type EmbedPostAspect = '9/16' | '16/9' | '1/1';

/** Why a post cannot be embedded, or null when it can. */
export type EmbedRefusal = 'not_found' | 'private' | 'not_pen' | null;

/** Only public Pen posts with public feed media embed; drafts, templates and private files never do. */
export function embedPostRefusal(meta: Record<string, unknown> | null | undefined): EmbedRefusal {
  if (!meta) return 'not_found';
  if (meta.isPublic === false || meta.isPublic === 'false') return 'private';
  if (!isPenFeedPlaybackMetadata(meta)) return 'not_pen';
  const isCollection = collectionMemberIds(meta).length > 0;
  if (!isCollection && !hasFeedPreviewPlayback(meta as FeedPlaybackMetadata)) return 'private';
  return null;
}

export function collectionMemberIds(meta: Record<string, unknown>): string[] {
  const collection = meta.collection as { collectionFileIds?: unknown } | undefined;
  const ids = collection?.collectionFileIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && !!id) : [];
}

export function embedPostAspect(meta: Record<string, unknown>): EmbedPostAspect {
  const aspect = meta.galleryAspect;
  return aspect === '16/9' ? '16/9' : aspect === '1/1' ? '1/1' : '9/16';
}

/** Share links from an embed open the full feed, not the embed route. */
export function browseBaseUrl(origin = window.location.origin): string {
  return `${origin}/`;
}
