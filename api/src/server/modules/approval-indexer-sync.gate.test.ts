/**
 * @jest-environment node
 *
 * Falsification: registry sync could upsert oauth_clients without mirroring active
 * L5 clients into third_party_indexers for community feed discovery.
 */

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false,
}));

const mockQuery = jest.fn();

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    connect: jest.fn(),
  }),
}));

import { ThirdPartyIndexersService } from './thirdPartyIndexersService';

describe('approval-indexer-sync gate', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    const service = ThirdPartyIndexersService.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).isSeeded = false;
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 }) // legacy DELETE in seedIndexersIfNeeded
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // COUNT — skip default seed
  });

  it('ThirdPartyIndexersService.upsertIndexerFromOAuthClient upserts row', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const service = ThirdPartyIndexersService.getInstance();
    await service.upsertIndexerFromOAuthClient({
      clientId: 'community-demo-app',
      name: 'Community Demo',
      description: 'Approved L5 indexer',
      status: 'active',
    });

    expect(mockQuery).toHaveBeenCalledTimes(3);
    const upsertCall = mockQuery.mock.calls[2];
    expect(String(upsertCall[0])).toMatch(/INSERT INTO third_party_indexers/i);
    expect(upsertCall[1]).toEqual([
      'community-demo-app',
      'Community Demo',
      'Approved L5 indexer',
      'active',
      ['index_media'],
    ]);
  });
});
