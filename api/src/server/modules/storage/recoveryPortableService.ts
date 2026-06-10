import { normalizeCustodianStatus } from '@par-noir/recovery-crypto';
import type {
  PendingShareRow,
  RecoveryCustodianRow,
  RecoveryRequestRow
} from '../recoverySheetsService';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableGetByKey,
  portableTableScan
} from './portableTableService';
import {
  RECOVERY_CUSTODIANS_SCHEMA,
  RECOVERY_PENDING_SCHEMA,
  RECOVERY_REQUESTS_SCHEMA
} from './tableSchemas';

export const PORTABLE_RECOVERY_SPREADSHEET = 'pn-portable-recovery';

export async function getOrCreateSpreadsheetPortable(): Promise<string> {
  return PORTABLE_RECOVERY_SPREADSHEET;
}

export async function listPendingSharesPortable(
  pnIdentifier: string,
  accountId: string | undefined,
  includeEncrypted = false
): Promise<Array<{ shareIndex: number; createdAt: string; encryptedShare?: string }>> {
  const rows = await portableTableScan<PendingShareRow & { shareIndex: string }>(
    pnIdentifier,
    RECOVERY_PENDING_SCHEMA,
    accountId
  );
  return rows
    .map((r) => {
      const shareIndex = parseInt(String(r.shareIndex), 10) || 0;
      const base = { shareIndex, createdAt: r.createdAt || '' };
      if (includeEncrypted) {
        return { ...base, encryptedShare: r.encryptedShare || '' };
      }
      return base;
    })
    .filter((p) => p.shareIndex > 0);
}

export async function initializePendingSharesPortable(
  pnIdentifier: string,
  shares: Array<{ shareIndex: number; encryptedShare: string }>,
  accountId: string | undefined
): Promise<{ inserted: number; skipped: number }> {
  const existingPending = await listPendingSharesPortable(pnIdentifier, accountId, true);
  const custodians = await listCustodiansPortable(pnIdentifier, accountId);
  const assignedIndices = new Set(
    custodians
      .filter((c) => normalizeCustodianStatus(c.status) !== 'revoked')
      .map((c) => c.shareIndex)
  );
  const pendingIndices = new Set(existingPending.map((p) => p.shareIndex));

  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const share of shares) {
    if (!share.shareIndex || !share.encryptedShare) {
      skipped += 1;
      continue;
    }
    if (assignedIndices.has(share.shareIndex) || pendingIndices.has(share.shareIndex)) {
      skipped += 1;
      continue;
    }
    await portableTableAppend(
      pnIdentifier,
      RECOVERY_PENDING_SCHEMA,
      {
        shareIndex: String(share.shareIndex),
        encryptedShare: share.encryptedShare,
        createdAt: now
      },
      accountId
    );
    pendingIndices.add(share.shareIndex);
    inserted += 1;
  }

  return { inserted, skipped };
}

export async function removePendingSharePortable(
  pnIdentifier: string,
  shareIndex: number,
  accountId: string | undefined
): Promise<boolean> {
  const existing = await portableTableGetByKey(
    pnIdentifier,
    RECOVERY_PENDING_SCHEMA,
    String(shareIndex),
    accountId
  );
  if (!existing) return false;
  await portableTableDelete(pnIdentifier, RECOVERY_PENDING_SCHEMA, String(shareIndex), accountId);
  return true;
}

export async function appendPendingSharePortable(
  pnIdentifier: string,
  share: { shareIndex: number; encryptedShare: string },
  accountId: string | undefined
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    RECOVERY_PENDING_SCHEMA,
    {
      shareIndex: String(share.shareIndex),
      encryptedShare: share.encryptedShare,
      createdAt: new Date().toISOString()
    },
    accountId
  );
}

export async function listCustodiansPortable(
  pnIdentifier: string,
  accountId: string | undefined
): Promise<RecoveryCustodianRow[]> {
  const rows = await portableTableScan<RecoveryCustodianRow>(pnIdentifier, RECOVERY_CUSTODIANS_SCHEMA, accountId);
  return rows.filter((c) => c.custodianId).map(normalizeCustodianRow);
}

