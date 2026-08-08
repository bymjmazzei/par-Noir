/**
 * Exercises the cache against the real `getCache` contract, where a miss, a
 * stored null, and a disconnected Redis are all indistinguishable. Any hint
 * scheme that needs to tell those apart is broken in production.
 */

jest.mock('../utils/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCache: jest.fn().mockResolvedValue(undefined),
}));

import {
  getCachedGrant,
  setCachedGrant,
  invalidateCachedGrant,
} from '../modules/oauthPermissionCache';
import { getCache, setCache, deleteCache } from '../utils/cache';

const mockGetCache = getCache as jest.Mock;
const mockSetCache = setCache as jest.Mock;
const mockDeleteCache = deleteCache as jest.Mock;

const PN = 'pn-59e4692524b7';
const KEY = `oauth:grant:browser-app:${PN}`;

describe('oauthPermissionCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null on a miss', async () => {
    mockGetCache.mockResolvedValue(null);
    expect(await getCachedGrant('browser-app', PN)).toBeNull();
  });

  it('returns the stored hint on a hit', async () => {
    mockGetCache.mockResolvedValue({
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21'],
    });

    expect(await getCachedGrant('browser-app', PN)).toEqual({
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21'],
    });
  });

  it('ignores a malformed hint rather than trusting it', async () => {
    mockGetCache.mockResolvedValue({ ageShared: true });
    expect(await getCachedGrant('browser-app', PN)).toBeNull();
  });

  it('normalizes a bare pn identifier into the same key', async () => {
    mockGetCache.mockResolvedValue(null);
    await getCachedGrant('browser-app', '59e4692524b7');
    expect(mockGetCache).toHaveBeenCalledWith(KEY);
  });

  it('writes a positive hint with a TTL', async () => {
    await setCachedGrant('browser-app', PN, {
      dataPoints: ['over_21'],
      consideredDataPoints: ['over_21'],
    });

    expect(mockSetCache).toHaveBeenCalledWith(
      KEY,
      { dataPoints: ['over_21'], consideredDataPoints: ['over_21'] },
      expect.any(Number)
    );
  });

  it('deletes rather than storing a negative on invalidate', async () => {
    await invalidateCachedGrant('browser-app', PN);
    expect(mockDeleteCache).toHaveBeenCalledWith(KEY);
    expect(mockSetCache).not.toHaveBeenCalled();
  });

  it('reads back nothing after invalidate', async () => {
    await invalidateCachedGrant('browser-app', PN);
    mockGetCache.mockResolvedValue(null);
    expect(await getCachedGrant('browser-app', PN)).toBeNull();
  });
});
