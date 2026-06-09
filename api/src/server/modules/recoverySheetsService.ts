/**
 * Recovery custodian roster + recovery requests on Google Drive (_metadata/recovery.xlsx).
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export interface RecoveryCustodianRow {
  custodianId: string;
  name: string;
  custodianType: string;
  encryptedShare: string;
  shareIndex: number;
  custodianshipCredential: string;
  status: string;
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

export class RecoverySheetsService {
  private static readonly FILE_NAME = 'recovery.xlsx';

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
          { properties: { title: 'Custodians', gridProperties: { rowCount: 500, columnCount: 8 } } },
          { properties: { title: 'RecoveryRequests', gridProperties: { rowCount: 500, columnCount: 7 } } }
        ]
      }
    });
    const spreadsheetId = created.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create recovery spreadsheet');
    }

    await drive.files.update({
      fileId: spreadsheetId,
      addParents: metadataFolderId,
      fields: 'id'
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: 'Custodians!A1:H1',
            values: [['custodianId', 'name', 'custodianType', 'encryptedShare', 'shareIndex', 'custodianshipCredential', 'status', 'createdAt']]
          },
          {
            range: 'RecoveryRequests!A1:G1',
            values: [['requestId', 'publicKey', 'status', 'threshold', 'sharesJson', 'claimantName', 'createdAt']]
          }
        ]
      }
    });

    return spreadsheetId;
  }

  static async upsertCustodian(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: RecoveryCustodianRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Custodians!A2:H'
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex((r) => r[0] === row.custodianId);
    const values = [
      row.custodianId,
      row.name,
      row.custodianType,
      row.encryptedShare,
      String(row.shareIndex),
      row.custodianshipCredential,
      row.status,
      row.createdAt
    ];
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Custodians!A${idx + 2}:H${idx + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [values] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Custodians!A:H',
        valueInputOption: 'RAW',
        requestBody: { values: [values] }
      });
    }
  }

  static async listCustodians(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<RecoveryCustodianRow[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Custodians!A2:H'
    });
    return (res.data.values || []).map((r) => {
      const newFormat = r.length >= 6 && typeof r[5] === 'string' && r[5].length > 40;
      if (newFormat) {
        return {
          custodianId: r[0] || '',
          name: r[1] || '',
          custodianType: r[2] || '',
          encryptedShare: r[3] || '',
          shareIndex: parseInt(r[4] || '0', 10) || 0,
          custodianshipCredential: r[5] || '',
          status: r[6] || '',
          createdAt: r[7] || ''
        };
      }
      return {
        custodianId: r[0] || '',
        name: r[1] || '',
        custodianType: r[2] || '',
        encryptedShare: r[3] || '',
        shareIndex: 0,
        custodianshipCredential: '',
        status: r[4] || '',
        createdAt: r[5] || ''
      };
    });
  }

  static async upsertRecoveryRequest(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: RecoveryRequestRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RecoveryRequests!A2:G'
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
      row.createdAt
    ];
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `RecoveryRequests!A${idx + 2}:G${idx + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [values] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'RecoveryRequests!A:G',
        valueInputOption: 'RAW',
        requestBody: { values: [values] }
      });
    }
  }

  static async listRecoveryRequests(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<RecoveryRequestRow[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RecoveryRequests!A2:G'
    });
    return (res.data.values || []).map((r) => ({
      requestId: r[0] || '',
      publicKey: r[1] || '',
      status: (r[2] || 'pending') as RecoveryRequestRow['status'],
      threshold: parseInt(r[3] || '2', 10),
      sharesJson: r[4] || '[]',
      claimantName: r[5] || '',
      createdAt: r[6] || ''
    }));
  }
}
