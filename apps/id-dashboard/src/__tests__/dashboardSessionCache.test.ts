/**
 * @jest-environment jsdom
 */
import {
  __resetDashboardSessionCacheForTests,
  getOwnedAssetsCached,
  invalidateDashboardCache,
} from '../services/dashboardSessionCache';

const fetchOwnedAssets = jest.fn();

jest.mock('../services/ownedAssetsApi', () => ({
  fetchOwnedAssets: (...args: unknown[]) => fetchOwnedAssets(...args),
}));

jest.mock('../services/ownerApiService', () => ({
  ownerGet: jest.fn(),
}));

jest.mock('../services/monetization/MonetizationService', () => ({
  MonetizationService: {
    getStatus: jest.fn(),
  },
}));

jest.mock('../services/storage/cloudSessionBootstrap', () => ({
  getStorageAccountsCache: () => null,
  setStorageAccountsCacheEntry: jest.fn(),
}));

describe('dashboardSessionCache', () => {
  beforeEach(() => {
    __resetDashboardSessionCacheForTests();
    jest.clearAllMocks();
    fetchOwnedAssets.mockResolvedValue([{ id: 'a1' }]);
  });

  it('single-flights parallel owned-assets fetches', async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    fetchOwnedAssets.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = getOwnedAssetsCached('tok', 'pn-abc');
    const p2 = getOwnedAssetsCached('tok', 'pn-abc');
    expect(fetchOwnedAssets).toHaveBeenCalledTimes(1);

    resolveFetch([{ id: 'a1' }]);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual([{ id: 'a1' }]);
    expect(r2).toEqual([{ id: 'a1' }]);
    expect(fetchOwnedAssets).toHaveBeenCalledTimes(1);
  });

  it('returns cache hit until invalidate', async () => {
    await getOwnedAssetsCached('tok', 'pn-abc');
    await getOwnedAssetsCached('tok', 'pn-abc');
    expect(fetchOwnedAssets).toHaveBeenCalledTimes(1);

    invalidateDashboardCache('owned-assets', 'pn-abc');
    await getOwnedAssetsCached('tok', 'pn-abc');
    expect(fetchOwnedAssets).toHaveBeenCalledTimes(2);
  });

  it('force bypasses cache', async () => {
    await getOwnedAssetsCached('tok', 'pn-abc');
    await getOwnedAssetsCached('tok', 'pn-abc', { force: true });
    expect(fetchOwnedAssets).toHaveBeenCalledTimes(2);
  });
});
