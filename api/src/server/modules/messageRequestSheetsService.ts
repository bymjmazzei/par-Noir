/**
 * Message requests stored in recipient's Google Drive (_metadata), same ownership model as messaging.
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import * as RequestPortable from './storage/requestPortableService';

const FILE_NAME = 'message_requests.xlsx';
const SHEET_TITLE = 'Requests';

export interface StoredMessageRequestRow {
  requestId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  kemCiphertext?: string;
  cryptoVersion?: number;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: string;
}

export class MessageRequestSheetsService {
  /** List-only: returns spreadsheet id if `message_requests.xlsx` exists under metadata. */
  static async findRequestsSpreadsheetId(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string | null> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RequestPortable.PORTABLE_MESSAGE_REQUESTS_SHEET;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const q = `name='${FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
    const id = list.data.files?.[0]?.id;
    return id ?? null;
  }

  static async getOrCreateSpreadsheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RequestPortable.PORTABLE_MESSAGE_REQUESTS_SHEET;
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
      throw new Error('Failed to create message requests spreadsheet');
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
      range: `${SHEET_TITLE}!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Request ID', 'From pN', 'To pN', 'Content', 'Status', 'Created At', 'KEM Ciphertext', 'Crypto Version']]
      }
    });

    return id;
  }

  static async listRequests(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<StoredMessageRequestRow[]> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return RequestPortable.listMessageRequestsPortable(userPnIdentifier, accountId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_TITLE}!A2:H`
    });
    const rows = res.data.values || [];
    const out: StoredMessageRequestRow[] = [];
    for (const row of rows) {
      if (!row[0]) continue;
      const raw = String(row[4] || 'pending').toLowerCase();
      const status: 'pending' | 'accepted' | 'declined' =
        raw === 'accepted' ? 'accepted' : raw === 'declined' ? 'declined' : 'pending';
      out.push({
        requestId: String(row[0]),
        fromPnIdentifier: String(row[1] || ''),
        toPnIdentifier: String(row[2] || ''),
        content: String(row[3] || ''),
        status,
        timestamp: String(row[5] || new Date().toISOString()),
        kemCiphertext: row[6] ? String(row[6]) : undefined,
        cryptoVersion: row[7] ? Number(row[7]) : undefined
      });
    }
    return out;
  }

  static async appendRequest(
    token: GoogleDriveToken,
    spreadsheetId: string,
    req: {
      requestId: string;
      fromPn: string;
      toPn: string;
      content: string;
      kemCiphertext?: string;
      cryptoVersion?: number;
    },
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      const ts = new Date().toISOString();
      await RequestPortable.appendMessageRequestPortable(
        userPnIdentifier,
        {
          requestId: req.requestId,
          fromPnIdentifier: req.fromPn,
          toPnIdentifier: req.toPn,
          content: req.content,
          status: 'pending',
          timestamp: ts,
          kemCiphertext: req.kemCiphertext,
          cryptoVersion: req.cryptoVersion
        },
        accountId
      );
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const ts = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_TITLE}!A:H`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          req.requestId,
          req.fromPn,
          req.toPn,
          req.content,
          'pending',
          ts,
          req.kemCiphertext || '',
          req.cryptoVersion != null ? String(req.cryptoVersion) : ''
        ]]
      }
    });
  }

  static async setRequestStatus(
    token: GoogleDriveToken,
    spreadsheetId: string,
    requestId: string,
    status: 'accepted' | 'declined',
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await RequestPortable.setMessageRequestStatusPortable(userPnIdentifier, requestId, status, accountId);
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_TITLE}!A2:H`
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === requestId);
    if (rowIndex === -1) {
      throw new Error('Request not found');
    }
    const sheetRow = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TITLE}!E${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[status]] }
    });
  }
}
