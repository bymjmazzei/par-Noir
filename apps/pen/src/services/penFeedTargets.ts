/**
 * Where a Pen post is aggregated. Templates are not a feed in this list.
 */

import { API_ENDPOINT } from '../config/api';

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

/** First-party rails plus feeds this owner hosts. */
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

/**
 * Make public → every active content feed.
 * A checkbox selection → only those ids, and only if they are active.
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
