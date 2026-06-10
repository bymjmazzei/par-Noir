/**
 * Pending integrator data-point consent requests on user Drive (_metadata).
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import * as RequestPortable from './storage/requestPortableService';

const FILE_NAME = 'data-point-requests.xlsx';
const SHEET_TITLE = 'Requests';

export interface DataPointRequestRow {
  requestId: string;
  clientId: string;
  toolName: string;
  dataPoints: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  respondedAt?: string;
}

export class DataPointRequestSheetsService {
  static async getOrCreateSpreadsheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RequestPortable.PORTABLE_DATA_POINT_REQUESTS_SHEET;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    const q = `name='${FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
    const existing = list.data.files?.[0]?.id;
    if (existing) {
      return existing;
    }

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: FILE_NAME },
        sheets: [
          {
            properties: {
              title: SHEET_TITLE,
              gridProperties: { rowCount: 10000, columnCount: 8 }
            }
          }
        ]
      }
    });
    const id = spreadsheet.data.spreadsheetId;
    if (!id) {
      throw new Error('Failed to create data-point-requests spreadsheet');
    }

    const fileInfo = await drive.files.get({ fileId: id, fields: 'parents' });
    const parents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: id,
      removeParents: parents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${SHEET_TITLE}!A1:H1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          [
            'Request ID',
            'Client ID',
            'Tool Name',
            'Data Points',
            'Reason',
            'Status',
            'Created At',
            'Responded At'
          ]
        ]
      }
    });

    return id;
  }

  static async appendRequest(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: DataPointRequestRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await RequestPortable.appendDataPointRequestPortable(userPnIdentifier, row, accountId);
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_TITLE}!A:H`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [
          [
            row.requestId,
            row.clientId,
            row.toolName,
            row.dataPoints,
            row.reason,
            row.status,
            row.createdAt,
            row.respondedAt || ''
          ]
        ]
      }
    });
  }

  static async listRequests(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    statusFilter?: DataPointRequestRow['status']
  ): Promise<DataPointRequestRow[]> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      const rows = await RequestPortable.listDataPointRequestsPortable(userPnIdentifier, accountId);
      return statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_TITLE}!A2:H`
    });

    const rows = response.data.values || [];
    return rows
      .map((row) => ({
        requestId: String(row[0] || ''),
        clientId: String(row[1] || ''),
        toolName: String(row[2] || ''),
        dataPoints: String(row[3] || ''),
        reason: String(row[4] || ''),
        status: (row[5] || 'pending') as DataPointRequestRow['status'],
        createdAt: String(row[6] || ''),
        respondedAt: row[7] ? String(row[7]) : undefined
      }))
      .filter((r) => r.requestId && (!statusFilter || r.status === statusFilter));
  }

  static async updateRequestStatus(
    token: GoogleDriveToken,
    spreadsheetId: string,
    requestId: string,
    status: 'approved' | 'declined',
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      try {
        await RequestPortable.updateDataPointRequestStatusPortable(
          userPnIdentifier,
          requestId,
          status,
          new Date().toISOString(),
          accountId
        );
        return true;
      } catch {
        return false;
      }
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_TITLE}!A2:H`
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row) => row[0] === requestId);
    if (rowIndex < 0) {
      return false;
    }

    const sheetRow = rowIndex + 2;
    const respondedAt = new Date().toISOString();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TITLE}!F${sheetRow}:H${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[status, rows[rowIndex][6] || respondedAt, respondedAt]]
      }
    });

    return true;
  }

  static async findSpreadsheetId(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string | null> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RequestPortable.PORTABLE_DATA_POINT_REQUESTS_SHEET;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const q = `name='${FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
    return list.data.files?.[0]?.id ?? null;
  }
}
