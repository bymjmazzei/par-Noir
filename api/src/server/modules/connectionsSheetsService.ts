/**
 * Connections Sheets Service
 * Manages connections, followers, and following in Google Sheets tables
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';

export interface Connection {
  connectionId: string;
  userDid: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
}

export interface Follower {
  followerDid: string;
  followedAt: string;
  feedId?: string;
}

export interface Following {
  targetType: 'user' | 'feed';
  targetId: string;
  followedAt: string;
}

export class ConnectionsSheetsService {
  private static readonly CONNECTIONS_FILE_NAME = 'connections.xlsx';
  private static readonly FOLLOWERS_FILE_NAME = 'followers.xlsx';
  private static readonly FOLLOWING_FILE_NAME = 'following.xlsx';

  /**
   * Get or create connections sheet
   */
  static async getOrCreateConnectionsSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing connections sheet
    const fileQuery = `name='${this.CONNECTIONS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Create new connections sheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: this.CONNECTIONS_FILE_NAME.replace('.xlsx', '')
        },
        sheets: [
          {
            properties: {
              title: 'Connections',
              gridProperties: {
                rowCount: 100000,
                columnCount: 5
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create connections sheet: no ID returned');
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
      range: 'Connections!A1:E1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Connection ID', 'User DID', 'Status', 'Created At', 'Accepted At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get or create followers sheet (paid feeds only)
   */
  static async getOrCreateFollowersSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing followers sheet
    const fileQuery = `name='${this.FOLLOWERS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Create new followers sheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: this.FOLLOWERS_FILE_NAME.replace('.xlsx', '')
        },
        sheets: [
          {
            properties: {
              title: 'Followers',
              gridProperties: {
                rowCount: 100000,
                columnCount: 3
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create followers sheet: no ID returned');
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
      range: 'Followers!A1:C1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Follower DID', 'Followed At', 'Feed ID']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get or create following sheet (all users)
   */
  static async getOrCreateFollowingSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing following sheet
    const fileQuery = `name='${this.FOLLOWING_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Create new following sheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: this.FOLLOWING_FILE_NAME.replace('.xlsx', '')
        },
        sheets: [
          {
            properties: {
              title: 'Following',
              gridProperties: {
                rowCount: 100000,
                columnCount: 3
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create following sheet: no ID returned');
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
      range: 'Following!A1:C1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Target Type', 'Target ID', 'Followed At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Add connection to connections sheet
   */
  static async addConnection(
    accessToken: string,
    spreadsheetId: string,
    connection: Connection
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Connections!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          connection.connectionId,
          connection.userDid,
          connection.status,
          connection.createdAt,
          connection.acceptedAt || ''
        ]]
      }
    });
  }

  /**
   * Get connections from connections sheet
   */
  static async getConnections(
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: Connection['status'];
    }
  ): Promise<{ connections: Connection[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all connections (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Connections!A2:E'
    });

    const rows = response.data.values || [];
    let connections: Connection[] = rows.map(row => ({
      connectionId: row[0] || '',
      userDid: row[1] || '',
      status: (row[2] || 'pending_sent') as Connection['status'],
      createdAt: row[3] || new Date().toISOString(),
      acceptedAt: row[4] || undefined
    }));

    // Filter by status if specified
    if (options?.status) {
      connections = connections.filter(c => c.status === options.status);
    }

    const total = connections.length;

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginatedConnections = connections.slice(offset, offset + limit);

    return {
      connections: paginatedConnections,
      total
    };
  }

  /**
   * Update connection status in connections sheet
   */
  static async updateConnectionStatus(
    accessToken: string,
    spreadsheetId: string,
    connectionId: string,
    status: Connection['status'],
    acceptedAt?: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all connections to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Connections!A2:E'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === connectionId);

    if (rowIndex === -1) {
      throw new Error('Connection not found');
    }

    // Update status and acceptedAt (rowIndex + 2 because of header and 0-based index)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Connections!C${rowIndex + 2}:E${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[status, acceptedAt || '']]
      }
    });
  }

  /**
   * Remove connection from connections sheet
   */
  static async removeConnection(
    accessToken: string,
    spreadsheetId: string,
    connectionId: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all connections to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Connections!A2:E'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === connectionId);

    if (rowIndex === -1) {
      throw new Error('Connection not found');
    }

    // Delete row (rowIndex + 2 because of header and 0-based index)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: rowIndex + 1, // 0-based, skip header
                endIndex: rowIndex + 2
              }
            }
          }
        ]
      }
    });
  }

  /**
   * Add follower to followers sheet
   */
  static async addFollower(
    accessToken: string,
    spreadsheetId: string,
    follower: Follower
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Followers!A:C',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          follower.followerDid,
          follower.followedAt,
          follower.feedId || ''
        ]]
      }
    });
  }

  /**
   * Get followers from followers sheet
   */
  static async getFollowers(
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ followers: Follower[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all followers (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Followers!A2:C'
    });

    const rows = response.data.values || [];
    const followers: Follower[] = rows.map(row => ({
      followerDid: row[0] || '',
      followedAt: row[1] || new Date().toISOString(),
      feedId: row[2] || undefined
    }));

    const total = followers.length;

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginatedFollowers = followers.slice(offset, offset + limit);

    return {
      followers: paginatedFollowers,
      total
    };
  }

  /**
   * Remove follower from followers sheet
   */
  static async removeFollower(
    accessToken: string,
    spreadsheetId: string,
    followerDid: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all followers to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Followers!A2:C'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === followerDid);

    if (rowIndex === -1) {
      throw new Error('Follower not found');
    }

    // Delete row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: rowIndex + 1,
                endIndex: rowIndex + 2
              }
            }
          }
        ]
      }
    });
  }

  /**
   * Add following entry to following sheet
   */
  static async addFollowing(
    accessToken: string,
    spreadsheetId: string,
    following: Following
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Following!A:C',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          following.targetType,
          following.targetId,
          following.followedAt
        ]]
      }
    });
  }

  /**
   * Get following entries from following sheet
   */
  static async getFollowing(
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
      targetType?: 'user' | 'feed';
    }
  ): Promise<{ following: Following[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all following (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Following!A2:C'
    });

    const rows = response.data.values || [];
    let following: Following[] = rows.map(row => ({
      targetType: (row[0] || 'user') as 'user' | 'feed',
      targetId: row[1] || '',
      followedAt: row[2] || new Date().toISOString()
    }));

    // Filter by target type if specified
    if (options?.targetType) {
      following = following.filter(f => f.targetType === options.targetType);
    }

    const total = following.length;

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginatedFollowing = following.slice(offset, offset + limit);

    return {
      following: paginatedFollowing,
      total
    };
  }

  /**
   * Remove following entry from following sheet
   */
  static async removeFollowing(
    accessToken: string,
    spreadsheetId: string,
    targetType: 'user' | 'feed',
    targetId: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all following to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Following!A2:C'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === targetType && row[1] === targetId);

    if (rowIndex === -1) {
      throw new Error('Following entry not found');
    }

    // Delete row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: rowIndex + 1,
                endIndex: rowIndex + 2
              }
            }
          }
        ]
      }
    });
  }
}
