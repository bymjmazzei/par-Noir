/**
 * On-demand Google Fonts CSS injection for Pen / Pen Mini editors.
 */

import { googleFontsCssUrl, isGooglePenFont } from '@par-noir/pen-protocol';

const injected = new Set<string>();

export function ensureGoogleFontLoaded(family: string): void {
  if (typeof document === 'undefined') return;
  const fam = family.trim();
  if (!fam || !isGooglePenFont(fam) || injected.has(fam)) return;
  const href = googleFontsCssUrl([fam]);
  if (!href) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.penGoogleFont = fam;
  document.head.appendChild(link);
  injected.add(fam);
}

export function ensureGoogleFontsLoaded(families: string[]): void {
  for (const f of families) ensureGoogleFontLoaded(f);
}
