/**
 * On-demand Google Fonts CSS injection for Pen / Pen Mini editors.
 * Batches families so scrolling the full catalog does not open one link per row.
 */

import { googleFontsCssUrl, isGooglePenFont } from '@par-noir/pen-protocol';

const injected = new Set<string>();
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Max families per CSS2 stylesheet request (URL length budget). */
const BATCH_SIZE = 24;
const FLUSH_MS = 50;

function flushPending(): void {
  flushTimer = null;
  const batch: string[] = [];
  for (const fam of pending) {
    if (injected.has(fam)) {
      pending.delete(fam);
      continue;
    }
    batch.push(fam);
    pending.delete(fam);
    if (batch.length >= BATCH_SIZE) break;
  }
  if (!batch.length) {
    if (pending.size) scheduleFlush();
    return;
  }
  for (const fam of batch) injected.add(fam);
  const href = googleFontsCssUrl(batch);
  if (!href || typeof document === 'undefined') return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.penGoogleFonts = batch.join(',');
  document.head.appendChild(link);
  if (pending.size) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = setTimeout(flushPending, FLUSH_MS);
}

/** Queue a Google family for stylesheet load (idempotent, batched). */
export function ensureGoogleFontLoaded(family: string): void {
  if (typeof document === 'undefined') return;
  const fam = family.trim();
  if (!fam || !isGooglePenFont(fam) || injected.has(fam)) return;
  pending.add(fam);
  scheduleFlush();
}

export function ensureGoogleFontsLoaded(families: string[]): void {
  for (const f of families) ensureGoogleFontLoaded(f);
}

export function isGoogleFontCssQueuedOrLoaded(family: string): boolean {
  const fam = family.trim();
  return injected.has(fam) || pending.has(fam);
}
