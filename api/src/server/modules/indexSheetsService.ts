/**
 * Index Sheets Service
 * Manages file index in Google Sheets
 * Replaces public-file-index.json and owner-file-index.json for better scalability
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import {
  serializeSlimIndexEntryJson,
  type IndexSheetKind,
} from '@par-noir/storage-migration';

export interface IndexFileEntry {
  fileId: string;
  googleDriveFileId?: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  visibility: 'public' | 'private' | 'friends';
  uploadedAt: string;
  owner?: {
    did: string;
    identifier: string;
  };
  tags?: string[];
  description?: string;
  thumbnail?: string;
  publicToken?: string;
  engagement?: any;
  inReplyTo?: string;
  repostOf?: string;
  isPartOf?: string;
  indexingPermissions?: any;
  contentClass?: 'media' | 'thought' | 'collection';
  isThoughtThumbnail?: boolean;
  thought?: any;
  textPost?: any;
  collection?: any;
  [key: string]: any; // Allow additional fields
}

export interface IndexFile {
  identifier: string;
  files: IndexFileEntry[];
  updatedAt: string;
}

export class IndexSheetsService {
  private static readonly PUBLIC_INDEX_FILE_NAME = 'public-file-index.xlsx';
  private static readonly OWNER_INDEX_FILE_NAME = 'owner-file-index.xlsx';

  /**
   * Create an index sheet in the given folder. Used only at Drive connection init.
   * @param folderId - _metadata or a content-class folder (e.g. media, thoughts, collections)
   */
  static async createIndexSheet(
    token: GoogleDriveToken,
    folderId: string,
    indexType: 'public' | 'owner',
    userPnIdentifier: string,
    accountId: string | undefined,
    contentClass?: 'media' | 'thoughts' | 'collections'
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const fileName =
      contentClass != null
        ? `${contentClass}-${indexType}-index.xlsx`
        : indexType === 'public'
          ? this.PUBLIC_INDEX_FILE_NAME
          : this.OWNER_INDEX_FILE_NAME;

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: fileName },
        sheets: [
          {
            properties: {
              title: 'Files',
              gridProperties: { rowCount: 100000, columnCount: 6 }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error(`Failed to create ${indexType} index sheet: no ID returned`);
    }

    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: folderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Files!A1:E1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['File ID', 'Google Drive File ID', 'Visibility', 'Uploaded At', 'Entry Data (JSON)']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get index sheet. Scoped search only; throws if not found.
   * Sheets are created at Drive connection init; this does not create, move, or delete.
   * @param contentClass - When set (e.g. 'media'|'thoughts'|'collections'), uses {contentClass}-{owner|public}-index.xlsx. Omit for root indexes.
   */
  static async getIndexSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    indexType: 'public' | 'owner',
    userPnIdentifier: string,
    accountId: string | undefined,
    contentClass?: 'media' | 'thoughts' | 'collections'
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const fileName =
      contentClass != null
        ? `${contentClass}-${indexType}-index.xlsx`
        : indexType === 'public'
          ? this.PUBLIC_INDEX_FILE_NAME
          : this.OWNER_INDEX_FILE_NAME;

    const fileQuery = `name='${fileName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
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
   * Add file to index
   */
  static async addFile(
    token: GoogleDriveToken,
    spreadsheetId: string,
    entry: IndexFileEntry,
    userPnIdentifier: string,
    accountId: string | undefined,
    indexKind?: IndexSheetKind
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const entryJson = serializeSlimIndexEntryJson(entry, { indexKind });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Files!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          entry.fileId,
          entry.googleDriveFileId || '',
          entry.visibility,
          entry.uploadedAt,
          entryJson
        ]]
      }
    });
  }

  /**
   * Update file in index
   */
  static async updateFile(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    updates: Partial<IndexFileEntry>,
    userPnIdentifier: string,
    accountId: string | undefined,
    indexKind?: IndexSheetKind
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all files
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Files!A2:E'
    });

    if (!response.data.values) {
      throw new Error('File not found in index');
    }

    // Find the file
    let foundIndex = -1;
    let existingEntry: IndexFileEntry | null = null;

    for (let i = 0; i < response.data.values.length; i++) {
      const row = response.data.values[i];
      if (row[0] === fileId) {
        foundIndex = i;
        existingEntry = JSON.parse(row[4] || '{}');
        break;
      }
    }

    if (foundIndex === -1 || !existingEntry) {
      throw new Error('File not found in index');
    }

    // Merge updates
    const updatedEntry: IndexFileEntry = {
      ...existingEntry,
      ...updates,
      fileId // Ensure fileId doesn't change
    };

    const entryJson = serializeSlimIndexEntryJson(updatedEntry, { indexKind });

    // Update the row
    const rowIndex = foundIndex + 2; // +2 because we skip header and 0-indexed
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Files!A${rowIndex}:E${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          updatedEntry.fileId,
          updatedEntry.googleDriveFileId || '',
          updatedEntry.visibility,
          updatedEntry.uploadedAt,
          entryJson
        ]]
      }
    });
  }

  /**
   * Remove file from index
   */
  static async removeFile(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all files
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Files!A2:E'
    });

    if (!response.data.values) {
      return;
    }

    // Filter out the file
    const rows = response.data.values.filter((row: any[]) => row[0] !== fileId);
    
    // Clear and rewrite
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Files!A2:E'
    });

    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Files!A2:E',
        valueInputOption: 'RAW',
        requestBody: {
          values: rows
        }
      });
    }
  }

  /**
   * Get file by ID
   */
  static async getFileById(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<IndexFileEntry | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Files!A2:E'
    });

    if (!response.data.values) {
      return null;
    }

    for (const row of response.data.values) {
      if (row[0] === fileId) {
        return JSON.parse(row[4] || '{}') as IndexFileEntry;
      }
    }

    return null;
  }

  /**
   * Replace all files in the index (full replace). Used by content-class indexes.
   * Optionally stores updatedAt in Files!F1 for parity with JSON index structure.
   */
  static async setAllFiles(
    token: GoogleDriveToken,
    spreadsheetId: string,
    entries: IndexFileEntry[],
    userPnIdentifier: string,
    accountId: string | undefined,
    updatedAt?: string,
    indexKind?: IndexSheetKind
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Files!A2:E'
    });

    if (entries.length > 0) {
      const rows = entries.map(e => [
        e.fileId,
        e.googleDriveFileId || '',
        e.visibility,
        e.uploadedAt,
        serializeSlimIndexEntryJson(e, { indexKind })
      ]);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Files!A2:E',
        valueInputOption: 'RAW',
        requestBody: { values: rows }
      });
    }

    if (updatedAt != null) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Files!F1',
          valueInputOption: 'RAW',
          requestBody: { values: [[updatedAt]] }
        });
      } catch (e: any) {
        if (/exceeds grid limits|Max columns/.test(e?.message || '')) {
          console.warn('[IndexSheetsService] Sheets has only 5 columns, cannot write updatedAt to F1 (use columnCount: 6 for new sheets).', e?.message);
        } else {
          throw e;
        }
      }
    }
  }

  /**
   * Get updatedAt from index metadata (Files!F1), if stored by setAllFiles.
   */
  static async getUpdatedAt(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Files!F1'
      });
      const v = res.data.values?.[0]?.[0];
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  /**
   * Get all files
   */
  static async getFiles(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    options?: {
      visibility?: 'public' | 'private' | 'friends';
      contentClass?: 'media' | 'thought' | 'collection';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ files: IndexFileEntry[]; total: number }> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Files!A2:E'
    });

    if (!response.data.values) {
      return { files: [], total: 0 };
    }

    // Parse all entries
    let files = response.data.values.map((row: any[]) => {
      return JSON.parse(row[4] || '{}') as IndexFileEntry;
    });

    // Filter by visibility if specified
    if (options?.visibility) {
      files = files.filter(f => f.visibility === options.visibility);
    }

    // Filter by contentClass if specified
    if (options?.contentClass) {
      files = files.filter(f => f.contentClass === options.contentClass);
    }

    const total = files.length;
    const limit = options?.limit || files.length;
    const offset = options?.offset || 0;

    // Apply pagination
    const paginatedFiles = files.slice(offset, offset + limit);

    return {
      files: paginatedFiles,
      total
    };
  }
}
