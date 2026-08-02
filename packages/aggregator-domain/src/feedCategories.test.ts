import { describe, expect, it } from 'vitest';
import {
  FEED_CATEGORIES,
  FEED_CATEGORY_LIST,
  getAllFeedCategories,
  getFeedCategory,
  type FeedCategory,
} from './feedCategories';

describe('feed category catalog', () => {
  it('keys every entry by its own id', () => {
    for (const [key, info] of Object.entries(FEED_CATEGORIES)) {
      expect(info.id).toBe(key);
    }
  });

  it('gives every category a non-empty name and description', () => {
    for (const info of FEED_CATEGORY_LIST) {
      expect(info.name.trim().length).toBeGreaterThan(0);
      expect(info.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = FEED_CATEGORY_LIST.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes the full list through getAllFeedCategories', () => {
    expect(getAllFeedCategories()).toEqual(FEED_CATEGORY_LIST);
    expect(FEED_CATEGORY_LIST).toHaveLength(Object.keys(FEED_CATEGORIES).length);
  });

  it('looks up a category by id', () => {
    expect(getFeedCategory('news')).toEqual(FEED_CATEGORIES.news);
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(getFeedCategory('not-a-category' as FeedCategory)).toBeUndefined();
  });
});
