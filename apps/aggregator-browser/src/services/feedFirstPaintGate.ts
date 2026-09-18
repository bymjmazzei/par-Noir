/**
 * Page-load gate: brand splash until the first successful feed poster paints.
 * Resets on full navigation/refresh (in-memory only). Survives in-app feed switches.
 * Also cleared on lock/logout via resetFeedFirstPaintGate().
 */
export type FeedSplashMode = 'loading' | 'network' | 'empty';

const LEGACY_STORAGE_KEY = 'pn_feed_first_paint_done';

let memoryDone = false;
let splashMode: FeedSplashMode = 'loading';
let mediaRetryEpoch = 0;
const listeners = new Set<() => void>();

function clearLegacyStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function notify(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeFeedFirstPaint(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isFeedFirstPaintDone(): boolean {
  return memoryDone;
}

export function getFeedSplashMode(): FeedSplashMode {
  return splashMode;
}

export function getFeedMediaRetryEpoch(): number {
  return mediaRetryEpoch;
}

export function setFeedSplashMode(mode: FeedSplashMode): void {
  if (splashMode === mode) return;
  splashMode = mode;
  notify();
}

/** Network retry while splash is still active. */
export function requestFeedMediaRetry(): void {
  mediaRetryEpoch += 1;
  splashMode = 'loading';
  notify();
}

export function markFeedFirstPaintDone(): void {
  if (memoryDone) return;
  memoryDone = true;
  splashMode = 'loading';
  notify();
}

export function resetFeedFirstPaintGate(): void {
  memoryDone = false;
  splashMode = 'loading';
  clearLegacyStorage();
  notify();
}

export function shouldShowFeedBrandSplash(): boolean {
  return !memoryDone;
}

clearLegacyStorage();
