/**
 * @jest-environment node
 */
process.env.NODE_ENV = 'test';

import { FeedService } from './feedService';
import { getDatabasePool } from '../utils/database';
import { CreatorSubscriberStorage } from './creatorSubscriberStorage';

jest.mock('../utils/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('./creatorSubscriberStorage', () => ({
  CreatorSubscriberStorage: {
    storeSubscriberOnCreatorDrive: jest.fn(async () => undefined),
  },
}));

describe('public follower count', () => {
  it('changes the follower count and does not write user_did', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM feeds')) {
        return {
          rows: [
            {
              feed_id: 'feed-1',
              feed_name: 'Feed',
              creator_did: 'creator',
              creator_tier: 'feed',
              subscriber_count: 2,
              post_count: 0,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    });
    (getDatabasePool as jest.Mock).mockReturnValue({ query });

    const ok = await FeedService.subscribeToFeed('feed-1', 'pn-follower');
    expect(ok).toBe(true);
    expect(CreatorSubscriberStorage.storeSubscriberOnCreatorDrive).toHaveBeenCalled();

    const writes = query.mock.calls.map((call) => String(call[0]));
    expect(writes.some((sql) => sql.includes('subscriber_count = subscriber_count + 1'))).toBe(true);
    expect(writes.some((sql) => sql.includes('feed_subscriptions'))).toBe(false);
    expect(writes.some((sql) => sql.includes('user_did'))).toBe(false);
  });
});
