/**
 * Activity Ledger Sheets Service
 * Manages activity ledger in Google Sheets table
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export interface ActivityEntry {
  activity_id: string;
  user_pn_identifier: string;
  activity_type: string;
  target_type?: string;
  target_pn_identifier?: string; // pn-identifier when target_type is 'user', otherwise the target ID (feed ID, file ID, etc.)
  actor_pn_identifier?: string;
  metadata?: any;
  created_at: string;
}

export class ActivityLedgerSheetsService {
  private static readonly ACTIVITY_LEDGER_FILE_NAME = 'activity_ledger.xlsx';

  /**
   * Create activity ledger sheet in _metadata. Used only at Drive connection init.
   */
  static async createActivityLedgerSheet(
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
        properties: { title: this.ACTIVITY_LEDGER_FILE_NAME },
        sheets: [
          {
            properties: {
              title: 'Activities',
              gridProperties: { rowCount: 100000, columnCount: 8 }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create activity ledger sheet: no ID returned');

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
        values: [['Activity ID', 'User DID', 'Activity Type', 'Target Type', 'Target ID', 'Actor DID', 'Metadata', 'Created At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get activity ledger sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getActivityLedgerSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.ACTIVITY_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
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
   * Append activity to activity ledger sheet
   */
  static async appendActivity(
    token: GoogleDriveToken,
    spreadsheetId: string,
    activity: ActivityEntry,
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
          activity.activity_id,
          activity.user_pn_identifier,
          activity.activity_type,
          activity.target_type || '',
          activity.target_pn_identifier || '',
          activity.actor_pn_identifier || '',
          JSON.stringify(activity.metadata || {}),
          activity.created_at
        ]]
      }
    });
  }

  /**
   * Get activities from activity ledger sheet
   */
  static async getActivities(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: string;
      userPnIdentifier?: string;
    }
  ): Promise<{ activities: ActivityEntry[]; total: number }> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all activities (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Activities!A2:H'
    });

    const rows = response.data.values || [];
    let activities: ActivityEntry[] = rows.map(row => {
      let metadata = {};
      try {
        if (row[6]) {
          metadata = JSON.parse(row[6]);
        }
      } catch (e) {
        // If metadata is not valid JSON, leave as empty object
      }

      return {
        activity_id: row[0] || '',
        user_pn_identifier: row[1] || '',
        activity_type: row[2] || '',
        target_type: row[3] || undefined,
        target_pn_identifier: row[4] || undefined,
        actor_pn_identifier: row[5] || undefined,
        metadata,
        created_at: row[7] || new Date().toISOString()
      };
    });

    // Filter by activity type if specified
    if (options?.activityType) {
      activities = activities.filter(a => a.activity_type === options.activityType);
    }

    // Filter by user pn identifier if specified
    if (options?.userPnIdentifier) {
      // Normalize when filtering
      const normalizedUserPnIdentifier = options.userPnIdentifier?.startsWith('pn-') ? options.userPnIdentifier : `pn-${options.userPnIdentifier}`;
      activities = activities.filter(a => {
        // Validate user_pn_identifier exists before calling .startsWith()
        if (!a.user_pn_identifier) {
          console.warn('[ActivityLedgerSheetsService] Skipping activity with undefined user_pn_identifier:', a);
          return false;
        }
        const normalizedAUserPnIdentifier = a.user_pn_identifier.startsWith('pn-') ? a.user_pn_identifier : `pn-${a.user_pn_identifier}`;
        return normalizedAUserPnIdentifier === normalizedUserPnIdentifier;
      });
    }

    // Sort by created_at descending (most recent first)
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = activities.length;

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginatedActivities = activities.slice(offset, offset + limit);

    return {
      activities: paginatedActivities,
      total
    };
  }

  /**
   * Get activity by ID
   */
  static async getActivityById(
    token: GoogleDriveToken,
    spreadsheetId: string,
    activityId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<ActivityEntry | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all activities to find the one with matching ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Activities!A2:H'
    });

    const rows = response.data.values || [];
    const row = rows.find(r => r[0] === activityId);

    if (!row) {
      return null;
    }

    let metadata = {};
    try {
      if (row[6]) {
        metadata = JSON.parse(row[6]);
      }
    } catch (e) {
      // If metadata is not valid JSON, leave as empty object
    }

    return {
      activity_id: row[0] || '',
      user_pn_identifier: row[1] || '',
      activity_type: row[2] || '',
      target_type: row[3] || undefined,
      target_pn_identifier: row[4] || undefined,
      actor_pn_identifier: row[5] || undefined,
      metadata,
      created_at: row[7] || new Date().toISOString()
    };
  }

  static async setAllActivities(
    token: GoogleDriveToken,
    spreadsheetId: string,
    activities: ActivityEntry[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Activities!A2:H' });
    if (activities.length === 0) return;
    const rows = activities.map((a) => [
      a.activity_id,
      a.user_pn_identifier,
      a.activity_type,
      a.target_type || '',
      a.target_pn_identifier || '',
      a.actor_pn_identifier || '',
      JSON.stringify(a.metadata || {}),
      a.created_at
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Activities!A2:H',
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });
  }
}
