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
   * Create connections sheet in _metadata. Used only at Drive connection init.
   */
  static async createConnectionsSheet(accessToken: string, metadataFolderId: string): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.CONNECTIONS_FILE_NAME },
        sheets: [
          { properties: { title: 'Connections', gridProperties: { rowCount: 100000, columnCount: 5 } } },
          { properties: { title: 'Blocked', gridProperties: { rowCount: 10000, columnCount: 1 } } },
          { properties: { title: 'Metadata', gridProperties: { rowCount: 10, columnCount: 2 } } }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create connections sheet: no ID returned');

    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Connections!A1:E1', values: [['Connection ID', 'User DID', 'Status', 'Created At', 'Accepted At']] },
          { range: 'Blocked!A1:A1', values: [['Blocked DID']] },
          { range: 'Metadata!A1:B2', values: [['Identifier', ''], ['UpdatedAt', '']] }
        ]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get connections sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getOrCreateConnectionsSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.CONNECTIONS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error(`${this.CONNECTIONS_FILE_NAME} not found in _metadata. Ensure Drive is initialized (connect and initialize in dashboard).`);
  }

  /**
   * Get blocked DIDs from Blocked sheet
   */
  static async getBlocked(accessToken: string, spreadsheetId: string): Promise<string[]> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Blocked!A2:A' });
      const rows = res.data.values || [];
      return rows.map(r => (r[0] || '').trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Set blocked DIDs in Blocked sheet
   */
  static async setBlocked(accessToken: string, spreadsheetId: string, blocked: string[]): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Blocked!A2:A' });
    if (blocked.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Blocked!A2',
        valueInputOption: 'RAW',
        requestBody: { values: blocked.map(d => [d]) }
      });
    }
  }

  /**
   * Get Metadata (identifier, updatedAt) from Metadata sheet
   */
  static async getMetadata(accessToken: string, spreadsheetId: string): Promise<{ identifier: string; updatedAt: string }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Metadata!B1:B2' });
      const rows = res.data.values || [];
      return { identifier: rows[0]?.[0] || '', updatedAt: rows[1]?.[0] || new Date().toISOString() };
    } catch {
      return { identifier: '', updatedAt: new Date().toISOString() };
    }
  }

  /**
   * Set Metadata (identifier, updatedAt) in Metadata sheet
   */
  static async setMetadata(accessToken: string, spreadsheetId: string, identifier: string, updatedAt: string): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Metadata!B1:B2',
      valueInputOption: 'RAW',
      requestBody: { values: [[identifier], [updatedAt]] }
    });
  }

  /**
   * Overwrite all connections in the Connections sheet
   */
  static async setAllConnections(accessToken: string, spreadsheetId: string, connections: Connection[]): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Connections!A2:E' });
    if (connections.length) {
      const rows = connections.map(c => [c.connectionId, c.userDid, c.status, c.createdAt, c.acceptedAt || '']);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Connections!A2:E',
        valueInputOption: 'RAW',
        requestBody: { values: rows }
      });
    }
  }

  /**
   * Get connections file (identifier, updatedAt, connections, blocked) from Sheets.
   */
  static async getConnectionsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<{ identifier: string; updatedAt: string; connections: Connection[]; blocked: string[] } | null> {
    try {
      const spreadsheetId = await this.getOrCreateConnectionsSheet(accessToken, metadataFolderId);
      const [connRes, blocked, meta] = await Promise.all([
        this.getConnections(accessToken, spreadsheetId, { limit: 999999, offset: 0 }),
        this.getBlocked(accessToken, spreadsheetId),
        this.getMetadata(accessToken, spreadsheetId)
      ]);
      return {
        identifier: meta.identifier,
        updatedAt: meta.updatedAt,
        connections: connRes.connections,
        blocked
      };
    } catch (e) {
      console.error('ConnectionsSheetsService.getConnectionsFile:', e);
      return null;
    }
  }

  /**
   * Update connections file (full replace for connections and blocked).
   * setBlocked/setMetadata are best-effort on legacy spreadsheets that lack those sheets.
   */
  static async updateConnectionsFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    data: { identifier: string; updatedAt: string; connections: Connection[]; blocked: string[] }
  ): Promise<void> {
    const spreadsheetId = await this.getOrCreateConnectionsSheet(accessToken, metadataFolderId);
    await this.setAllConnections(accessToken, spreadsheetId, data.connections);
    try {
      await this.setBlocked(accessToken, spreadsheetId, data.blocked);
    } catch (e) {
      console.warn('ConnectionsSheetsService.updateConnectionsFile setBlocked (legacy sheet?):', e);
    }
    try {
      await this.setMetadata(accessToken, spreadsheetId, identifier, data.updatedAt);
    } catch (e) {
      console.warn('ConnectionsSheetsService.updateConnectionsFile setMetadata (legacy sheet?):', e);
    }
  }

  /**
   * Create followers sheet in _metadata. Used only at Drive connection init.
   */
  static async createFollowersSheet(accessToken: string, metadataFolderId: string): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.FOLLOWERS_FILE_NAME },
        sheets: [{ properties: { title: 'Followers', gridProperties: { rowCount: 100000, columnCount: 3 } } }]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create followers sheet: no ID returned');

    await drive.files.update({
      fileId: spreadsheetId,
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Followers!A1:C1',
      valueInputOption: 'RAW',
      requestBody: { values: [['Follower DID', 'Followed At', 'Feed ID']] }
    });

    return spreadsheetId;
  }

  /**
   * Get followers sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getOrCreateFollowersSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.FOLLOWERS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error(`${this.FOLLOWERS_FILE_NAME} not found in _metadata. Ensure Drive is initialized (connect and initialize in dashboard).`);
  }

  /**
   * Create following sheet in _metadata. Used only at Drive connection init.
   */
  static async createFollowingSheet(accessToken: string, metadataFolderId: string): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.FOLLOWING_FILE_NAME },
        sheets: [{ properties: { title: 'Following', gridProperties: { rowCount: 100000, columnCount: 3 } } }]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create following sheet: no ID returned');

    await drive.files.update({
      fileId: spreadsheetId,
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Following!A1:C1',
      valueInputOption: 'RAW',
      requestBody: { values: [['Target Type', 'Target ID', 'Followed At']] }
    });

    return spreadsheetId;
  }

  /**
   * Get following sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getOrCreateFollowingSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.FOLLOWING_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error(`${this.FOLLOWING_FILE_NAME} not found in _metadata. Ensure Drive is initialized (connect and initialize in dashboard).`);
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
