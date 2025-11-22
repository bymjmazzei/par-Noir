/**
 * Content Rating Constants for Dashboard
 * Simplified version for metadata editing
 */

import { ContentRating } from '../types/aggregator';

export const CONTENT_RATINGS: Record<ContentRating, { description: string }> = {
  'GA': {
    description: 'All Audiences - Content suitable for all ages'
  },
  '18+': {
    description: '18+ - Content for mature audiences 18 and older'
  },
  'NSFW': {
    description: 'NSFW - Adult content not suitable for workplace viewing'
  },
  'X': {
    description: 'X - Hardcore adult content'
  }
};

export const RATING_ORDER: ContentRating[] = ['GA', '18+', 'NSFW', 'X'];

