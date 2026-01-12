/**
 * Activity Ledger Sheets Service
 * Manages activity ledger in Google Sheets table
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';

export interface ActivityEntry {
  activity_id: string;
  user_did: string;
  activity_type: string;
  target_type?: string;
  target_id?: string;
  actor_did?: string;
  metadata?: any;
  created_at: string;
}

export class ActivityLedgerSheetsService {
  private static readonly ACTIVITY_LEDGER_FILE_NAME = 'activity_ledger.xlsx';

  /**
   * Get or create activity ledger sheet
   */
  static async getOrCreateActivityLedgerSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing activity ledger sheet
    const fileQuery = `name='${this.ACTIVITY_LEDGER_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Create new activity ledger sheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: this.ACTIVITY_LEDGER_FILE_NAME.replace('.xlsx', '')
        },
        sheets: [
          {
            properties: {
              title: 'Activities',
              gridProperties: {
                rowCount: 100000,
                columnCount: 8
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create activity ledger sheet: no ID returned');
    }

    // Move to metadata folder
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    // Set up headers
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
   * Append activity to activity ledger sheet
   */
  static async appendActivity(
    accessToken: string,
    spreadsheetId: string,
    activity: ActivityEntry
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Activities!A:H',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          activity.activity_id,
          activity.user_did,
          activity.activity_type,
          activity.target_type || '',
          activity.target_id || '',
          activity.actor_did || '',
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
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
      activityType?: string;
      userDid?: string;
    }
  ): Promise<{ activities: ActivityEntry[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
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
        user_did: row[1] || '',
        activity_type: row[2] || '',
        target_type: row[3] || undefined,
        target_id: row[4] || undefined,
        actor_did: row[5] || undefined,
        metadata,
        created_at: row[7] || new Date().toISOString()
      };
    });

    // Filter by activity type if specified
    if (options?.activityType) {
      activities = activities.filter(a => a.activity_type === options.activityType);
    }

    // Filter by user DID if specified
    if (options?.userDid) {
      activities = activities.filter(a => a.user_did === options.userDid);
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
    accessToken: string,
    spreadsheetId: string,
    activityId: string
  ): Promise<ActivityEntry | null> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
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
      user_did: row[1] || '',
      activity_type: row[2] || '',
      target_type: row[3] || undefined,
      target_id: row[4] || undefined,
      actor_did: row[5] || undefined,
      metadata,
      created_at: row[7] || new Date().toISOString()
    };
  }
}
