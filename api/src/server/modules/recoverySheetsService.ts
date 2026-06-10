/**
 * Recovery custodian roster + pending shares + recovery requests on Google Drive (_metadata/recovery.xlsx).
 */

import { google } from 'googleapis';
import { normalizeCustodianStatus, parseUnrevokableFlag } from '@par-noir/recovery-crypto';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import * as RecoveryPortable from './storage/recoveryPortableService';

export interface RecoveryCustodianRow {
  custodianId: string;
  name: string;
  custodianType: string;
  encryptedShare: string;
  shareIndex: number;
  custodianshipCredential: string;
  status: string;
  createdAt: string;
  unrevokable: boolean;
  custodianPublicKey?: string;
  custodianPnIdentifier?: string;
}

export interface PendingShareRow {
  shareIndex: number;
  encryptedShare: string;
  createdAt: string;
}

export interface RecoveryRequestRow {
  requestId: string;
  publicKey: string;
  status: 'pending' | 'ready' | 'completed' | 'denied';
  threshold: number;
  sharesJson: string;
  claimantName: string;
  createdAt: string;
}

const CUSTODIAN_HEADERS = [
  'custodianId',
  'name',
  'custodianType',
  'encryptedShare',
  'shareIndex',
  'custodianshipCredential',
  'status',
  'createdAt',
  'unrevokable',
  'custodianPublicKey',
  'custodianPnIdentifier',
];

const PENDING_HEADERS = ['shareIndex', 'encryptedShare', 'createdAt'];

export class RecoverySheetsService {
  private static readonly FILE_NAME = 'recovery.xlsx';

