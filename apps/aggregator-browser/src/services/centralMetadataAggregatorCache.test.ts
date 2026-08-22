/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CentralMetadataAggregator } from './storage/CentralMetadataAggregator';

describe('CentralMetadataAggregator cache hygiene', () => {
  afterEach(() => {
    CentralMetadataAggregator.clearCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clearCache clears ttl and pending state', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ files: [], totalFiles: 0, hasMore: false })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await CentralMetadataAggregator.fetchAggregatedIndex({ contentClass: 'media', limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await CentralMetadataAggregator.fetchAggregatedIndex({ contentClass: 'media', limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    CentralMetadataAggregator.clearCache();

    await CentralMetadataAggregator.fetchAggregatedIndex({ contentClass: 'media', limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('NSFW index uses TTL like public index', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ files: [], totalFiles: 0, hasMore: false })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await CentralMetadataAggregator.fetchNSFWIndex({ limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await CentralMetadataAggregator.fetchNSFWIndex({ limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
