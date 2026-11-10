/**
 * Storage Tier Service
 * Encryption limits from the creator tier of feeds the user owns.
 * free: 100MB, feed: 500MB, self-hosted: 2GB
 */

import { getDatabasePool } from '../utils/database';

const TIER_LIMITS: Record<string, number> = {
  free: 100 * 1024 * 1024,       // 100 MB
  feed: 500 * 1024 * 1024,       // 500 MB
  'self-hosted': 2 * 1024 * 1024 * 1024,  // 2 GB
};

export interface StorageTierResult {
  tier: string;
  encryptedLimitBytes: number;
}

/** Highest creator_tier among owned feeds; creator_did can be the pN or the DID. */
export async function getStorageTier(pnIdentifier: string, did?: string): Promise<StorageTierResult> {
  const identifiers = [pnIdentifier];
  if (did && did !== pnIdentifier) identifiers.push(did);

  const db = getDatabasePool();
  const result = await db.query(
    `SELECT creator_tier FROM feeds
     WHERE creator_did = ANY($1::text[])
     ORDER BY CASE creator_tier
       WHEN 'self-hosted' THEN 1
       WHEN 'feed' THEN 2
       ELSE 3
     END
     LIMIT 1`,
    [identifiers]
  );

  const tier = (result.rows[0] as { creator_tier?: string })?.creator_tier || 'free';
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

  return { tier, encryptedLimitBytes: limit };
}
