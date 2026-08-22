/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchStorageAccounts,
  invalidateStorageAccountsCache
} from './storageApiClient';

vi.mock('./ownerApiHeaders', () => ({
  ownerApiHeadersAsync: vi.fn(async () => ({ Authorization: 'Bearer t' }))
}));

describe('fetchStorageAccounts cache', () => {
  afterEach(() => {
    invalidateStorageAccountsCache();
    vi.unstubAllGlobals();
  });

  it('serves a second caller from memory without another fetch', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        accounts: [{ provider: 'google_drive', accountId: 'acc-1' }]
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const a = await fetchStorageAccounts('token', 'pn-test');
    const b = await fetchStorageAccounts('token', 'pn-test');

    expect(a.connected).toBe(true);
    expect(b.accounts).toEqual(a.accounts);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent fetches', async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const p1 = fetchStorageAccounts('token', 'pn-concurrent');
    const p2 = fetchStorageAccounts('token', 'pn-concurrent');
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    resolveFetch({
      ok: true,
      json: async () => ({ accounts: [{ provider: 'google_drive', accountId: 'a' }] })
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
