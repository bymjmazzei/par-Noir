/**
 * Verification gate for public template share + monetized licensing.
 * Client allowlist (VITE) + API PEN_VERIFIED_AUTHOR_PN_IDS on unlock.
 */

import type { PenSession } from './penSession';
import { isClientVerifiedAuthor } from './penAuthorVerification';

/**
 * Sync check: build-time allowlist only. Prefer useVerifiedAuthor hook in UI.
 */
export function isVerifiedAuthor(session: PenSession | null | undefined): boolean {
  return isClientVerifiedAuthor(session?.pnIdentifier);
}

/** Alias for PublishMenu: public template share only. */
export function canPublishPublicTemplate(
  session: PenSession | null | undefined
): boolean {
  return isVerifiedAuthor(session);
}
