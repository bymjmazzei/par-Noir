/**
 * Prism Ledger Sheets Service
 * Manages prism_ledger.xlsx in user's _metadata folder
 * Tracks: user reports, flagged content (user's content), Ray vote history
 * Created during cloud initialization
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export type PrismLedgerEntryType = 'report' | 'flagged' | 'ray_vote';

export interface PrismLedgerEntry {
  activity_id: string;
  user_pn_identifier: string;
  activity_type: PrismLedgerEntryType;
  target_file_id?: string;
  target_owner_pn_identifier?: string;
  vote?: 'approve' | 'deny';
  metadata?: string;
  created_at: string;
}

export class PrismLedgerSheetsService {
  private static readonly PRISM_LEDGER_FILE_NAME = 'prism_ledger.xlsx';

  /**
   * Create prism ledger sheet in _metadata. Used only at Drive connection init.
   */
  static async createPrismLedgerSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.PRISM_LEDGER_FILE_NAME },
        sheets: [{
          properties: {
            title: 'Activities',
            gridProperties: { rowCount: 100000, columnCount: 8 }
          }
        }]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create prism ledger sheet: no ID returned');

    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Activities!A1:H1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Activity ID', 'User DID', 'Activity Type', 'Target File ID', 'Target Owner DID', 'Vote', 'Metadata (JSON)', 'Created At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get prism ledger sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getPrismLedgerSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.PRISM_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Append entry to prism ledger
   */
  static async appendEntry(
    token: GoogleDriveToken,
    spreadsheetId: string,
    entry: PrismLedgerEntry,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Activities!A:H',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          entry.activity_id,
          entry.user_pn_identifier,
          entry.activity_type,
          entry.target_file_id || '',
          entry.target_owner_pn_identifier || '',
          entry.vote || '',
          typeof entry.metadata === 'string' ? entry.metadata : (entry.metadata ? JSON.stringify(entry.metadata) : ''),
          entry.created_at
        ]]
      }
    });
  }
}
