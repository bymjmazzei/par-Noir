/**
 * Messaging Ledger Sheets Service
 * Manages messaging activity ledger in Google Sheets
 * Replaces messaging_ledger.json for better scalability
 */

import { google } from 'googleapis';

export interface MessagingActivityEntry {
  message_activity_id: string;
  user_did: string;
  activity_type: 'message_sent' | 'message_received' | 'message_read' | 'thread_created';
  from_did?: string;
  to_did?: string;
  message_id?: string;
  thread_id?: string;
  metadata?: any;
  created_at: string;
}

export class MessagingLedgerSheetsService {
  private static readonly MESSAGING_LEDGER_FILE_NAME = 'messaging_ledger.xlsx';

  /**
   * Get or create messaging ledger sheet
   */
  static async getOrCreateMessagingLedgerSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing messaging ledger sheet in metadata folder
    const fileQuery = `name='${this.MESSAGING_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Broad search: only move a file if it is provably in this pN (metadataFolderId or pnFolderId in direct parents). Else create new.
    let pnFolderId: string | null = null;
    try {
      const metadataFolderInfo = await drive.files.get({ fileId: metadataFolderId, fields: 'parents' });
      const mp = metadataFolderInfo.data.parents || [];
      if (mp.length > 0) pnFolderId = mp[0];
    } catch { /* ignore */ }

    const broadQuery = `name='${this.MESSAGING_LEDGER_FILE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const broadSearchResponse = await drive.files.list({
      q: broadQuery,
      fields: 'files(id,name,parents)',
      pageSize: 5
    });

    if (broadSearchResponse.data.files && broadSearchResponse.data.files.length > 0) {
      const foundFiles = broadSearchResponse.data.files;
      const candidates = foundFiles.filter(
        (f) =>
          f.parents &&
          (f.parents.includes(metadataFolderId) || (pnFolderId != null && f.parents.includes(pnFolderId)))
      );
      if (candidates.length > 0) {
        const existingFile = candidates[0];
        const existingFileId = existingFile.id!;
        const existingParents = existingFile.parents || [];
        if (!existingParents.includes(metadataFolderId)) {
          await drive.files.update({
            fileId: existingFileId,
            removeParents: existingParents.join(','),
            addParents: metadataFolderId,
            fields: 'id, parents'
          });
        }
        return existingFileId;
      }
    }

    // Legacy fallback: search for short name (older creates used title without .xlsx)
    const legacyQuery = `name='messaging_ledger' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const legacyResponse = await drive.files.list({
      q: legacyQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });
    if (legacyResponse.data.files && legacyResponse.data.files.length > 0) {
      return legacyResponse.data.files[0].id!;
    }

    // Final check before create: another request may have created it
    const finalCheckResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });
    if (finalCheckResponse.data.files && finalCheckResponse.data.files.length > 0) {
      return finalCheckResponse.data.files[0].id!;
    }

    // Create new messaging ledger sheet (use full constant so search finds it)
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: this.MESSAGING_LEDGER_FILE_NAME
        },
        sheets: [
          {
            properties: {
              title: 'Activities',
              gridProperties: {
                rowCount: 100000,
                columnCount: 9
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create messaging ledger sheet: no ID returned');
    }

    // Move to metadata folder
    const fileInfo = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'parents'
    });
    
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    // Set up headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Activities!A1:I1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Activity ID', 'User DID', 'Activity Type', 'From DID', 'To DID', 'Message ID', 'Thread ID', 'Metadata (JSON)', 'Created At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Append activity to ledger
   */
  static async appendActivity(
    accessToken: string,
    spreadsheetId: string,
    activity: MessagingActivityEntry
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Activities!A:I',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          activity.message_activity_id,
          activity.user_did,
          activity.activity_type,
          activity.from_did || '',
          activity.to_did || '',
          activity.message_id || '',
          activity.thread_id || '',
          JSON.stringify(activity.metadata || {}),
          activity.created_at
        ]]
      }
    });
  }

  /**
   * Get activities
   */
  static async getActivities(
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: MessagingActivityEntry['activity_type'];
      threadId?: string;
    }
  ): Promise<{ activities: MessagingActivityEntry[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all activities (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Activities!A2:I'
    });

    if (!response.data.values) {
      return { activities: [], total: 0 };
    }

    // Parse activities
    let activities = response.data.values.map((row: any[]) => {
      const activity: MessagingActivityEntry = {
        message_activity_id: row[0],
        user_did: row[1],
        activity_type: row[2],
        from_did: row[3] || undefined,
        to_did: row[4] || undefined,
        message_id: row[5] || undefined,
        thread_id: row[6] || undefined,
        metadata: row[7] ? JSON.parse(row[7]) : {},
        created_at: row[8]
      };
      return activity;
    });

    // Filter by activity type if specified
    if (options?.activityType) {
      activities = activities.filter(a => a.activity_type === options.activityType);
    }

    // Filter by thread ID if specified
    if (options?.threadId) {
      activities = activities.filter(a => a.thread_id === options.threadId);
    }

    // Sort by created_at descending (most recent first)
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = activities.length;
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // Apply pagination
    const paginatedActivities = activities.slice(offset, offset + limit);

    return {
      activities: paginatedActivities,
      total
    };
  }
}
