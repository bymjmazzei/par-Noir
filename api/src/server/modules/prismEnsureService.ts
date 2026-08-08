/**
 * One-off Prism infrastructure ensure service
 * Creates prism_ledger.xlsx for existing pNs that don't have it.
 * Designed to run once (admin-triggered); does NOT create on every request.
 */

import { getDatabasePool } from '../utils/database';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { PrismLedgerSheetsService } from './prismLedgerSheetsService';
import { isPortableSocialCloud } from './storage/storageProviderUtils';
import { resolveSocialCloudContext, openTable } from './storage/storageFacade';
import { PRISM_LEDGER_SCHEMA } from './storage/tableSchemas';

/** Result for a single identity */
export interface EnsureResult {
  identityId: string;
  created: boolean;
  skipped: boolean;
  error?: string;
}

/** Aggregate result for the one-off run */
export interface EnsureAllResult {
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
  details: EnsureResult[];
}

function normalizePnId(id: string): string {
  return id.startsWith('pn-') ? id : `pn-${id}`;
}

/**
 * Get metadata folder ID for a user. Returns null if folder structure not found.
 * @param pnId - Normalized pn-{hash} identifier (folder is "par Noir - pn-{hash}")
 */
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
 * Ensure prism_ledger exists for one identity.
 * ONLY creates when getPrismLedgerSheet throws "Sheet not found" / "not found".
 * @param rawIdentityId - identity_id from storage_credentials (may be pn-{hash} or raw hash)
 */
export async function ensurePrismLedgerForIdentity(
  rawIdentityId: string,
  cloudAccessToken?: string
): Promise<EnsureResult> {
  const pnId = normalizePnId(rawIdentityId);

  try {
    if (await isPortableSocialCloud(pnId)) {
      const ctx = await resolveSocialCloudContext(pnId, undefined, cloudAccessToken);
      const table = await openTable(ctx, PRISM_LEDGER_SCHEMA);
      // Ensure today's segment / empty table exists by no-op replace if scan empty
      const rows = await table.scan({ limit: 1 });
      if (rows.length === 0) {
        await table.replaceAll([]);
      }
      return { identityId: rawIdentityId, created: true, skipped: false };
    }

    // Drive-backed identities need the owner's device-held token. Report that
    // plainly instead of failing as if the ledger itself were missing.
    const accessToken = cloudAccessToken?.trim();
    if (!accessToken) {
      safeLogger.warn('[PrismEnsure] Skipped — no Drive token for identity', {
        reason: 'cloud_token_required',
        pnIdHash: hashIdentifier(pnId)
      });
      return {
        identityId: rawIdentityId,
        created: false,
        skipped: true,
        error: 'cloud_token_required'
      };
    }
    const metadataFolderId = await getMetadataFolderId(pnId, accessToken);
    if (!metadataFolderId) {
      return { identityId: rawIdentityId, created: false, skipped: false, error: 'Metadata folder not found' };
    }

    const token = { access_token: accessToken };

    try {
      await PrismLedgerSheetsService.getPrismLedgerSheet(token, metadataFolderId, pnId, undefined);
      return { identityId: rawIdentityId, created: false, skipped: true };
    } catch (getErr: any) {
      const msg = getErr?.message || String(getErr);
      if (!msg.includes('not found') && !msg.includes('Sheet not found')) {
        return { identityId: rawIdentityId, created: false, skipped: false, error: msg };
      }
      await PrismLedgerSheetsService.createPrismLedgerSheet(token, metadataFolderId, pnId, undefined);
      return { identityId: rawIdentityId, created: true, skipped: false };
    }
  } catch (err: any) {
    return { identityId: rawIdentityId, created: false, skipped: false, error: err?.message || String(err) };
  }
}

/**
 * One-off: ensure prism_ledger for all identities in storage_credentials.
 * Call via admin endpoint only.
 */
export async function ensurePrismLedgersForAllIdentities(): Promise<EnsureAllResult> {
  const db = getDatabasePool();
  const result = await db.query(`SELECT identity_id FROM storage_credentials`);
  const identityIds = (result.rows as { identity_id: string }[]).map((r) => r.identity_id);

  const details: EnsureResult[] = [];
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of identityIds) {
    const r = await ensurePrismLedgerForIdentity(id);
    details.push(r);
    if (r.created) created++;
    else if (r.skipped) skipped++;
    if (r.error) errors.push(`${id}: ${r.error}`);
  }

  return {
    processed: identityIds.length,
    created,
    skipped,
    errors,
    details,
  };
}
