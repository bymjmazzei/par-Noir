/**
 * Storage Tier Service
 * Derives encryption limits from profile.json (user's Drive) or feed creator tiers.
 * free: 100MB, feed: 500MB, self-hosted: 2GB
 */

import { getDatabasePool } from '../utils/database';
import { ProfileService } from './profileService';
import { googleDriveProxyService } from './googleDriveProxy';

const TIER_LIMITS: Record<string, number> = {
  free: 100 * 1024 * 1024,       // 100 MB
  feed: 500 * 1024 * 1024,       // 500 MB
  'self-hosted': 2 * 1024 * 1024 * 1024,  // 2 GB
};

const VALID_TIERS = new Set(['free', 'feed', 'self-hosted']);

export interface StorageTierResult {
  tier: string;
  encryptedLimitBytes: number;
}

async function getMetadataFolderId(pnId: string, additionalCandidates?: string[]): Promise<string | null> {
  const accessToken = await googleDriveProxyService.getAccessToken(
    pnId,
    undefined,
    additionalCandidates
  );
  const pnFolderName = `par Noir - ${pnId}`;
  const pnFolderQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const pnRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderQuery)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!pnRes.ok) return null;
  const pnData = (await pnRes.json()) as { files?: Array<{ id: string }> };
  if (!pnData.files || pnData.files.length === 0) return null;
  const pnFolderId = pnData.files[0].id;
  const metaQuery = `name='_metadata' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metaQuery)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) return null;
  const metaData = (await metaRes.json()) as { files?: Array<{ id: string }> };
  if (!metaData.files || metaData.files.length === 0) return null;
  return metaData.files[0].id;
}

/**
 * Get storage tier and encrypted limit for a user.
 * 1. Tries profile.json in user's Drive (storageTier) when present.
 * 2. Else derives from highest creator_tier of feeds they own.
 * Tries both pnIdentifier and did (creator_did can be either).
 */
export async function getStorageTier(
  pnIdentifier: string,
  did?: string
): Promise<StorageTierResult> {
  const identifiers = [pnIdentifier];
  if (did && did !== pnIdentifier) identifiers.push(did);
  const additionalCandidates = did && did !== pnIdentifier ? [did] : undefined;
  const pnId = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

  try {
    const metadataFolderId = await getMetadataFolderId(pnId, additionalCandidates);
    if (metadataFolderId) {
      const accessToken = await googleDriveProxyService.getAccessToken(pnId, undefined, additionalCandidates);
      const profile = await ProfileService.getProfileFile(accessToken, metadataFolderId);
      if (profile?.storageTier && VALID_TIERS.has(profile.storageTier)) {
        const limit = TIER_LIMITS[profile.storageTier] ?? TIER_LIMITS.free;
        return { tier: profile.storageTier, encryptedLimitBytes: limit };
      }
    }
  } catch (_err) {
    // Fall through to feed-based derivation
  }

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
