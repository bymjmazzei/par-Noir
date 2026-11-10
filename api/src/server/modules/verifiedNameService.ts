/**
 * Verified display name. The owner presents its verification credential (user-held, API-signed)
 * and the feed shows `displayName` only when it matches the name in that credential. The server
 * stores the chosen label on the feed and nothing about the legal name itself. Not unique.
 */

import { getDatabasePool } from '../utils/database';
import { VerificationCredentialService } from './verificationCredentialService';
import { VerificationIntegrationService } from './verificationIntegrationService';

const DISPLAY_NAME_MAX = 120;

/** Case, accent-mark spacing and whitespace differences do not change the comparison. */
export function normalizeLegalName(name: string): string {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
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
  /** Show `displayName` on the feed when it matches the legal name in the owner's credential. */
  static async setFeedVerifiedName(
    pn: string,
    feedId: string,
    displayName: string,
    credential: unknown
  ): Promise<string> {
    const label = String(displayName || '').replace(/\s+/g, ' ').trim();
    if (!label || label.length > DISPLAY_NAME_MAX) fail('INVALID_NAME');
    const id = await ownedFeedId(pn, feedId);
    const c = VerificationCredentialService.verify(credential);
    if (!c || c.sub !== pn.trim() || !(await VerificationIntegrationService.isVerified(pn.trim()))) {
      fail('NOT_VERIFIED');
    }
    const legal = normalizeLegalName([c.given_name, c.family_name].filter(Boolean).join(' '));
    if (!legal || legal !== normalizeLegalName(label)) fail('NAME_MISMATCH');
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
