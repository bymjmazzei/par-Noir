/**
 * Live preview page arrangement. Pages are document sections in toc order.
 */

import { emptySection } from './richDoc.js';
import type { PenPageLayout, PenPageView, PenSectionContent } from './types.js';

/** Width of one page in a screen strip, CSS px. */
export const SCREEN_PAGE_WIDTH_PX = 320;

/** Letter and A4 stack. Flow docs (social, widgets, and the rest) sit side by side. */
export function defaultPageView(pageLayout?: PenPageLayout | null): PenPageView {
  if (pageLayout === 'letter' || pageLayout === 'a4') return 'vertical';
  return 'horizontal';
}

export function resolvePageView(
  pageView: PenPageView | undefined,
  pageLayout?: PenPageLayout | null
): PenPageView {
  return pageView || defaultPageView(pageLayout);
}

/** Published swipe. Screen is one strip, so it does not swipe. */
export function pageSwipeAxisForView(view: PenPageView): 'x' | 'y' | undefined {
  if (view === 'screen') return undefined;
  return view === 'vertical' ? 'y' : 'x';
}

/** Screen strip is the pages in one row. A 3-page doc is three page-widths wide. */
export function screenStripWidthPx(pageCount: number, pageWidthPx: number): number {
  const count = Math.max(1, Math.round(pageCount) || 1);
  const width = Math.max(1, Math.round(pageWidthPx) || 1);
  return count * width;
}

export function appendDocPage(
  sections: PenSectionContent[],
  toc: string[]
): { sections: PenSectionContent[]; toc: string[]; slug: string } {
  const used = new Set([...toc, ...sections.map((section) => section.slug)]);
  let n = Math.max(sections.length, toc.length) + 1;
  let slug = `page-${n}`;
  while (used.has(slug)) {
    n += 1;
    slug = `page-${n}`;
  }
  return {
    sections: [...sections, emptySection(slug)],
    toc: [...toc, slug],
    slug
  };
}

/** Drop one page. The last remaining page stays. Selects the page that follows, or the one before. */
export function removeDocPage(
  sections: PenSectionContent[],
  toc: string[],
  slug: string
): { sections: PenSectionContent[]; toc: string[]; slug: string } | null {
  if (toc.length <= 1) return null;
  const index = toc.indexOf(slug);
  if (index < 0) return null;
  const nextToc = toc.filter((item) => item !== slug);
  const neighbor = nextToc[Math.min(index, nextToc.length - 1)];
  return {
    sections: sections.filter((section) => section.slug !== slug),
    toc: nextToc,
    slug: neighbor
  };
}

/** Previous or next page in toc order. Stays put at either end. */
export function adjacentPageSlug(toc: string[], activeSlug: string, direction: -1 | 1): string {
  const index = Math.max(0, toc.indexOf(activeSlug));
  const next = index + direction;
  if (next < 0 || next >= toc.length) return toc[index] || activeSlug;
  return toc[next];
}
