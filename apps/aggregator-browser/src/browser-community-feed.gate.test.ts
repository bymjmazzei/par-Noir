/**
 * Falsification: community feed ids could fail to parse or stay off the rail when subscribed.
 */
import { describe, expect, it } from 'vitest';
import { buildFeedRailItems } from './components/FeedRail';
import { parseCommunityFeedId } from './utils/communityFeed';

describe('browser community feed gate', () => {
  it("parseCommunityFeedId('community-48') === '48'", () => {
    expect(parseCommunityFeedId('community-48')).toBe('48');
  });

  it('buildFeedRailItems includes community item when subscribed', () => {
    const items = buildFeedRailItems(
      [],
      [],
      'public',
      true,
      false,
      ['48'],
      [{ id: '48', name: 'Demo Community' }]
    );
    expect(items.some((item) => item.feedId === 'community-48' && item.name === 'DEMO COMMUNITY')).toBe(
      true
    );
  });
});
