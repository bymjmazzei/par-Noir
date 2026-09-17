/**
 * Session-scoped feed media blob URLs keyed by fileId + variant.
 * Survives FullScreenFeed remounts / feed switches until LRU eviction or clear().
 */
import type { FeedPreviewVariant } from '@par-noir/aggregator-domain';

export type FeedMediaCacheKey = `${string}:${FeedPreviewVariant}`;

export type FeedMediaCacheEntry = {
  objectUrl: string;
};

const DEFAULT_MAX_ENTRIES = 100;

function cacheKey(fileId: string, variant: FeedPreviewVariant): FeedMediaCacheKey {
  return `${fileId}:${variant}`;
}

export class FeedMediaSessionCache {
  private readonly maxEntries: number;
  /** Insertion / touch order: oldest at index 0 */
  private readonly order: FeedMediaCacheKey[] = [];
  private readonly map = new Map<FeedMediaCacheKey, FeedMediaCacheEntry>();
  private revokeUrl: (url: string) => void;

  constructor(
    maxEntries: number = DEFAULT_MAX_ENTRIES,
    revokeUrl: (url: string) => void = (url) => {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
  ) {
    this.maxEntries = Math.max(1, maxEntries);
    this.revokeUrl = revokeUrl;
  }

  has(fileId: string, variant: FeedPreviewVariant): boolean {
    return this.map.has(cacheKey(fileId, variant));
  }

  get(fileId: string, variant: FeedPreviewVariant): FeedMediaCacheEntry | null {
    const key = cacheKey(fileId, variant);
    const entry = this.map.get(key);
    if (!entry) return null;
    this.touch(key);
    return entry;
  }

  getObjectUrl(fileId: string, variant: FeedPreviewVariant): string | null {
    return this.get(fileId, variant)?.objectUrl ?? null;
  }

  set(fileId: string, variant: FeedPreviewVariant, objectUrl: string): void {
    const key = cacheKey(fileId, variant);
    const existing = this.map.get(key);
    if (existing) {
      if (existing.objectUrl !== objectUrl) {
        this.revokeUrl(existing.objectUrl);
      }
      this.map.set(key, { objectUrl });
      this.touch(key);
      return;
    }
    this.map.set(key, { objectUrl });
    this.order.push(key);
    this.evictIfNeeded();
  }

  /** Drop all variants for a fileId. */
  revoke(fileId: string): void {
    const prefix = `${fileId}:`;
    const keys = this.order.filter((k) => k.startsWith(prefix));
    for (const key of keys) {
      this.deleteKey(key);
    }
  }

  clear(): void {
    for (const key of [...this.order]) {
      this.deleteKey(key);
    }
  }

  size(): number {
    return this.map.size;
  }

  /** Test helper */
  keys(): FeedMediaCacheKey[] {
    return [...this.order];
  }

  private touch(key: FeedMediaCacheKey): void {
    const idx = this.order.indexOf(key);
    if (idx >= 0) {
      this.order.splice(idx, 1);
      this.order.push(key);
    }
  }

  private evictIfNeeded(): void {
    while (this.map.size > this.maxEntries && this.order.length > 0) {
      const oldest = this.order[0];
      this.deleteKey(oldest);
    }
  }

  private deleteKey(key: FeedMediaCacheKey): void {
    const entry = this.map.get(key);
    if (entry) {
      this.revokeUrl(entry.objectUrl);
      this.map.delete(key);
    }
    const idx = this.order.indexOf(key);
    if (idx >= 0) this.order.splice(idx, 1);
  }
}

/** Process-wide session cache for browse feed media. */
export const feedMediaSessionCache = new FeedMediaSessionCache();

export function clearFeedMediaSessionCache(): void {
  feedMediaSessionCache.clear();
}
