import { describe, expect, it } from 'vitest';
import { emptySection } from './richDoc.js';
import {
  adjacentPageSlug,
  appendDocPage,
  removeDocPage,
  reorderDocPages,
  orientationFromPageSize,
  resolvePageOrientation
} from './pageView.js';

describe('pageView', () => {
  it('keeps page shape separate from the older horizontal view', () => {
    expect(resolvePageOrientation(undefined, 'horizontal')).toBe('landscape');
    expect(resolvePageOrientation(undefined, 'vertical')).toBe('portrait');
    expect(resolvePageOrientation('portrait', 'horizontal')).toBe('portrait');
    expect(orientationFromPageSize(1080, 1920, 'landscape')).toBe('portrait');
    expect(orientationFromPageSize(1920, 1080)).toBe('landscape');
    expect(orientationFromPageSize(null, null, 'landscape')).toBe('landscape');
  });

  it('removes a page and selects the neighbor, and keeps the last page', () => {
    const added = appendDocPage([emptySection('body')], ['body']);
    const two = appendDocPage(added.sections, added.toc);
    const removed = removeDocPage(two.sections, two.toc, 'body');
    expect(removed?.toc).toEqual(['page-2', 'page-3']);
    expect(removed?.slug).toBe('page-2');
    expect(removed?.sections.map((section) => section.slug)).toEqual(['page-2', 'page-3']);
    expect(removeDocPage(removed!.sections, removed!.toc, 'page-3')?.slug).toBe('page-2');
    expect(removeDocPage([emptySection('body')], ['body'], 'body')).toBeNull();
  });

  it('moves a middle page to the front', () => {
    const first = appendDocPage([emptySection('body')], ['body']);
    const second = appendDocPage(first.sections, first.toc);
    const moved = reorderDocPages(second.sections, second.toc, 1, 0);
    expect(moved.toc).toEqual(['page-2', 'body', 'page-3']);
    expect(moved.sections.map((section) => section.slug)).toEqual(['page-2', 'body', 'page-3']);
  });

  it('flips to the next and previous page and stays at the ends', () => {
    const toc = ['body', 'page-2', 'page-3'];
    expect(adjacentPageSlug(toc, 'body', 1)).toBe('page-2');
    expect(adjacentPageSlug(toc, 'page-2', -1)).toBe('body');
    expect(adjacentPageSlug(toc, 'body', -1)).toBe('body');
    expect(adjacentPageSlug(toc, 'page-3', 1)).toBe('page-3');
  });
});
