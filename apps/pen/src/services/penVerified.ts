/** Verification gate for public template / aggregator share. Fail closed until Veriff. */

import type { PenSession } from './penSession';

/**
 * Verified author may share to public aggregators (browse, pen-templates)
 * and expose API-key private templates.
 * Until Veriff rails exist, always returns false.
 */
export function isVerifiedAuthor(_session: PenSession | null | undefined): boolean {
  return false;
}
