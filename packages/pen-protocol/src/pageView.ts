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
