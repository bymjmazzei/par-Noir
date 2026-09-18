/**
 * Page-load gate: brand splash until the first successful feed poster paints.
 * Resets on full navigation/refresh (in-memory only). Survives in-app feed switches.
 * Also cleared on lock/logout via resetFeedFirstPaintGate().
 */
const LEGACY_STORAGE_KEY = 'pn_feed_first_paint_done';

let memoryDone = false;

function clearLegacyStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isFeedFirstPaintDone(): boolean {
  return memoryDone;
}

export function markFeedFirstPaintDone(): void {
  memoryDone = true;
}

export function resetFeedFirstPaintGate(): void {
  memoryDone = false;
  clearLegacyStorage();
}

// Drop prior sessionStorage flag from older builds so refresh behavior matches page-load scope.
clearLegacyStorage();
