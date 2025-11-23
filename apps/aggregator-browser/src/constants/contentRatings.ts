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
 * Get default NSFW setting (always Public/not NSFW)
 */
export function getDefaultIsNsfw(): boolean {
  return false; // false = Public (default)
}

/**
 * Check if NSFW content is acceptable for user
 */
export function isNsfwAcceptable(contentIsNsfw: boolean, userPrefersNsfw: boolean): boolean {
  if (!contentIsNsfw) {
    return true; // Public content is always acceptable
  }
  return userPrefersNsfw; // NSFW content is acceptable only if user prefers it
}