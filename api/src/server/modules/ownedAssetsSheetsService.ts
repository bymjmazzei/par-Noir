/**
 * Owned-asset + delegation registry on Google Drive (_metadata/owned-assets.xlsx).
 * Tabs: Assets, Delegations. Soft-revoke via status column.
 */

import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import { GoogleOAuth2Helper, type GoogleDriveToken } from './googleOAuth2Helper';

export interface OwnedAssetSheetRow {
  id: string;
  rootPnIdentifier: string;
  subjectPnIdentifier: string | null;
  kind: string;
  status: string;
  metadata: Record<string, unknown>;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface AssetDelegationSheetRow {
  id: string;
  ownedAssetId: string;
  delegateePnIdentifier: string | null;
  delegateeClientId: string | null;
  scope: string;
  expiresAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const ASSET_HEADERS = [
  'id',
  'rootPnIdentifier',
  'subjectPnIdentifier',
  'kind',
  'status',
  'metadata',
  'apiKeyId',
  'createdAt',
  'updatedAt',
  'revokedAt'
];

const DELEGATION_HEADERS = [
  'id',
  'ownedAssetId',
  'delegateePnIdentifier',
  'delegateeClientId',
  'scope',
  'expiresAt',
  'status',
  'createdAt',
  'updatedAt'
];

function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export class OwnedAssetsSheetsService {
  static readonly FILE_NAME = 'owned-assets.xlsx';

  static async getOrCreateSpreadsheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const q = `name='${this.FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const existing = await drive.files.list({ q, fields: 'files(id)' });
    if (existing.data.files?.[0]?.id) {
      return existing.data.files[0].id;
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.FILE_NAME },
        sheets: [
          { properties: { title: 'Assets', gridProperties: { rowCount: 100, columnCount: 12 } } },
          { properties: { title: 'Delegations', gridProperties: { rowCount: 100, columnCount: 12 } } }
        ]
      }
    });
    const spreadsheetId = created.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create owned-assets spreadsheet');

    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Assets!A1:J1', values: [ASSET_HEADERS] },
          { range: 'Delegations!A1:I1', values: [DELEGATION_HEADERS] }
        ]
      }
    });

    return spreadsheetId;
  }

  private static parseAssetRow(r: string[]): OwnedAssetSheetRow {
    return {
      id: r[0] || '',
      rootPnIdentifier: r[1] || '',
      subjectPnIdentifier: r[2]?.trim() || null,
      kind: r[3] || '',
      status: r[4] || 'active',
      metadata: parseJsonObject(r[5]),
      apiKeyId: r[6]?.trim() || null,
      createdAt: r[7] || new Date().toISOString(),
      updatedAt: r[8] || new Date().toISOString(),
      revokedAt: r[9]?.trim() || null
    };
  }

  private static assetToValues(row: OwnedAssetSheetRow): string[] {
    return [
      row.id,
      row.rootPnIdentifier,
      row.subjectPnIdentifier || '',
      row.kind,
      row.status,
      JSON.stringify(row.metadata ?? {}),
      row.apiKeyId || '',
      row.createdAt,
      row.updatedAt,
      row.revokedAt || ''
    ];
  }

  private static parseDelegationRow(r: string[]): AssetDelegationSheetRow {
    return {
      id: r[0] || '',
      ownedAssetId: r[1] || '',
      delegateePnIdentifier: r[2]?.trim() || null,
      delegateeClientId: r[3]?.trim() || null,
      scope: r[4] || '*',
      expiresAt: r[5]?.trim() || null,
      status: r[6] || 'active',
      createdAt: r[7] || new Date().toISOString(),
      updatedAt: r[8] || new Date().toISOString()
    };
  }

  private static delegationToValues(row: AssetDelegationSheetRow): string[] {
    return [
      row.id,
      row.ownedAssetId,
      row.delegateePnIdentifier || '',
      row.delegateeClientId || '',
      row.scope,
      row.expiresAt || '',
      row.status,
      row.createdAt,
      row.updatedAt
    ];
  }

  static async listAssets(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    includeRevoked = false
  ): Promise<OwnedAssetSheetRow[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assets!A2:J'
    });
    return (res.data.values || [])
      .map((r) => this.parseAssetRow(r as string[]))
      .filter((a) => a.id && (includeRevoked || a.status === 'active'));
  }

  static async upsertAsset(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    row: OwnedAssetSheetRow
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Assets!A2:J'
    });
    const values = res.data.values || [];
    const idx = values.findIndex((r) => (r[0] || '') === row.id);
    const line = this.assetToValues(row);
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Assets!A${idx + 2}:J${idx + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [line] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Assets!A:J',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [line] }
      });
    }
  }

  static async listDelegations(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    ownedAssetId?: string
  ): Promise<AssetDelegationSheetRow[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Delegations!A2:I'
    });
    return (res.data.values || [])
      .map((r) => this.parseDelegationRow(r as string[]))
      .filter((d) => d.id && (!ownedAssetId || d.ownedAssetId === ownedAssetId));
  }

  static async upsertDelegation(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    row: AssetDelegationSheetRow
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Delegations!A2:I'
    });
    const values = res.data.values || [];
    const idx = values.findIndex((r) => (r[0] || '') === row.id);
    const line = this.delegationToValues(row);
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Delegations!A${idx + 2}:I${idx + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [line] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Delegations!A:I',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [line] }
      });
    }
  }

  static newId(): string {
    return randomUUID();
  }
}
