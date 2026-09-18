/**
 * Session-once gate: brand splash until the first successful feed poster paints.
 */
const STORAGE_KEY = 'pn_feed_first_paint_done';

let memoryDone = false;

function readStorage(): boolean {
  if (typeof sessionStorage === 'undefined') return memoryDone;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return memoryDone;
  }
}

export function isFeedFirstPaintDone(): boolean {
  if (memoryDone) return true;
  memoryDone = readStorage();
  return memoryDone;
}

export function markFeedFirstPaintDone(): void {
  memoryDone = true;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore quota */
  }
}

export function resetFeedFirstPaintGate(): void {
  memoryDone = false;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
