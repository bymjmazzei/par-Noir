/** Verification gate for public template share + monetized licensing. Fail closed until Veriff. */

import type { PenSession } from './penSession';

/**
 * Verified author may publish public templates (`pen-templates`) and set
 * Social / Conditional licensing. Browse / networks stay open to all unlocked users.
 * Until Veriff rails exist, always returns false.
 */
export function isVerifiedAuthor(_session: PenSession | null | undefined): boolean {
  return false;
}

/** Alias for PublishMenu: public template share only. */
export function canPublishPublicTemplate(
  session: PenSession | null | undefined
): boolean {
  return isVerifiedAuthor(session);
}
