import { describe, expect, it } from 'vitest';
import { viewsForFeedPage } from './feedPageViews';

const engagement = {
  views: 40,
  likes: 0,
  comments: 0,
  shares: 0,
  lastUpdated: '2026-01-01T00:00:00.000Z',
  pageViews: { cover: 40, menu: 22 }
};

describe('viewsForFeedPage', () => {
  it('shows the current page count and position on multipage posts', () => {
    expect(viewsForFeedPage(engagement, { index: 1, slug: 'menu', count: 5 })).toEqual({ count: 22, position: '2/5' });
    expect(viewsForFeedPage(engagement, { index: 4, slug: 'offer', count: 5 })).toEqual({ count: 0, position: '5/5' });
  });

  it('keeps the post total on single-page posts and parts without slugs', () => {
    expect(viewsForFeedPage(engagement)).toEqual({ count: 40 });
    expect(viewsForFeedPage(engagement, { index: 0, slug: 'cover', count: 1 })).toEqual({ count: 40 });
    expect(viewsForFeedPage(engagement, { index: 2, slug: '', count: 3 })).toEqual({ count: 40 });
  });
});
