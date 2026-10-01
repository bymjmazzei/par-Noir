/**
 * @jest-environment node
 */
process.env.NODE_ENV = 'test';

import { EngagementService } from './engagementService';
import { getDatabasePool } from '../utils/database';

jest.mock('../utils/database', () => ({
  getDatabasePool: jest.fn(),
}));

describe('public like count', () => {
  it('changes the count and does not write a person id', async () => {
    const query = jest.fn(async () => ({ rows: [{ count: 1 }] }));
    (getDatabasePool as jest.Mock).mockReturnValue({ query });

    expect(await EngagementService.isLiked('file-1', 'pn-viewer')).toBe(false);
    expect(query).not.toHaveBeenCalled();

    await EngagementService.toggleLikePublicCount('file-1', true);

    const sql = String(query.mock.calls[0][0]);
    const params = query.mock.calls[0][1] as unknown[];
    expect(sql).toContain('engagement_public_counts');
    expect(sql).not.toContain('user_did');
    expect(params).toEqual(['file-1', 'like', 1]);
  });
});
