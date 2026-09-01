export const COMMUNITY_FEED_PREFIX = 'community-';

/** Parse `community-{clientId}` feed id; returns clientId or null. */
export function parseCommunityFeedId(activeFeedId: string): string | null {
  if (!activeFeedId.startsWith(COMMUNITY_FEED_PREFIX)) return null;
  const clientId = activeFeedId.slice(COMMUNITY_FEED_PREFIX.length);
  return clientId || null;
}