export async function upsertCustodianPortable(
  pnIdentifier: string,
  row: RecoveryCustodianRow,
  accountId: string | undefined
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    RECOVERY_CUSTODIANS_SCHEMA,
    {
      ...row,
      unrevokable: row.unrevokable ? 'true' : 'false',
      shareIndex: String(row.shareIndex)
    } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function getCustodianByIdPortable(
  pnIdentifier: string,
  custodianId: string,
  accountId: string | undefined
): Promise<RecoveryCustodianRow | null> {
  const row = await portableTableGetByKey<RecoveryCustodianRow>(
    pnIdentifier,
    RECOVERY_CUSTODIANS_SCHEMA,
    custodianId,
    accountId
  );
  if (!row?.custodianId) return null;
  return normalizeCustodianRow(row);
}

function normalizeCustodianRow(row: RecoveryCustodianRow): RecoveryCustodianRow {
  return {
    ...row,
    shareIndex: typeof row.shareIndex === 'string' ? parseInt(row.shareIndex, 10) || 0 : row.shareIndex,
    unrevokable: row.unrevokable === true || String(row.unrevokable) === 'true'
  };
}

export async function assignShareToCustodianPortable(
  pnIdentifier: string,
  row: RecoveryCustodianRow,
  accountId: string | undefined
): Promise<void> {
  const pending = await listPendingSharesPortable(pnIdentifier, accountId, true);
  const pendingRow = pending.find((p) => p.shareIndex === row.shareIndex);
  if (!pendingRow?.encryptedShare) {
    throw new Error('pending_share_not_found');
  }
  const assignRow: RecoveryCustodianRow = {
    ...row,
    encryptedShare: row.encryptedShare || pendingRow.encryptedShare,
    status: 'invited'
  };
  await upsertCustodianPortable(pnIdentifier, assignRow, accountId);
  await removePendingSharePortable(pnIdentifier, row.shareIndex, accountId);
}

export async function revokeCustodianPortable(
  pnIdentifier: string,
  custodianId: string,
  accountId: string | undefined,
  threshold?: number
): Promise<RecoveryCustodianRow> {
  const custodians = await listCustodiansPortable(pnIdentifier, accountId);
  const row = custodians.find((c) => c.custodianId === custodianId);
  if (!row) throw new Error('custodian_not_found');
  if (row.unrevokable) throw new Error('custodian_unrevokable');
  if (normalizeCustodianStatus(row.status) === 'revoked') throw new Error('custodian_already_revoked');

  if (threshold != null && threshold > 0 && normalizeCustodianStatus(row.status) === 'accepted') {
    const acceptedCount = custodians.filter(
      (c) => normalizeCustodianStatus(c.status) === 'accepted'
    ).length;
    if (acceptedCount - 1 < threshold) {
      throw new Error('revoke_would_break_threshold');
    }
  }

  const revoked: RecoveryCustodianRow = { ...row, status: 'revoked' };
  await upsertCustodianPortable(pnIdentifier, revoked, accountId);
  if (row.encryptedShare && row.shareIndex > 0) {
    await appendPendingSharePortable(
      pnIdentifier,
      { shareIndex: row.shareIndex, encryptedShare: row.encryptedShare },
      accountId
    );
  }
  return revoked;
}

export async function acceptCustodianPortable(
  pnIdentifier: string,
  custodianId: string,
  custodianPublicKey: string | undefined,
  custodianPnIdentifier: string | undefined,
  accountId: string | undefined
): Promise<RecoveryCustodianRow> {
  const custodians = await listCustodiansPortable(pnIdentifier, accountId);
  const row = custodians.find((c) => c.custodianId === custodianId);
  if (!row) throw new Error('custodian_not_found');
  if (normalizeCustodianStatus(row.status) === 'revoked') throw new Error('custodian_revoked');

  const accepted: RecoveryCustodianRow = {
    ...row,
    status: 'accepted',
    custodianPublicKey: custodianPublicKey || row.custodianPublicKey,
    custodianPnIdentifier: custodianPnIdentifier || row.custodianPnIdentifier
  };
  await upsertCustodianPortable(pnIdentifier, accepted, accountId);
  return accepted;
}

export async function upsertRecoveryRequestPortable(
  pnIdentifier: string,
  row: RecoveryRequestRow,
  accountId: string | undefined
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    RECOVERY_REQUESTS_SCHEMA,
    {
      ...row,
      threshold: String(row.threshold)
    } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function listRecoveryRequestsPortable(
  pnIdentifier: string,
  accountId: string | undefined
): Promise<RecoveryRequestRow[]> {
  const rows = await portableTableScan<RecoveryRequestRow & { threshold: string }>(
    pnIdentifier,
    RECOVERY_REQUESTS_SCHEMA,
    accountId
  );
  return rows.map((r) => ({
    requestId: r.requestId || '',
    publicKey: r.publicKey || '',
    status: (r.status || 'pending') as RecoveryRequestRow['status'],
    threshold: parseInt(String(r.threshold), 10) || 2,
    sharesJson: r.sharesJson || '[]',
    claimantName: r.claimantName || '',
    createdAt: r.createdAt || ''
  }));
}

export async function normalizeLegacyCustodianRowsPortable(
  pnIdentifier: string,
  accountId: string | undefined
): Promise<{ normalized: number }> {
  const custodians = await listCustodiansPortable(pnIdentifier, accountId);
  let normalized = 0;
  for (const row of custodians) {
    const raw = (row.status || '').toLowerCase();
    if (raw !== 'active' && raw !== 'pending') continue;
    const updated: RecoveryCustodianRow = { ...row, status: 'invited' };
    await upsertCustodianPortable(pnIdentifier, updated, accountId);
    normalized += 1;
  }
  return { normalized };
}
