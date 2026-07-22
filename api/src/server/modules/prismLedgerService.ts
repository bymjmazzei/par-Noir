import crypto from 'crypto';
import type { PrismLedgerEntry } from './prismLedgerSheetsService';
import { PrismLedgerSheetsService } from './prismLedgerSheetsService';
import { isPortableSocialCloud } from './storage/storageProviderUtils';
import { portableTableAppend, portableTableScan } from './storage/portableTableService';
import { PRISM_LEDGER_SCHEMA } from './storage/tableSchemas';
import type { GoogleDriveToken } from './googleOAuth2Helper';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export async function recordPrismEntry(
  pnIdentifier: string,
  entry: Omit<PrismLedgerEntry, 'activity_id' | 'created_at'> & {
    activity_id?: string;
    created_at?: string;
  },
  driveCtx?: {
    token: GoogleDriveToken;
    metadataFolderId: string;
    accountId?: string;
  }
): Promise<string> {
  const normalized = normalizePn(pnIdentifier);
  const row: PrismLedgerEntry = {
    activity_id: entry.activity_id ?? crypto.randomUUID(),
    user_pn_identifier: entry.user_pn_identifier,
    activity_type: entry.activity_type,
    target_file_id: entry.target_file_id,
    target_owner_pn_identifier: entry.target_owner_pn_identifier,
    vote: entry.vote,
    metadata: entry.metadata,
    created_at: entry.created_at ?? new Date().toISOString()
  };

  if (await isPortableSocialCloud(normalized)) {
    await portableTableAppend(
      normalized,
      PRISM_LEDGER_SCHEMA,
      row as unknown as Record<string, unknown>,
      driveCtx?.accountId
    );
    return row.activity_id;
  }

  if (!driveCtx) {
    throw new Error('Google Drive context required for prism ledger');
  }
  const sheetId = await PrismLedgerSheetsService.getPrismLedgerSheet(
    driveCtx.token,
    driveCtx.metadataFolderId,
    normalized,
    driveCtx.accountId
  );
  await PrismLedgerSheetsService.appendEntry(
    driveCtx.token,
    sheetId,
    row,
    normalized,
    driveCtx.accountId
  );
  return row.activity_id;
}

export async function getUserPrismEntries(
  pnIdentifier: string,
  driveCtx?: {
    token: GoogleDriveToken;
    metadataFolderId: string;
    accountId?: string;
  }
): Promise<PrismLedgerEntry[]> {
  const normalized = normalizePn(pnIdentifier);
  if (await isPortableSocialCloud(normalized)) {
    return portableTableScan<PrismLedgerEntry>(normalized, PRISM_LEDGER_SCHEMA, driveCtx?.accountId);
  }
  if (!driveCtx) return [];
  const sheetId = await PrismLedgerSheetsService.getPrismLedgerSheet(
    driveCtx.token,
    driveCtx.metadataFolderId,
    normalized,
    driveCtx.accountId
  );
  const result = await PrismLedgerSheetsService.getActivities(
    driveCtx.token,
    sheetId,
    normalized,
    driveCtx.accountId
  );
  return result.entries ?? [];
}
