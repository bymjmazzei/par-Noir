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

const { fetchStorageAccounts } = await import('./storageApiClient');
const { prefetchConnectionsList } = await import('./connectionService');

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
    expect(prefetchConnectionsList).toHaveBeenCalledTimes(1);
    expect(isUnlockPrefetchComplete('pn-test-user')).toBe(true);
    expect(isEngagementPrefetchAllowed()).toBe(true);
  });

  it('skips did:key identifiers', async () => {
    await runUnlockPostPrefetch('did:key:abc');
    expect(fetchStorageAccounts).not.toHaveBeenCalled();
  });
});
