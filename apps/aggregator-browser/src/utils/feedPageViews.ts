import type { IndexedFile } from '../types/aggregator';

/** Page the viewer is on inside a multipage feed post. */
export type FeedPagePosition = { index: number; slug: string; count: number };

/** A page counts as viewed after this long on it, like the post-level view. */
export const PAGE_VIEW_DWELL_MS = 500;

/**
 * Views for the rail. Multipage posts show the current page's count and its position;
 * single-page posts (and parts published before page slugs) keep the post total.
 */
export function viewsForFeedPage(
  engagement: IndexedFile['metadata']['engagement'],
  page?: FeedPagePosition
): { count: number; position?: string } {
  if (!page || page.count < 2 || !page.slug) return { count: engagement?.views || 0 };
  return { count: engagement?.pageViews?.[page.slug] || 0, position: `${page.index + 1}/${page.count}` };
}
