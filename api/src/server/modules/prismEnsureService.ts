/**
 * One-off Prism infrastructure ensure service
 * Creates prism_ledger.xlsx for existing pNs that don't have it.
 * Designed to run once (admin-triggered); does NOT create on every request.
 */

import { getDatabasePool } from '../utils/database';
import { googleDriveProxyService } from './googleDriveProxy';
import { PrismLedgerSheetsService } from './prismLedgerSheetsService';

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

/**
 * Get metadata folder ID for a user. Returns null if folder structure not found.
 */
async function getMetadataFolderId(identityId: string): Promise<string | null> {
  const accessToken = await googleDriveProxyService.getAccessToken(identityId);
  const pnFolderName = `par Noir - ${identityId}`;
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
 */
export async function ensurePrismLedgerForIdentity(identityId: string): Promise<EnsureResult> {
  try {
    const accessToken = await googleDriveProxyService.getAccessToken(identityId);
    const metadataFolderId = await getMetadataFolderId(identityId);
    if (!metadataFolderId) {
      return { identityId, created: false, skipped: false, error: 'Metadata folder not found' };
    }

    const token = { access_token: accessToken };

    try {
      await PrismLedgerSheetsService.getPrismLedgerSheet(token, metadataFolderId, identityId, undefined);
      return { identityId, created: false, skipped: true };
    } catch (getErr: any) {
      const msg = getErr?.message || String(getErr);
      if (!msg.includes('not found') && !msg.includes('Sheet not found')) {
        return { identityId, created: false, skipped: false, error: msg };
      }
      await PrismLedgerSheetsService.createPrismLedgerSheet(token, metadataFolderId, identityId, undefined);
      return { identityId, created: true, skipped: false };
    }
  } catch (err: any) {
    return { identityId, created: false, skipped: false, error: err?.message || String(err) };
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
