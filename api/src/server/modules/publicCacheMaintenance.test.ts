/**
 * @jest-environment node
 */
import { shrinkServerPersonRows } from './publicCacheMaintenance';
import { getDatabasePool } from '../utils/database';

jest.mock('../utils/database', () => ({
  getDatabasePool: jest.fn(),
}));

describe('shrinkServerPersonRows', () => {
  it('copies counts and deletes person rows and device tokens', async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    (getDatabasePool as jest.Mock).mockReturnValue({
      connect: async () => client,
    });

    await shrinkServerPersonRows();

    const sql = queries.join('\n');
    expect(sql).toContain('INSERT INTO engagement_public_counts');
    expect(sql).toContain('DELETE FROM engagement');
    expect(sql).toContain('DELETE FROM feed_subscriptions');
    expect(sql).toContain('DELETE FROM creator_subscriber_index');
    expect(sql).toContain('DELETE FROM user_tag_preferences');
    expect(sql).toContain('DELETE FROM device_tokens');
    expect(sql).not.toContain('poll_vote_cache');
    expect(sql).not.toContain('storage_cloud_vault');
    expect(queries[0]).toBe('BEGIN');
    expect(queries[queries.length - 1]).toBe('COMMIT');
  });
});
