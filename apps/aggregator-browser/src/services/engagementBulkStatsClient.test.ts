/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBulkEngagementStats,
  resetBulkStatsInflightForTests
} from './engagementBulkStatsClient';

describe('fetchBulkEngagementStats', () => {
  afterEach(() => {
    resetBulkStatsInflightForTests();
    vi.unstubAllGlobals();
  });

  it('coalesces concurrent identical batches', async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const ids = ['file-a', 'file-b'];
    const p1 = fetchBulkEngagementStats(ids, 'pn-test');
    const p2 = fetchBulkEngagementStats([...ids].reverse(), 'pn-test');

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    resolveFetch({
      ok: true,
      json: async () => ({ stats: {}, likedFiles: [] })
    });

    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
