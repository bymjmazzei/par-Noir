/**
 * Content Rating Constants
 * Defines rating tiers, age restrictions, and descriptions
 */

import { ContentRating, ContentRatingInfo, WarningTag } from '../types/aggregator';

export const CONTENT_RATINGS: Record<ContentRating, ContentRatingInfo> = {
  'GA': {
    rating: 'GA',
    ageRestriction: 0,
    requiresVerification: false,
    description: 'All Audiences - Content suitable for all ages. No mature themes, violence, profanity, or sexual content.'
  },
  '18+': {
    rating: '18+',
    ageRestriction: 18,
    requiresVerification: true,
    description: '18+ - Content for mature audiences 18 and older. Explicit language, adult themes, potential non-explicit sexual content.'
  },
  'NSFW': {
    rating: 'NSFW',
    ageRestriction: 18,
    requiresVerification: true,
    description: 'NSFW - Adult content not suitable for workplace viewing. Strong sexual implications, nudity, graphic violence, explicit adult humor.'
  },
  'X': {
    rating: 'X',
    ageRestriction: 18,
    requiresVerification: true,
    description: 'X - Hardcore adult content. Hardcore sexual content or extreme violence. Hidden by default.'
  }
};

export const RATING_ORDER: ContentRating[] = ['GA', '18+', 'NSFW', 'X'];

/**
 * Check if a rating is acceptable based on max rating
 */
export function isRatingAcceptable(rating: ContentRating, maxRating: ContentRating): boolean {
  const ratingIndex = RATING_ORDER.indexOf(rating);
  const maxIndex = RATING_ORDER.indexOf(maxRating);
  return ratingIndex <= maxIndex;
}

/**
 * Get all ratings up to and including the max rating
 */
export function getAcceptableRatings(maxRating: ContentRating): ContentRating[] {
  const maxIndex = RATING_ORDER.indexOf(maxRating);
  return RATING_ORDER.slice(0, maxIndex + 1);
}

export const WARNING_TAGS: Record<WarningTag, string> = {
  'violence': 'Contains violent content',
  'substance-use': 'Depicts drug or alcohol use',
  'hate-speech': 'Contains potentially offensive language',
  'graphic-content': 'Contains graphic imagery',
  'sexual-content': 'Contains sexual themes',
  'language': 'Contains strong language'
};

