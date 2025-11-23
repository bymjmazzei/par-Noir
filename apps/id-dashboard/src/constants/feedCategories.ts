/**
 * Feed Category Constants
 * Defines the 9 content type categories for curated feeds
 */

export type FeedCategory =
  | 'entertainment'
  | 'education'
  | 'news'
  | 'opinion'
  | 'promotion'
  | 'art'
  | 'community'
  | 'ideology'
  | 'lifestyle';

export interface FeedCategoryInfo {
  id: FeedCategory;
  name: string;
  description: string;
  icon?: string;
}

export const FEED_CATEGORIES: Record<FeedCategory, FeedCategoryInfo> = {
  'entertainment': {
    id: 'entertainment',
    name: 'Entertainment',
    description: 'Movies, TV shows, music, games, and other entertainment content'
  },
  'education': {
    id: 'education',
    name: 'Education',
    description: 'Educational content, tutorials, courses, and learning resources'
  },
  'news': {
    id: 'news',
    name: 'News',
    description: 'Current events, breaking news, and journalism'
  },
  'opinion': {
    id: 'opinion',
    name: 'Opinion',
    description: 'Opinions, commentary, reviews, and personal perspectives'
  },
  'promotion': {
    id: 'promotion',
    name: 'Promotion',
    description: 'Marketing, advertising, product promotions, and sponsored content'
  },
  'art': {
    id: 'art',
    name: 'Art',
    description: 'Visual art, digital art, photography, and creative works'
  },
  'community': {
    id: 'community',
    name: 'Community',
    description: 'Community events, discussions, social connections, and group activities'
  },
  'ideology': {
    id: 'ideology',
    name: 'Ideology',
    description: 'Political views, beliefs, philosophy, and ideological content'
  },
  'lifestyle': {
    id: 'lifestyle',
    name: 'Lifestyle',
    description: 'Fashion, food, travel, wellness, home, and lifestyle content'
  }
};

export const FEED_CATEGORY_LIST: FeedCategoryInfo[] = Object.values(FEED_CATEGORIES);

/**
 * Get feed category info by ID
 */
export function getFeedCategory(categoryId: FeedCategory): FeedCategoryInfo {
  return FEED_CATEGORIES[categoryId];
}

/**
 * Get all feed categories
 */
export function getAllFeedCategories(): FeedCategoryInfo[] {
  return FEED_CATEGORY_LIST;
}
