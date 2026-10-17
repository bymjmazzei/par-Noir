/**
 * Logs main-thread stalls with the media work in flight at that moment, so a freeze
 * names its cause in the console instead of needing a guess.
 */
import { penMediaActivity } from '@par-noir/pen-media';

export const LONG_TASK_REPORT_MS = 200;

let started = false;

export function reportLongTask(durationMs: number, startMs: number): void {
  if (durationMs < LONG_TASK_REPORT_MS) return;
  console.warn('[pen] main thread blocked', `${Math.round(durationMs)}ms`, {
    atMs: Math.round(startMs),
    media: penMediaActivity()
  });
}

export function startLongTaskWatch(): void {
  if (started || typeof PerformanceObserver === 'undefined') return;
  if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
  started = true;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) reportLongTask(entry.duration, entry.startTime);
  }).observe({ type: 'longtask', buffered: true });
}
