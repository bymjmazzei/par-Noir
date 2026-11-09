/**
 * Verified display name. Identity verification stores only an HMAC of the legal name; a feed
 * owner can opt in to showing a display name on a feed when its HMAC matches. Not unique.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { getDatabasePool } from '../utils/database';

const DEV_HMAC_KEY = 'par-noir-dev-legal-name-hmac';
const DISPLAY_NAME_MAX = 120;

function hmacKey(): string {
  const key = process.env.LEGAL_NAME_HMAC_KEY?.trim();
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('legal_name_hmac_key_missing'), { code: 'NOT_CONFIGURED' });
  }
  return DEV_HMAC_KEY;
}

/** Case, accent-mark spacing and whitespace differences do not change the HMAC. */
export function normalizeLegalName(name: string): string {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function legalNameHmac(name: string): string {
  return createHmac('sha256', hmacKey()).update(normalizeLegalName(name)).digest('hex');
}

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

async function ownedFeedId(pn: string, feedId: string): Promise<string> {
  const r = await getDatabasePool().query(
    `SELECT feed_id FROM feeds
     WHERE feed_id = $1
       AND (owner_pn_identifier = $2 OR creator_did = $2
            OR EXISTS (SELECT 1 FROM feed_tokens ft WHERE ft.feed_id = feeds.feed_id AND ft.owner_pn_identifier = $2))
       AND (status IS NULL OR status = 'active')
     LIMIT 1`,
    [feedId, pn]
  );
  if (!r.rows[0]) fail('FEED_NOT_OWNED');
  return String(r.rows[0].feed_id);
}

export class VerifiedNameService {
  /** Show `displayName` on the feed when it matches the owner's verified legal name. */
  static async setFeedVerifiedName(pn: string, feedId: string, displayName: string): Promise<string> {
    const label = String(displayName || '').replace(/\s+/g, ' ').trim();
    if (!label || label.length > DISPLAY_NAME_MAX) fail('INVALID_NAME');
    const id = await ownedFeedId(pn, feedId);
    const v = await getDatabasePool().query(
      `SELECT legal_name_hmac FROM verified_identities WHERE identity_id = $1 AND is_active = TRUE LIMIT 1`,
      [pn]
    );
    const stored = v.rows[0]?.legal_name_hmac ? String(v.rows[0].legal_name_hmac) : '';
    if (!stored) fail('NOT_VERIFIED');
    if (!sameHex(stored, legalNameHmac(label))) fail('NAME_MISMATCH');
    await getDatabasePool().query(
      `UPDATE feeds SET verified_display_name = $2, updated_at = NOW() WHERE feed_id = $1`,
      [id, label]
    );
    return label;
  }

  static async clearFeedVerifiedName(pn: string, feedId: string): Promise<void> {
    const id = await ownedFeedId(pn, feedId);
    await getDatabasePool().query(
      `UPDATE feeds SET verified_display_name = NULL, updated_at = NOW() WHERE feed_id = $1`,
      [id]
    );
  }
}
