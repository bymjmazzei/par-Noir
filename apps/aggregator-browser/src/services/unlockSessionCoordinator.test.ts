/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isUnlockPrefetchComplete,
  isEngagementPrefetchAllowed,
  resetUnlockSessionCoordinatorForTests,
  runUnlockPostPrefetch,
} from './unlockSessionCoordinator';

vi.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    getValidAccessToken: vi.fn(async () => 'token-1'),
  },
}));

vi.mock('./storageApiClient', () => ({
  canonicalStorageAccountsPnId: (id: string) => (id.startsWith('pn-') ? id.slice(3) : id),
  fetchStorageAccounts: vi.fn(async () => ({ connected: true, accounts: [], socialCloudProvider: null })),
}));

vi.mock('./connectionService', () => ({
  prefetchConnectionsList: vi.fn(async () => []),
}));

vi.mock('./ownerApiHeaders', () => ({
  waitForOwnerCloudAccess: vi.fn(async () => true),
}));

const { fetchStorageAccounts } = await import('./storageApiClient');
const { prefetchConnectionsList } = await import('./connectionService');
const { waitForOwnerCloudAccess } = await import('./ownerApiHeaders');

describe('runUnlockPostPrefetch', () => {
  afterEach(() => {
    resetUnlockSessionCoordinatorForTests();
    vi.clearAllMocks();
  });

  it('dedupes parallel callers for the same pn', async () => {
    const a = runUnlockPostPrefetch('pn-test-user');
    const b = runUnlockPostPrefetch('pn-test-user');
    await Promise.all([a, b]);
    expect(fetchStorageAccounts).toHaveBeenCalledTimes(1);
    expect(waitForOwnerCloudAccess).toHaveBeenCalled();
    expect(prefetchConnectionsList).toHaveBeenCalledTimes(1);
    expect(isUnlockPrefetchComplete('pn-test-user')).toBe(true);
    expect(isEngagementPrefetchAllowed()).toBe(true);
  });

  it('skips did:key identifiers', async () => {
    await runUnlockPostPrefetch('did:key:abc');
    expect(fetchStorageAccounts).not.toHaveBeenCalled();
  });

  it('marks complete even when cloud AT never arrives (connections deferred)', async () => {
    vi.mocked(waitForOwnerCloudAccess).mockResolvedValueOnce(false);
    await runUnlockPostPrefetch('pn-test-user');
    expect(isUnlockPrefetchComplete('pn-test-user')).toBe(true);
    expect(prefetchConnectionsList).not.toHaveBeenCalled();
    expect(isEngagementPrefetchAllowed()).toBe(true);
  });
});
