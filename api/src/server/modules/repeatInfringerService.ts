/**
 * Repeat Infringer Policy (timeout only; no permanent removal)
 * Accounts with multiple upheld takedowns/denials are temporarily restricted from making new content public.
 * Timeout lengths: 1st = 7 days, 2nd = 15 days, 3rd+ = 30 days. Ability is automatically restored after the period.
 */

import { getDatabasePool } from '../utils/database';

const ROLLING_WINDOW_DAYS = parseInt(process.env.DMCA_REPEAT_INFRINGER_WINDOW_DAYS || '90', 10);
const LIMIT = parseInt(process.env.DMCA_REPEAT_INFRINGER_THRESHOLD || '3', 10);
const TIMEOUT_DAYS_BY_OFFENSE: [number, number, number] = [
  parseInt(process.env.DMCA_TIMEOUT_DAYS_1ST || '7', 10),
  parseInt(process.env.DMCA_TIMEOUT_DAYS_2ND || '15', 10),
  parseInt(process.env.DMCA_TIMEOUT_DAYS_3RD || '30', 10),
];

/**
 * Get count of denied (upheld) items for an owner in the rolling window (Prism denials).
 * Uses updated_at as proxy for when the item was resolved to denied.
 */
export async function getDeniedCountInRollingWindow(
  ownerPnIdentifier: string,
  windowDays: number = ROLLING_WINDOW_DAYS
): Promise<number> {
  const db = getDatabasePool();
  const r = await db.query(
    `SELECT COUNT(*)::int as count FROM prism_review_queue
     WHERE owner_pn_identifier = $1 AND status = 'denied'
     AND updated_at >= NOW() - ($2 * INTERVAL '1 day')`,
    [ownerPnIdentifier, windowDays]
  );
  return parseInt(String((r.rows[0] as { count?: number })?.count ?? 0), 10);
}

/** Legacy: total denied count for owner (all time). */
export async function getDeniedCountForOwner(ownerPnIdentifier: string): Promise<number> {
  const db = getDatabasePool();
  const r = await db.query(
    `SELECT COUNT(*)::int as count FROM prism_review_queue WHERE owner_pn_identifier = $1 AND status = 'denied'`,
    [ownerPnIdentifier]
  );
  return parseInt(String((r.rows[0] as { count?: number })?.count ?? 0), 10);
}

export interface TimeoutRow {
  timeout_until: Date;
  offense_number: number;
}

/**
 * Get current timeout for owner if they are currently restricted (timeout_until > NOW()).
 * If timeout has expired, returns the row so we know the last offense number for escalation.
 */
export async function getTimeoutForOwner(ownerPnIdentifier: string): Promise<TimeoutRow | null> {
  const db = getDatabasePool();
  const r = await db.query(
    `SELECT timeout_until, offense_number FROM repeat_infringer_timeouts WHERE owner_pn_identifier = $1`,
    [ownerPnIdentifier]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as { timeout_until: string; offense_number: number };
  return {
    timeout_until: new Date(row.timeout_until),
    offense_number: row.offense_number,
  };
}

/**
 * Apply the next timeout for this owner (they just hit the limit).
 * Offense 1 -> 7 days, 2 -> 15 days, 3+ -> 30 days.
 */
export async function applyTimeout(ownerPnIdentifier: string): Promise<void> {
  const db = getDatabasePool();
  const existing = await getTimeoutForOwner(ownerPnIdentifier);
  const now = new Date();
  // Next offense: if no row or current timeout expired, next is 1; else last offense + 1, cap at 3
  let nextOffense = 1;
  if (existing) {
    if (existing.timeout_until > now) {
      // Already in timeout; should not have been asked to apply (caller logic). Still cap.
      nextOffense = Math.min(existing.offense_number, 3);
    } else {
      nextOffense = Math.min(existing.offense_number + 1, 3);
    }
  }
  const days = TIMEOUT_DAYS_BY_OFFENSE[nextOffense - 1] ?? TIMEOUT_DAYS_BY_OFFENSE[2];
  const timeoutUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO repeat_infringer_timeouts (owner_pn_identifier, timeout_until, offense_number, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (owner_pn_identifier) DO UPDATE SET
       timeout_until = EXCLUDED.timeout_until,
       offense_number = EXCLUDED.offense_number,
       updated_at = NOW()`,
    [ownerPnIdentifier, timeoutUntil.toISOString(), nextOffense]
  );
}

/**
 * True if owner is currently restricted from making new content public.
 * Either they are in an active timeout, or they just hit the limit and we apply a timeout (then restricted).
 */
export async function isRepeatInfringer(ownerPnIdentifier: string): Promise<boolean> {
  const timeout = await getTimeoutForOwner(ownerPnIdentifier);
  const now = new Date();
  if (timeout && timeout.timeout_until > now) {
    return true;
  }
  const count = await getDeniedCountInRollingWindow(ownerPnIdentifier);
  if (count >= LIMIT) {
    await applyTimeout(ownerPnIdentifier);
    return true;
  }
  return false;
}
