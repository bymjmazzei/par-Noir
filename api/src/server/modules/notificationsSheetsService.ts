/**
 * Notifications Sheets Service
 * Manages notifications in Google Sheets table
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';

export interface Notification {
  notification_id: string;
  user_did: string;
  type: 'feed_new_post' | 'feed_new_comment' | 'feed_new_like' | 'feed_new_subscriber' | 'comment_reply' | 'mention' | 'connection_request' | 'connection_accepted' | 'repost' | 'follow' | 'new_message';
  title: string;
  message: string;
  data?: {
    feed_id?: string;
    file_id?: string;
    comment_id?: string;
    user_did?: string;
    connection_id?: string;
    message_id?: string;
    thread_id?: string;
    [key: string]: any;
  };
  read: boolean;
  created_at: string;
}

export class NotificationsSheetsService {
  private static readonly NOTIFICATIONS_FILE_NAME = 'notifications.xlsx';

  /**
   * Create notifications sheet in _metadata. Used only at Drive connection init.
   */
  static async createNotificationsSheet(accessToken: string, metadataFolderId: string): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.NOTIFICATIONS_FILE_NAME },
        sheets: [
          {
            properties: {
              title: 'Notifications',
              gridProperties: { rowCount: 100000, columnCount: 8 }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create notifications sheet: no ID returned');

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
      range: 'Notifications!A1:H1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Notification ID', 'User DID', 'Type', 'Title', 'Message', 'Data', 'Read Status', 'Created At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get notifications sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getOrCreateNotificationsSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.NOTIFICATIONS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error(`${this.NOTIFICATIONS_FILE_NAME} not found in _metadata. Ensure Drive is initialized (connect and initialize in dashboard).`);
  }

  /**
   * Append notification to notifications sheet
   */
  static async appendNotification(
    accessToken: string,
    spreadsheetId: string,
    notification: Notification
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Notifications!A:H',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          notification.notification_id,
          notification.user_did,
          notification.type,
          notification.title,
          notification.message,
          JSON.stringify(notification.data || {}),
          notification.read ? 'TRUE' : 'FALSE',
          notification.created_at
        ]]
      }
    });
  }

  /**
   * Get notifications from notifications sheet
   */
  static async getNotifications(
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: Notification['type'];
    }
  ): Promise<{ notifications: Notification[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all notifications (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Notifications!A2:H'
    });

    const rows = response.data.values || [];
    let notifications: Notification[] = rows.map(row => {
      let data = {};
      try {
        if (row[5]) {
          data = JSON.parse(row[5]);
        }
      } catch (e) {
        // If data is not valid JSON, leave as empty object
      }

      return {
        notification_id: row[0] || '',
        user_did: row[1] || '',
        type: (row[2] || 'new_message') as Notification['type'],
        title: row[3] || '',
        message: row[4] || '',
        data,
        read: row[6] === 'TRUE' || row[6] === true || row[6] === 'true',
        created_at: row[7] || new Date().toISOString()
      };
    });

    // Filter by read status if specified
    if (options?.unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    // Filter by type if specified
    if (options?.type) {
      notifications = notifications.filter(n => n.type === options.type);
    }

    // Sort by created_at descending (most recent first)
    notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = notifications.length;

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginatedNotifications = notifications.slice(offset, offset + limit);

    return {
      notifications: paginatedNotifications,
      total
    };
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(
    accessToken: string,
    spreadsheetId: string,
    notificationId: string
  ): Promise<boolean> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all notifications to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Notifications!A2:H'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === notificationId);

    if (rowIndex === -1) {
      return false;
    }

    // Check if already read
    const isRead = rows[rowIndex][6] === 'TRUE' || rows[rowIndex][6] === true || rows[rowIndex][6] === 'true';
    if (isRead) {
      return false;
    }

    // Update read status (rowIndex + 2 because of header and 0-based index)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Notifications!G${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['TRUE']]
      }
    });

    return true;
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(
    accessToken: string,
    spreadsheetId: string,
    userDid: string
  ): Promise<number> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all notifications
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Notifications!A2:H'
    });

    const rows = response.data.values || [];
    let markedCount = 0;
    const updates: Array<{ range: string; values: string[][] }> = [];

    // Find all unread notifications for this user
    rows.forEach((row, index) => {
      if (row[1] === userDid) {
        const isRead = row[6] === 'TRUE' || row[6] === true || row[6] === 'true';
        if (!isRead) {
          updates.push({
            range: `Notifications!G${index + 2}`,
            values: [['TRUE']]
          });
          markedCount++;
        }
      }
    });

    // Batch update all read statuses
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates
        }
      });
    }

    return markedCount;
  }

  /**
   * Get metadata (updatedAt, preferences) from Metadata sheet. Returns null if sheet does not exist.
   */
  static async getMetadata(
    accessToken: string,
    spreadsheetId: string
  ): Promise<{ updatedAt: string; preferences: Record<string, unknown> | null; identifier: string } | null> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Metadata!A1:C1'
      });
      const row = res.data.values?.[0] || [];
      const updatedAt = typeof row[0] === 'string' ? row[0] : new Date().toISOString();
      let preferences: Record<string, unknown> | null = null;
      if (row[1]) {
        try {
          preferences = JSON.parse(String(row[1])) as Record<string, unknown>;
        } catch {
          // ignore
        }
      }
      const identifier = typeof row[2] === 'string' ? row[2] : '';
      return { updatedAt, preferences, identifier };
    } catch {
      return null;
    }
  }

  /**
   * Set metadata (updatedAt, preferences, identifier) in Metadata sheet. Creates sheet if it does not exist.
   */
  static async setMetadata(
    accessToken: string,
    spreadsheetId: string,
    updatedAt: string,
    preferences: Record<string, unknown> | null,
    identifier: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Metadata!A1' });
    } catch {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Metadata' } } }]
        }
      });
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Metadata!A1:C1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[updatedAt, preferences ? JSON.stringify(preferences) : '', identifier]]
      }
    });
  }

  /**
   * Replace all notification rows in the Notifications sheet (keeps header).
   */
  static async setAllNotifications(
    accessToken: string,
    spreadsheetId: string,
    notifications: Notification[]
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Notifications!A2:H'
    });
    if (notifications.length > 0) {
      const rows = notifications.map(n => [
        n.notification_id,
        n.user_did,
        n.type,
        n.title,
        n.message,
        JSON.stringify(n.data || {}),
        n.read ? 'TRUE' : 'FALSE',
        n.created_at
      ]);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Notifications!A2:H',
        valueInputOption: 'RAW',
        requestBody: { values: rows }
      });
    }
  }
}
