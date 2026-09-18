/**
 * Prefetch first N posters for a feed into the session cache (rail hover / switch).
 */
import type { IndexedFile } from '../types/aggregator';
import { hasFeedPreviewPlayback, resolvePublicMediaObjectUrl } from './feedPreviewPlayback';
import { batchSignAndCachePosters } from './feedMediaBatchSign';
import { feedMediaSessionCache } from './feedMediaSessionCache';

const PREFETCH_N = 3;
const CONCURRENCY = 3;

let prefetchGen = 0;

export function posterFileIdsForPrefetch(files: IndexedFile[], n = PREFETCH_N): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (out.length >= n) break;
    const id = f.metadata.fileId;
    if (!id || !hasFeedPreviewPlayback(f.metadata)) continue;
    if (feedMediaSessionCache.getObjectUrl(id, 'poster')) continue;
    out.push(id);
  }
  return out;
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

/**
 * Warm posters for fileIds. Prefers batch-sign; falls back to per-id resolve.
 * Newer calls cancel older in-flight work via generation token.
 */
export function prefetchFeedPosters(fileIds: string[]): void {
  const ids = [...new Set(fileIds.filter(Boolean))].slice(0, PREFETCH_N);
  if (ids.length === 0) return;
  const gen = ++prefetchGen;

  void (async () => {
    try {
      await batchSignAndCachePosters(ids);
    } catch {
      if (gen !== prefetchGen) return;
      await mapPool(ids, CONCURRENCY, async (id) => {
        if (gen !== prefetchGen) return;
        if (feedMediaSessionCache.getObjectUrl(id, 'poster')) return;
        try {
          await resolvePublicMediaObjectUrl(id, 'poster');
        } catch {
          /* ignore prefetch misses */
        }
      });
      return;
    }
    if (gen !== prefetchGen) return;
    const stillCold = ids.filter((id) => !feedMediaSessionCache.getObjectUrl(id, 'poster'));
    if (stillCold.length === 0) return;
    await mapPool(stillCold, CONCURRENCY, async (id) => {
      if (gen !== prefetchGen) return;
      try {
        await resolvePublicMediaObjectUrl(id, 'poster');
      } catch {
        /* ignore */
      }
    });
  })();
}
