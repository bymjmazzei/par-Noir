/**
 * Feed Category Constants
 * Defines the 20 initial niche categories for curated feeds
 */

import { FeedCategory } from '../types/aggregator';

export interface FeedCategoryInfo {
  id: FeedCategory;
  name: string;
  description: string;
  icon?: string;
}

export const FEED_CATEGORIES: Record<FeedCategory, FeedCategoryInfo> = {
  'beauty-fashion': {
    id: 'beauty-fashion',
    name: 'Beauty & Fashion',
    description: 'Makeup tutorials, fashion trends, skincare, style inspiration'
  },
  'sports-fitness': {
    id: 'sports-fitness',
    name: 'Sports & Fitness',
    description: 'Athletic performance, workout routines, sports highlights, nutrition'
  },
  'tv-film-entertainment': {
    id: 'tv-film-entertainment',
    name: 'TV, Film & Entertainment',
    description: 'Movie reviews, TV show discussions, celebrity news, trailers'
  },
  'music-performing-arts': {
    id: 'music-performing-arts',
    name: 'Music & Performing Arts',
    description: 'Music production, concerts, dance, theater, album reviews'
  },
  'gaming-esports': {
    id: 'gaming-esports',
    name: 'Gaming & Esports',
    description: 'Game reviews, esports tournaments, streaming, game development'
  },
  'technology-gadgets': {
    id: 'technology-gadgets',
    name: 'Technology & Gadgets',
    description: 'Tech reviews, gadget unboxings, software tutorials, AI/ML'
  },
  'home-interior-design': {
    id: 'home-interior-design',
    name: 'Home & Interior Design',
    description: 'Home decor, DIY projects, renovation, organization, architecture'
  },
  'food-culinary': {
    id: 'food-culinary',
    name: 'Food & Culinary',
    description: 'Recipes, restaurant reviews, cooking tutorials, food photography'
  },
  'travel-adventure': {
    id: 'travel-adventure',
    name: 'Travel & Adventure',
    description: 'Travel guides, destination reviews, adventure sports, photography'
  },
  'wellness-mental-health': {
    id: 'wellness-mental-health',
    name: 'Wellness & Mental Health',
    description: 'Meditation, therapy, self-care, mindfulness, holistic health'
  },
  'business-entrepreneurship': {
    id: 'business-entrepreneurship',
    name: 'Business & Entrepreneurship',
    description: 'Startup advice, business strategies, marketing, finance'
  },
  'science-education': {
    id: 'science-education',
    name: 'Science & Education',
    description: 'Educational content, scientific discoveries, tutorials, research'
  },
  'art-design': {
    id: 'art-design',
    name: 'Art & Design',
    description: 'Digital art, traditional art, graphic design, illustration'
  },
  'diy-maker-culture': {
    id: 'diy-maker-culture',
    name: 'DIY & Maker Culture',
    description: 'Crafts, woodworking, electronics, 3D printing, repairs'
  },
  'parenting-family-life': {
    id: 'parenting-family-life',
    name: 'Parenting & Family Life',
    description: 'Parenting advice, family activities, child development'
  },
  'eco-sustainability': {
    id: 'eco-sustainability',
    name: 'Eco & Sustainability',
    description: 'Environmentalism, sustainable living, climate action, zero waste'
  },
  'finance-investing': {
    id: 'finance-investing',
    name: 'Finance & Investing',
    description: 'Personal finance, investing strategies, crypto, real estate'
  },
  'motors-automotive': {
    id: 'motors-automotive',
    name: 'Motors & Automotive',
    description: 'Car reviews, modifications, racing, motorcycles, restoration'
  },
  'humor-meme-culture': {
    id: 'humor-meme-culture',
    name: 'Humor & Meme Culture',
    description: 'Memes, comedy sketches, parodies, internet humor'
  },
  'adults-only': {
    id: 'adults-only',
    name: 'Adults Only (18+)',
    description: 'Umbrella category for all 18+ restricted content'
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

