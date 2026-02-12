/**
 * Repeat Infringer Policy
 * Accounts with multiple upheld takedowns/denials may be restricted from making content public.
 */

import { getDatabasePool } from '../utils/database';

const THRESHOLD = parseInt(process.env.DMCA_REPEAT_INFRINGER_THRESHOLD || '3', 10);

/**
 * Get count of denied (upheld) items for an owner (Prism denials).
 */
export async function getDeniedCountForOwner(ownerPnIdentifier: string): Promise<number> {
  const db = getDatabasePool();
  const r = await db.query(
    `SELECT COUNT(*)::int as count FROM prism_review_queue WHERE owner_pn_identifier = $1 AND status = 'denied'`,
    [ownerPnIdentifier]
  );
  return parseInt(String((r.rows[0] as { count?: number })?.count ?? 0), 10);
}

/**
 * True if owner has reached the repeat infringer threshold (cannot make new content public).
 */
export async function isRepeatInfringer(ownerPnIdentifier: string): Promise<boolean> {
  const count = await getDeniedCountForOwner(ownerPnIdentifier);
  return count >= THRESHOLD;
}
