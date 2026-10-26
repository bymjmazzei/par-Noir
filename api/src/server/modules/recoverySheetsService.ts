/**
 * Legacy recovery roster on Google Drive (_metadata/recovery.xlsx) or the portable recovery table.
 * Only storage-provider migration touches it; shares now live on custodians' own Drives via the relay.
 */

import { google } from 'googleapis';
import { normalizeCustodianStatus, parseUnrevokableFlag } from '@par-noir/recovery-crypto';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import { portableTableScan } from './storage/portableTableService';
import { RECOVERY_CUSTODIANS_SCHEMA } from './storage/tableSchemas';

export interface RecoveryCustodianRow {
  custodianId: string;
  name: string;
  custodianType: string;
  shareIndex: number;
  custodianshipCredential: string;
  status: string;
  createdAt: string;
  unrevokable: boolean;
  custodianPublicKey?: string;
  custodianPnIdentifier?: string;
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

export const PORTABLE_RECOVERY_SPREADSHEET = 'pn-portable-recovery';

/** Strip share material and coerce portable/sheet values into a roster row. */
export function toRosterRow(raw: Record<string, unknown>): RecoveryCustodianRow {
  const shareIndex = typeof raw.shareIndex === 'number' ? raw.shareIndex : parseInt(String(raw.shareIndex ?? '0'), 10) || 0;
  return {
    custodianId: String(raw.custodianId ?? ''),
    name: String(raw.name ?? ''),
    custodianType: String(raw.custodianType ?? ''),
    shareIndex,
    custodianshipCredential: String(raw.custodianshipCredential ?? ''),
    status: normalizeCustodianStatus(String(raw.status ?? 'invited')),
    createdAt: String(raw.createdAt ?? ''),
    unrevokable: raw.unrevokable === true || String(raw.unrevokable) === 'true',
    custodianPublicKey: raw.custodianPublicKey ? String(raw.custodianPublicKey) : undefined,
    custodianPnIdentifier: raw.custodianPnIdentifier ? String(raw.custodianPnIdentifier) : undefined,
  };
}

export class RecoverySheetsService {
  private static readonly FILE_NAME = 'recovery.xlsx';

  static async getOrCreateSpreadsheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return PORTABLE_RECOVERY_SPREADSHEET;
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

    // Sheets API creates under My Drive root; move fully into _metadata (do not leave a root parent).
    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents',
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Custodians!A1:K1', values: [CUSTODIAN_HEADERS] },
          { range: 'PendingShares!A1:C1', values: [PENDING_HEADERS] },
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
    for (const title of ['PendingShares', 'RecoveryRequests']) {
      if (!titles.has(title)) {
        requests.push({ addSheet: { properties: { title, gridProperties: { rowCount: 50, columnCount: 8 } } } });
      }
    }
    if (requests.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    }
  }

  private static parseCustodianRow(r: string[]): RecoveryCustodianRow {
    const newFormat = r.length >= 6 && typeof r[5] === 'string' && r[5].length > 20;
    if (newFormat) {
      return {
        custodianId: r[0] || '',
        name: r[1] || '',
        custodianType: r[2] || '',
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
      shareIndex: 0,
      custodianshipCredential: '',
      status: normalizeCustodianStatus(r[4] || 'invited'),
      createdAt: r[5] || '',
      unrevokable: false,
    };
  }

  static async listCustodians(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<RecoveryCustodianRow[]> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      const rows = await portableTableScan<Record<string, unknown>>(userPnIdentifier, RECOVERY_CUSTODIANS_SCHEMA, accountId);
      return rows.map(toRosterRow).filter((c) => c.custodianId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Custodians!A2:K',
    });
    return (res.data.values || []).map((r) => this.parseCustodianRow(r)).filter((c) => c.custodianId);
  }

  /** Replace the Google workbook with the roster only; share and request tabs are cleared. */
  static async replaceRoster(
    token: GoogleDriveToken,
    spreadsheetId: string,
    custodians: RecoveryCustodianRow[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: { ranges: ['Custodians!A2:K', 'PendingShares!A2:C', 'RecoveryRequests!A2:H'] },
    });
    if (!custodians.length) return;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Custodians!A2:K',
      valueInputOption: 'RAW',
      requestBody: {
        values: custodians.map((c) => [
          c.custodianId,
          c.name,
          c.custodianType,
          '',
          String(c.shareIndex),
          c.custodianshipCredential,
          c.status,
          c.createdAt,
          c.unrevokable ? 'true' : 'false',
          c.custodianPublicKey || '',
          c.custodianPnIdentifier || '',
        ]),
      },
    });
  }
}
