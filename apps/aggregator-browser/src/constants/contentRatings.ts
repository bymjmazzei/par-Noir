/**
 * Content Rating Constants (Simplified)
 * Simple binary system: Public (default) or NSFW
 */

/**
 * Check if content is NSFW
 * Handles both boolean and string values (API might return string "true"/"false")
 */
export function isNSFWContent(metadata?: { isNSFW?: boolean | string } | null): boolean {
  if (!metadata) return false;
  const isNSFW = metadata.isNSFW;
  // Handle boolean true
  if (isNSFW === true) return true;
  // Handle string "true"
  if (isNSFW === 'true') return true;
  // Handle string "True" (case-insensitive)
  if (typeof isNSFW === 'string' && isNSFW.toLowerCase() === 'true') return true;
  return false;
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