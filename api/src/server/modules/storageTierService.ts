/**
 * Storage Tier Service
 * Derives encryption limits from profile.json (user's Drive) or feed creator tiers.
 * free: 100MB, feed: 500MB, self-hosted: 2GB
 */

import { getDatabasePool } from '../utils/database';
import { ProfileService } from './profileService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

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

async function getMetadataFolderId(pnId: string, accessToken: string): Promise<string | null> {
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
  did?: string,
  cloudAccessToken?: string
): Promise<StorageTierResult> {
  const identifiers = [pnIdentifier];
  if (did && did !== pnIdentifier) identifiers.push(did);
  const pnId = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

  // The authoritative tier lives in the user's profile.json on their Drive, which
  // needs their device-held token. Without one we fall back to deriving it from
  // owned feeds — say so, because a silently derived tier can be the wrong tier.
  const driveToken = cloudAccessToken?.trim();
  if (driveToken) {
    try {
      const metadataFolderId = await getMetadataFolderId(pnId, driveToken);
      if (metadataFolderId) {
        const profile = await ProfileService.getProfileFile(driveToken, metadataFolderId);
        if (profile?.storageTier && VALID_TIERS.has(profile.storageTier)) {
          const limit = TIER_LIMITS[profile.storageTier] ?? TIER_LIMITS.free;
          return { tier: profile.storageTier, encryptedLimitBytes: limit };
        }
      }
    } catch (err) {
      safeLogger.warn('[StorageTier] Drive profile unreadable — deriving tier from feeds', {
        reason: 'drive_profile_unreadable',
        message: err instanceof Error ? err.message : String(err),
        pnIdHash: hashIdentifier(pnId)
      });
    }
  } else {
    safeLogger.warn('[StorageTier] No Drive token — deriving tier from feeds', {
      reason: 'cloud_token_required',
      pnIdHash: hashIdentifier(pnId)
    });
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
