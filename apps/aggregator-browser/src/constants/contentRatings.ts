/**
 * Content Rating Constants (Simplified)
 * Simple binary system: Public (default) or NSFW
 */

/**
 * Check if content is NSFW
 */
export function isNSFWContent(metadata: { isNSFW?: boolean }): boolean {
  return metadata.isNSFW === true;
}

/**
 * Get default content rating (always Public/not NSFW)
 */
export function getDefaultContentRating(): boolean {
  return false; // false = Public (default)
}