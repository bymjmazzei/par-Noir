/**
 * Where a Pen post is aggregated. Templates are not a feed in this list.
 */

import type { FeedContentClass } from '@par-noir/pen-protocol';
import { API_ENDPOINT } from '../config/api';

const CONTENT_RAILS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'notes', name: 'Notes' },
  { id: 'media', name: 'Media' },
  { id: 'collections', name: 'Collections' }
];

/** @deprecated Legacy UI listed all rails; share now auto-picks one rail from content class. */
export const FIRST_PARTY_CONTENT_FEEDS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'public', name: 'Public' },
  { id: 'media', name: 'Media' },
  { id: 'notes', name: 'Notes' },
  { id: 'collections', name: 'Collections' }
];

export type PublishFeed = { id: string; name: string };

export async function listOwnerHostedFeeds(creatorDid: string): Promise<PublishFeed[]> {
  const pn = creatorDid.trim();
  if (!pn) return [];
  const params = new URLSearchParams();
  params.set('creatorDid', pn);
  const res = await fetch(`${API_ENDPOINT}/api/feeds?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    feeds?: Array<{ feedId?: string; feedName?: string; creatorId?: string }>;
  };
  const feeds = Array.isArray(data.feeds) ? data.feeds : [];
  return feeds
    .filter((f) => f.creatorId === pn && typeof f.feedId === 'string' && f.feedId)
    .map((f) => ({ id: f.feedId as string, name: f.feedName || (f.feedId as string) }));
}

/** User-hosted community feeds (not first-party content rails). */
export function activeHostedFeeds(hosted: PublishFeed[]): PublishFeed[] {
  const railIds = new Set(CONTENT_RAILS.map((r) => r.id));
  railIds.add('public');
  return hosted.filter((f) => !railIds.has(f.id));
}

/** @deprecated */
export function activeContentFeeds(hosted: PublishFeed[]): PublishFeed[] {
  const seen = new Set<string>();
  const out: PublishFeed[] = [];
  for (const feed of [...FIRST_PARTY_CONTENT_FEEDS, ...hosted]) {
    if (seen.has(feed.id)) continue;
    seen.add(feed.id);
    out.push(feed);
  }
  return out;
}

export function contentClassToRailId(
  contentClass: FeedContentClass
): 'notes' | 'media' | 'collections' {
  if (contentClass === 'media') return 'media';
  if (contentClass === 'collection') return 'collections';
  return 'notes';
}

export function feedContentClassLabel(contentClass: FeedContentClass): string {
  if (contentClass === 'media') return 'Media';
  if (contentClass === 'collection') return 'Collection';
  return 'Note';
}

/**
 * Primary rail from inferred post type plus optional hosted feed ids.
 */
export function resolveShareFeedIds(params: {
  contentClass: FeedContentClass;
  selectedHostedFeedIds: string[];
}): string[] {
  const rail = contentClassToRailId(params.contentClass);
  const out = new Set<string>([rail]);
  for (const id of params.selectedHostedFeedIds) {
    const trimmed = id.trim();
    if (trimmed) out.add(trimmed);
  }
  const ids = [...out];
  if (!ids.length) throw new Error('feed_required');
  return ids;
}

/**
 * @deprecated Make public → every active content feed.
 */
export function resolvePublishFeedIds(
  mode: 'all' | 'selected',
  selected: string[],
  active: PublishFeed[]
): string[] {
  const activeIds = new Set(active.map((f) => f.id));
  if (mode === 'all') return [...activeIds];
  return selected.filter((id) => activeIds.has(id));
}

export type ThirdPartyIndexer = { id: string; name: string; description?: string };

export async function listThirdPartyIndexers(pnIdentifier: string): Promise<ThirdPartyIndexer[]> {
  const pn = pnIdentifier.trim();
  if (!pn) return [];
  const endpoint = new URL(`${API_ENDPOINT}/api/third-party/indexers`);
  endpoint.searchParams.set('identity', pn);
  const res = await fetch(endpoint.toString());
  if (!res.ok) return [];
  const payload = (await res.json()) as { indexers?: ThirdPartyIndexer[] };
  return Array.isArray(payload.indexers) ? payload.indexers : [];
}