  static async getOrCreateSpreadsheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.getOrCreateSpreadsheetPortable();
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const q = `name='${this.FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const existing = await drive.files.list({ q, fields: 'files(id)' });
    if (existing.data.files?.[0]?.id) {
      const spreadsheetId = existing.data.files[0].id;
      await this.ensureSheetTabs(auth, spreadsheetId);
      return spreadsheetId;
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.FILE_NAME },
        sheets: [
          { properties: { title: 'Custodians', gridProperties: { rowCount: 500, columnCount: 12 } } },
          { properties: { title: 'PendingShares', gridProperties: { rowCount: 50, columnCount: 4 } } },
          { properties: { title: 'RecoveryRequests', gridProperties: { rowCount: 500, columnCount: 7 } } },
        ],
      },
    });
    const spreadsheetId = created.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create recovery spreadsheet');
    }

    await drive.files.update({
      fileId: spreadsheetId,
      addParents: metadataFolderId,
      fields: 'id',
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Custodians!A1:K1', values: [CUSTODIAN_HEADERS] },
          { range: 'PendingShares!A1:C1', values: [PENDING_HEADERS] },
          {
            range: 'RecoveryRequests!A1:G1',
            values: [['requestId', 'publicKey', 'status', 'threshold', 'sharesJson', 'claimantName', 'createdAt']],
          },
        ],
      },
    });

    return spreadsheetId;
  }

  private static async ensureSheetTabs(
    auth: ReturnType<typeof GoogleOAuth2Helper.createClient>,
    spreadsheetId: string
  ): Promise<void> {
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
    const titles = new Set((meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean));
    const requests: object[] = [];
    if (!titles.has('PendingShares')) {
      requests.push({
        addSheet: {
          properties: { title: 'PendingShares', gridProperties: { rowCount: 50, columnCount: 4 } },
        },
      });
    }
    if (requests.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'PendingShares!A1:C1',
        valueInputOption: 'RAW',
        requestBody: { values: [PENDING_HEADERS] },
      });
    }
    const custodianHeader = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Custodians!A1:K1',
    });
    if (!custodianHeader.data.values?.[0]?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Custodians!A1:K1',
        valueInputOption: 'RAW',
        requestBody: { values: [CUSTODIAN_HEADERS] },
      });
    }
  }

  private static parseCustodianRow(r: string[]): RecoveryCustodianRow {
    const newFormat = r.length >= 6 && typeof r[5] === 'string' && r[5].length > 20;
    if (newFormat) {
      return {
        custodianId: r[0] || '',
        name: r[1] || '',
        custodianType: r[2] || '',
        encryptedShare: r[3] || '',
        shareIndex: parseInt(r[4] || '0', 10) || 0,
        custodianshipCredential: r[5] || '',
        status: normalizeCustodianStatus(r[6] || 'invited'),
        createdAt: r[7] || '',
        unrevokable: parseUnrevokableFlag(r[8]),
        custodianPublicKey: r[9] || undefined,
        custodianPnIdentifier: r[10] || undefined,
      };
    }
    return {
      custodianId: r[0] || '',
      name: r[1] || '',
      custodianType: r[2] || '',
      encryptedShare: r[3] || '',
      shareIndex: 0,
      custodianshipCredential: '',
      status: normalizeCustodianStatus(r[4] || 'invited'),
      createdAt: r[5] || '',
      unrevokable: false,
    };
  }

  private static custodianToValues(row: RecoveryCustodianRow): string[] {
    return [
      row.custodianId,
      row.name,
      row.custodianType,
      row.encryptedShare,
      String(row.shareIndex),
      row.custodianshipCredential,
      row.status,
      row.createdAt,
      row.unrevokable ? 'true' : 'false',
      row.custodianPublicKey || '',
      row.custodianPnIdentifier || '',
    ];
  }

  static async listPendingShares(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    includeEncrypted = false
  ): Promise<Array<{ shareIndex: number; createdAt: string; encryptedShare?: string }>> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.listPendingSharesPortable(userPnIdentifier, accountId, includeEncrypted);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'PendingShares!A2:C',
      });
      return (res.data.values || []).map((r) => {
        const base = {
          shareIndex: parseInt(r[0] || '0', 10) || 0,
          createdAt: r[2] || '',
        };
        if (includeEncrypted) {
          return { ...base, encryptedShare: r[1] || '' };
        }
        return base;
      }).filter((p) => p.shareIndex > 0);
    } catch {
      return [];
    }
  }

  static async initializePendingShares(
    token: GoogleDriveToken,
    spreadsheetId: string,
    shares: Array<{ shareIndex: number; encryptedShare: string }>,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<{ inserted: number; skipped: number }> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.initializePendingSharesPortable(userPnIdentifier, shares, accountId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await this.ensureSheetTabs(auth, spreadsheetId);

    const existingPending = await this.listPendingShares(token, spreadsheetId, userPnIdentifier, accountId, true);
    const custodians = await this.listCustodians(token, spreadsheetId, userPnIdentifier, accountId);
    const assignedIndices = new Set(
      custodians
        .filter((c) => normalizeCustodianStatus(c.status) !== 'revoked')
        .map((c) => c.shareIndex)
    );
    const pendingIndices = new Set(existingPending.map((p) => p.shareIndex));

    let inserted = 0;
    let skipped = 0;
    const toAppend: string[][] = [];
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
      toAppend.push([String(share.shareIndex), share.encryptedShare, now]);
      pendingIndices.add(share.shareIndex);
      inserted += 1;
    }

    if (toAppend.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'PendingShares!A:C',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: toAppend },
      });
    }

    return { inserted, skipped };
  }

  static async removePendingShare(
    token: GoogleDriveToken,
    spreadsheetId: string,
    shareIndex: number,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.removePendingSharePortable(userPnIdentifier, shareIndex, accountId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'PendingShares!A2:C',
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex((r) => parseInt(r[0] || '0', 10) === shareIndex);
    if (idx < 0) return false;
    const sheetRow = idx + 2;
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `PendingShares!A${sheetRow}:C${sheetRow}`,
    });
    return true;
  }

  static async appendPendingShare(
    token: GoogleDriveToken,
    spreadsheetId: string,
    share: { shareIndex: number; encryptedShare: string },
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await RecoveryPortable.appendPendingSharePortable(userPnIdentifier, share, accountId);
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'PendingShares!A:C',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[String(share.shareIndex), share.encryptedShare, new Date().toISOString()]],
      },
    });
  }

  static async assignShareToCustodian(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: RecoveryCustodianRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await RecoveryPortable.assignShareToCustodianPortable(userPnIdentifier, row, accountId);
      return;
    }
    const pending = await this.listPendingShares(token, spreadsheetId, userPnIdentifier, accountId, true);
    const pendingRow = pending.find((p) => p.shareIndex === row.shareIndex);
    if (!pendingRow?.encryptedShare) {
      throw new Error('pending_share_not_found');
    }
    const assignRow: RecoveryCustodianRow = {
      ...row,
      encryptedShare: row.encryptedShare || pendingRow.encryptedShare,
      status: 'invited',
    };
    await this.upsertCustodian(token, spreadsheetId, assignRow, userPnIdentifier, accountId);
    await this.removePendingShare(token, spreadsheetId, row.shareIndex, userPnIdentifier, accountId);
  }

  static async revokeCustodian(
    token: GoogleDriveToken,
    spreadsheetId: string,
    custodianId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    threshold?: number
  ): Promise<RecoveryCustodianRow> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.revokeCustodianPortable(userPnIdentifier, custodianId, accountId, threshold);
    }
    const custodians = await this.listCustodians(token, spreadsheetId, userPnIdentifier, accountId);
    const row = custodians.find((c) => c.custodianId === custodianId);
    if (!row) throw new Error('custodian_not_found');
    if (row.unrevokable) throw new Error('custodian_unrevokable');
    if (normalizeCustodianStatus(row.status) === 'revoked') throw new Error('custodian_already_revoked');

    if (
      threshold != null
      && threshold > 0
      && normalizeCustodianStatus(row.status) === 'accepted'
    ) {
      const acceptedCount = custodians.filter(
        (c) => normalizeCustodianStatus(c.status) === 'accepted'
      ).length;
      if (acceptedCount - 1 < threshold) {
        throw new Error('revoke_would_break_threshold');
      }
    }

    const revoked: RecoveryCustodianRow = { ...row, status: 'revoked' };
    await this.upsertCustodian(token, spreadsheetId, revoked, userPnIdentifier, accountId);
    if (row.encryptedShare && row.shareIndex > 0) {
      await this.appendPendingShare(
        token,
        spreadsheetId,
        { shareIndex: row.shareIndex, encryptedShare: row.encryptedShare },
        userPnIdentifier,
        accountId
      );
    }
    return revoked;
  }

  static async acceptCustodian(
    token: GoogleDriveToken,
    spreadsheetId: string,
    custodianId: string,
    custodianPublicKey: string | undefined,
    custodianPnIdentifier: string | undefined,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<RecoveryCustodianRow> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.acceptCustodianPortable(
        userPnIdentifier,
        custodianId,
        custodianPublicKey,
        custodianPnIdentifier,
        accountId
      );
    }
    const custodians = await this.listCustodians(token, spreadsheetId, userPnIdentifier, accountId);
    const row = custodians.find((c) => c.custodianId === custodianId);
    if (!row) throw new Error('custodian_not_found');
    if (normalizeCustodianStatus(row.status) === 'revoked') throw new Error('custodian_revoked');

    const accepted: RecoveryCustodianRow = {
      ...row,
      status: 'accepted',
      custodianPublicKey: custodianPublicKey || row.custodianPublicKey,
      custodianPnIdentifier: custodianPnIdentifier || row.custodianPnIdentifier,
    };
    await this.upsertCustodian(token, spreadsheetId, accepted, userPnIdentifier, accountId);
    return accepted;
  }

  static async getCustodianById(
    token: GoogleDriveToken,
    spreadsheetId: string,
    custodianId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<RecoveryCustodianRow | null> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.getCustodianByIdPortable(userPnIdentifier, custodianId, accountId);
    }
    const custodians = await this.listCustodians(token, spreadsheetId, userPnIdentifier, accountId);
    return custodians.find((c) => c.custodianId === custodianId) || null;
  }

  static async upsertCustodian(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: RecoveryCustodianRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await RecoveryPortable.upsertCustodianPortable(userPnIdentifier, row, accountId);
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Custodians!A2:K',
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex((r) => r[0] === row.custodianId);
    const values = [this.custodianToValues(row)];
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Custodians!A${idx + 2}:K${idx + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Custodians!A:K',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
    }
  }

  static async listCustodians(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<RecoveryCustodianRow[]> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.listCustodiansPortable(userPnIdentifier, accountId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Custodians!A2:K',
    });
    return (res.data.values || []).map((r) => this.parseCustodianRow(r)).filter((c) => c.custodianId);
  }

  static async upsertRecoveryRequest(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: RecoveryRequestRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await RecoveryPortable.upsertRecoveryRequestPortable(userPnIdentifier, row, accountId);
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RecoveryRequests!A2:G',
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex((r) => r[0] === row.requestId);
    const values = [
      row.requestId,
      row.publicKey,
      row.status,
      String(row.threshold),
      row.sharesJson,
      row.claimantName,
      row.createdAt,
    ];
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `RecoveryRequests!A${idx + 2}:G${idx + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [values] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'RecoveryRequests!A:G',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [values] },
      });
    }
  }

  /** Persist `active` / `pending` custodian rows as `invited` for vault lifecycle. */
  static async normalizeLegacyCustodianRows(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<{ normalized: number }> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.normalizeLegacyCustodianRowsPortable(userPnIdentifier, accountId);
    }
    const custodians = await this.listCustodians(token, spreadsheetId, userPnIdentifier, accountId);
    let normalized = 0;
    for (const row of custodians) {
      const raw = (row.status || '').toLowerCase();
      if (raw !== 'active' && raw !== 'pending') continue;
      const updated: RecoveryCustodianRow = { ...row, status: 'invited' };
      await this.upsertCustodian(token, spreadsheetId, updated, userPnIdentifier, accountId);
      normalized += 1;
    }
    return { normalized };
  }

  static async listRecoveryRequests(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<RecoveryRequestRow[]> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RecoveryPortable.listRecoveryRequestsPortable(userPnIdentifier, accountId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RecoveryRequests!A2:G',
    });
    return (res.data.values || []).map((r) => ({
      requestId: r[0] || '',
      publicKey: r[1] || '',
      status: (r[2] || 'pending') as RecoveryRequestRow['status'],
      threshold: parseInt(r[3] || '2', 10),
      sharesJson: r[4] || '[]',
      claimantName: r[5] || '',
      createdAt: r[6] || '',
    }));
  }
}
