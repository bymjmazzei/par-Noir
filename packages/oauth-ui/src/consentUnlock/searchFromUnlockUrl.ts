/**
 * Parse unlock broker URLs (https or custom scheme) into ConsentUnlock search string.
 */

import { UNLOCK_CUSTOM_SCHEME } from './constants';

/**
 * Convert unlock.parnoir.com or custom-scheme URL into location.search for ConsentUnlockApp.
 */
export function searchFromUnlockUrl(url: string): string | null {
  try {
    const schemePrefix = `${UNLOCK_CUSTOM_SCHEME}:`;
    if (url.startsWith(schemePrefix)) {
      const normalized = url.replace(
        new RegExp(`^${UNLOCK_CUSTOM_SCHEME.replace(/\./g, '\\.')}:\\/\\/`),
        'https://unlock.parnoir.com/'
      );
      const u = new URL(normalized);
      return u.search || '';
    }
    const u = new URL(url);
    if (
      u.hostname === 'unlock.parnoir.com' ||
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.pathname.includes('oauth')
    ) {
      return u.search || '';
    }
  } catch {
    return null;
  }
  return null;
}
