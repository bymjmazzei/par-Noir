/**
 * Connections Sheets Service
 * Manages connections, followers, and following in Google Sheets tables
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import * as SocialPortable from './storage/socialGraphPortableService';

export interface Connection {
  connectionId: string;
  userPnIdentifier: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
  /** @deprecated Legacy column F — use peerMlKemPublicKey */
  sharedSecret?: string;
  /** Requester's ML-KEM public key (column F on pending_received rows). */
  peerMlKemPublicKey?: string;
  kemCiphertext?: string; // ML-KEM-768 encapsulation (E2E)
}

/** ML-KEM-768 raw public key is 1184 bytes; base64 is ~1580 chars. */
function parsePeerMlKemPublicKey(columnF: unknown): string | undefined {
  if (typeof columnF !== 'string' || !columnF.trim()) return undefined;
  try {
    const buf = Buffer.from(columnF.replace(/\s/g, ''), 'base64');
    if (buf.length >= 1000) return columnF;
  } catch {
    /* legacy shared-secret values are not valid base64 ML-KEM */
  }
  return undefined;
}

function connectionFromSheetRow(row: string[]): Connection {
  const connectionId = row[0];
  const userPnIdentifier = row[1];
  const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-')
    ? userPnIdentifier
    : `pn-${userPnIdentifier}`;
  const peerMlKemPublicKey = parsePeerMlKemPublicKey(row[5]);
  return {
    connectionId,
    userPnIdentifier: normalizedUserPnIdentifier,
    status: (row[2] || 'pending_sent') as Connection['status'],
    createdAt: row[3] || new Date().toISOString(),
    acceptedAt: row[4] || undefined,
    peerMlKemPublicKey,
    sharedSecret: peerMlKemPublicKey ? undefined : row[5] || undefined,
    kemCiphertext: row[6] || undefined,
  };
}

export interface Follower {
  followerPnIdentifier: string;
  followedAt: string;
  feedId?: string;
}

export interface Following {
  targetType: 'user' | 'feed';
  targetPnIdentifier: string; // pn-identifier when targetType is 'user', feed ID when 'feed'
  followedAt: string;
}

/** Max connections returned in a single request; clients should paginate (limit/offset) for more. */
const MAX_LIST_PAGE_SIZE = 500;

export class ConnectionsSheetsService {
  private static readonly CONNECTIONS_FILE_NAME = 'connections.xlsx';
  private static readonly FOLLOWERS_FILE_NAME = 'followers.xlsx';
  private static readonly FOLLOWING_FILE_NAME = 'following.xlsx';

  /**
   * Create connections sheet in _metadata. Used only at Drive connection init.
   */
  static async createConnectionsSheet(
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
        properties: { title: this.CONNECTIONS_FILE_NAME },
        sheets: [
          { properties: { title: 'Connections', gridProperties: { rowCount: 100000, columnCount: 6 } } },
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
          {
            range: 'Connections!A1:G1',
            values: [
              [
                'Connection ID',
                'User DID',
                'Status',
                'Created At',
                'Accepted At',
                'Peer ML-KEM Public Key',
                'KEM Ciphertext',
              ],
            ],
          },
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
  static async getConnectionsSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
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

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Get blocked DIDs from Blocked sheet
   */
  static async getBlocked(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
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
  static async setBlocked(
    token: GoogleDriveToken,
    spreadsheetId: string,
    blocked: string[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
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
  static async getMetadata(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<{ identifier: string; updatedAt: string }> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Metadata!B1:B2' });
      const rows = res.data.values || [];
      const identifier = rows[0]?.[0] || '';
      // Normalize identifier when reading (handles legacy data)
      const normalizedIdentifier = identifier.startsWith('pn-') ? identifier : (identifier ? `pn-${identifier}` : '');
      return { identifier: normalizedIdentifier, updatedAt: rows[1]?.[0] || new Date().toISOString() };
    } catch {
      return { identifier: '', updatedAt: new Date().toISOString() };
    }
  }

  /**
   * Set Metadata (identifier, updatedAt) in Metadata sheet
   */
  static async setMetadata(
    token: GoogleDriveToken,
    spreadsheetId: string,
    identifier: string,
    updatedAt: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    // Normalize identifier before writing
    const normalizedIdentifier = identifier.startsWith('pn-') ? identifier : `pn-${identifier}`;
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Metadata!B1:B2',
      valueInputOption: 'RAW',
      requestBody: { values: [[normalizedIdentifier], [updatedAt]] }
    });
  }

  /**
   * Overwrite all connections in the Connections sheet
   */
  static async setAllConnections(
    token: GoogleDriveToken,
    spreadsheetId: string,
    connections: Connection[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Connections!A2:G' });
    if (connections.length) {
      // Normalize userPnIdentifier in all connections before writing (handles legacy data)
      const rows = connections.map(c => {
        const normalizedUserPnIdentifier = c.userPnIdentifier.startsWith('pn-') ? c.userPnIdentifier : `pn-${c.userPnIdentifier}`;
        return [
          c.connectionId,
          normalizedUserPnIdentifier,
          c.status,
          c.createdAt,
          c.acceptedAt || '',
          c.peerMlKemPublicKey || '',
          c.kemCiphertext || '',
        ];
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Connections!A2:G',
        valueInputOption: 'RAW',
        requestBody: { values: rows }
      });
    }
  }

  /**
   * Get connections file (identifier, updatedAt, connections, blocked) from Sheets.
   */
  static async getConnectionsFile(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<{ identifier: string; updatedAt: string; connections: Connection[]; blocked: string[] } | null> {
    try {
      const spreadsheetId = await this.getConnectionsSheet(token, metadataFolderId, userPnIdentifier, accountId);
      const [connRes, blocked, meta] = await Promise.all([
        this.getConnections(token, spreadsheetId, userPnIdentifier, accountId, { limit: MAX_LIST_PAGE_SIZE, offset: 0 }),
        this.getBlocked(token, spreadsheetId, userPnIdentifier, accountId),
        this.getMetadata(token, spreadsheetId, userPnIdentifier, accountId)
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
    token: GoogleDriveToken,
    metadataFolderId: string,
    identifier: string,
    data: { identifier: string; updatedAt: string; connections: Connection[]; blocked: string[] },
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const spreadsheetId = await this.getConnectionsSheet(token, metadataFolderId, userPnIdentifier, accountId);
    await this.setAllConnections(token, spreadsheetId, data.connections, userPnIdentifier, accountId);
    try {
      await this.setBlocked(token, spreadsheetId, data.blocked, userPnIdentifier, accountId);
    } catch (e) {
      console.warn('ConnectionsSheetsService.updateConnectionsFile setBlocked (legacy sheet?):', e);
    }
    try {
      await this.setMetadata(token, spreadsheetId, identifier, data.updatedAt, userPnIdentifier, accountId);
    } catch (e) {
      console.warn('ConnectionsSheetsService.updateConnectionsFile setMetadata (legacy sheet?):', e);
    }
  }

  /**
   * Create followers sheet in _metadata. Used only at Drive connection init.
   */
  static async createFollowersSheet(
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
  static async getFollowersSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return 'pn-portable-followers';
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
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

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Create following sheet in _metadata. Used only at Drive connection init.
   */
  static async createFollowingSheet(
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
  static async getFollowingSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return 'pn-portable-following';
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
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

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Add connection to connections sheet
   */
  static async addConnection(
    token: GoogleDriveToken,
    spreadsheetId: string,
    connection: Connection,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    // Validate required fields
    if (!connection.connectionId || !connection.userPnIdentifier) {
      throw new Error(`Invalid connection: missing connectionId or userPnIdentifier`);
    }
    
    // Normalize userPnIdentifier before writing (handles legacy data)
    const normalizedUserPnIdentifier = connection.userPnIdentifier.startsWith('pn-') ? connection.userPnIdentifier : `pn-${connection.userPnIdentifier}`;
    
    // Ensure normalized identifier is valid
    if (normalizedUserPnIdentifier === 'pn-' || normalizedUserPnIdentifier.length <= 3) {
      throw new Error(`Invalid userPnIdentifier: ${connection.userPnIdentifier} (normalized to ${normalizedUserPnIdentifier})`);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Connections!A:G',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          connection.connectionId,
          normalizedUserPnIdentifier,
          connection.status,
          connection.createdAt,
          connection.acceptedAt || '',
          connection.peerMlKemPublicKey || '',
          connection.kemCiphertext || '',
        ]]
      }
    });
  }

  /**
   * Get connections from connections sheet
   */
  static async getConnections(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    options?: {
      limit?: number;
      offset?: number;
      status?: Connection['status'];
    }
  ): Promise<{ connections: Connection[]; total: number }> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all connections (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Connections!A2:G'
    });

    const rows = response.data.values || [];
    let connections: Connection[] = [];
    
    for (const row of rows) {
      const connectionId = row[0];
      const userPnIdentifier = row[1];
      
      if (!connectionId || !userPnIdentifier) {
        console.warn('[ConnectionsSheetsService] Skipping invalid connection row:', { connectionId, userPnIdentifier, row });
        continue;
      }
      
      const conn = connectionFromSheetRow(row);
      if (conn.userPnIdentifier === 'pn-' || conn.userPnIdentifier.length <= 3) {
        console.warn('[ConnectionsSheetsService] Skipping connection with invalid userPnIdentifier:', { connectionId, userPnIdentifier });
        continue;
      }
      
      connections.push(conn);
    }

    // Filter by status if specified
    if (options?.status) {
      connections = connections.filter(c => c.status === options.status);
    }

    const total = connections.length;

    // Apply pagination (cap limit to avoid unbounded responses)
    const limit = Math.min(options?.limit ?? 50, MAX_LIST_PAGE_SIZE);
    const offset = options?.offset || 0;
    const paginatedConnections = connections.slice(offset, offset + limit);

    return {
      connections: paginatedConnections,
      total
    };
  }

  /**
   * Get all connections as a map keyed by connectionId.
   * Single sheet read; use when looking up multiple connections (e.g. inbox enrichment).
   */
  static async getConnectionsMap(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<Map<string, Connection>> {
    const { connections } = await this.getConnections(token, spreadsheetId, userPnIdentifier, accountId, {
      limit: MAX_LIST_PAGE_SIZE,
      offset: 0
    });
    const map = new Map<string, Connection>();
    for (const c of connections) {
      map.set(c.connectionId, c);
    }
    return map;
  }

  /**
   * Get a specific connection by connectionId
   * More efficient than getConnections when you only need one connection
   */
  static async getConnectionById(
    token: GoogleDriveToken,
    spreadsheetId: string,
    connectionId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<Connection | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all connections (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Connections!A2:G'
    });

    const rows = response.data.values || [];
    
    for (const row of rows) {
      const rowConnectionId = row[0];
      if (rowConnectionId === connectionId) {
        const userPnIdentifier = row[1];
        if (!userPnIdentifier) {
          return null;
        }
        const conn = connectionFromSheetRow(row);
        if (conn.userPnIdentifier === 'pn-' || conn.userPnIdentifier.length <= 3) {
          return null;
        }
        return conn;
      }
    }
    
    return null;
  }

  /**
   * Update connection status in connections sheet
   */
  static async updateConnectionStatus(
    token: GoogleDriveToken,
    spreadsheetId: string,
    connectionId: string,
    status: Connection['status'],
    userPnIdentifier: string,
    accountId: string | undefined,
    acceptedAt?: string,
    sharedSecret?: string,
    kemCiphertext?: string
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all connections to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Connections!A2:G'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === connectionId);

    if (rowIndex === -1) {
      throw new Error('Connection not found');
    }

    // Update status (C), acceptedAt (E), and optionally sharedSecret (F)
    // NOTE: Column D is Created At and should NEVER be overwritten
    // Columns: A=ConnectionID, B=UserDID, C=Status, D=CreatedAt, E=AcceptedAt, F=SharedSecret
    const actualRow = rowIndex + 2; // +2 because of header and 0-based index
    
    // Update status (column C)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Connections!C${actualRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[status]]
      }
    });
    
    // Update acceptedAt (column E) if provided
    if (acceptedAt) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Connections!E${actualRow}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[acceptedAt]]
        }
      });
    }
    
    if (sharedSecret !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Connections!F${actualRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[sharedSecret]] }
      });
    }

    if (kemCiphertext !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Connections!G${actualRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[kemCiphertext]] }
      });
    }
  }

  /**
   * Remove connection from connections sheet
   */
  static async removeConnection(
    token: GoogleDriveToken,
    spreadsheetId: string,
    connectionId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all connections to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Connections!A2:G'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === connectionId);

    if (rowIndex === -1) {
      throw new Error('Connection not found');
    }

    // Get the actual sheet ID for the "Connections" sheet
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const connectionsSheet = spreadsheet.data.sheets?.find(
      sheet => sheet.properties?.title === 'Connections'
    );

    if (!connectionsSheet?.properties?.sheetId) {
      throw new Error('Connections sheet not found in spreadsheet');
    }

    const actualSheetId = connectionsSheet.properties.sheetId;

    // Delete row (rowIndex + 1 because we're using 0-based index and skipping header)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: actualSheetId,
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
    token: GoogleDriveToken,
    spreadsheetId: string,
    follower: Follower,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await SocialPortable.addFollowerPortable(userPnIdentifier, follower, accountId);
      return;
    }
    if (!follower.followerPnIdentifier) {
      throw new Error('Follower missing followerPnIdentifier');
    }
    
    // Normalize followerPnIdentifier before writing (handles legacy data)
    const normalizedFollowerPnIdentifier = follower.followerPnIdentifier.startsWith('pn-') ? follower.followerPnIdentifier : `pn-${follower.followerPnIdentifier}`;
    
    // Ensure normalized identifier is valid
    if (normalizedFollowerPnIdentifier === 'pn-' || normalizedFollowerPnIdentifier.length <= 3) {
      throw new Error(`Invalid followerPnIdentifier: ${follower.followerPnIdentifier} (normalized to ${normalizedFollowerPnIdentifier})`);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Followers!A:C',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          normalizedFollowerPnIdentifier,
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
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ followers: Follower[]; total: number }> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return SocialPortable.getFollowersPortable(userPnIdentifier, accountId, options);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all followers (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Followers!A2:C'
    });

    const rows = response.data.values || [];
    const followers: Follower[] = [];
    
    for (const row of rows) {
      const followerPnIdentifier = row[0];
      // Skip invalid rows (missing required field)
      if (!followerPnIdentifier) {
        console.warn('[ConnectionsSheetsService] Skipping invalid follower row:', row);
        continue;
      }
      // Normalize followerPnIdentifier when reading from sheet (handles legacy data)
      const normalizedFollowerPnIdentifier = followerPnIdentifier.startsWith('pn-') ? followerPnIdentifier : (followerPnIdentifier ? `pn-${followerPnIdentifier}` : '');
      
      // Ensure normalized identifier is valid
      if (normalizedFollowerPnIdentifier === 'pn-' || normalizedFollowerPnIdentifier.length <= 3) {
        console.warn('[ConnectionsSheetsService] Skipping follower with invalid followerPnIdentifier:', { row, normalizedFollowerPnIdentifier });
        continue;
      }
      
      followers.push({
        followerPnIdentifier: normalizedFollowerPnIdentifier,
        followedAt: row[1] || new Date().toISOString(),
        feedId: row[2] || undefined
      });
    }

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    followerPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await SocialPortable.removeFollowerPortable(userPnIdentifier, followerPnIdentifier, accountId);
      return;
    }
    const normalizedFollowerPnIdentifier = followerPnIdentifier.startsWith('pn-') ? followerPnIdentifier : `pn-${followerPnIdentifier}`;
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all followers to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Followers!A2:C'
    });

    const rows = response.data.values || [];
    // Normalize each row entry when searching (handles legacy data)
    const rowIndex = rows.findIndex(row => {
      const normalizedRowFollowerPnIdentifier = (row[0] || '').startsWith('pn-') ? row[0] : ((row[0] || '') ? `pn-${row[0]}` : '');
      return normalizedRowFollowerPnIdentifier === normalizedFollowerPnIdentifier;
    });

    if (rowIndex === -1) {
      throw new Error('Follower not found');
    }

    // Get the actual sheet ID for the "Followers" sheet
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const followersSheet = spreadsheet.data.sheets?.find(
      sheet => sheet.properties?.title === 'Followers'
    );

    if (!followersSheet?.properties?.sheetId) {
      throw new Error('Followers sheet not found in spreadsheet');
    }

    const actualSheetId = followersSheet.properties.sheetId;

    // Delete row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: actualSheetId,
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
    token: GoogleDriveToken,
    spreadsheetId: string,
    following: Following,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await SocialPortable.addFollowingPortable(userPnIdentifier, following, accountId);
      return;
    }
    if (!following.targetPnIdentifier) {
      throw new Error('Following missing targetPnIdentifier');
    }
    
    // Normalize targetPnIdentifier before writing (only if it's a user, not a feed)
    const normalizedTargetPnIdentifier = following.targetType === 'user' && following.targetPnIdentifier && !following.targetPnIdentifier.startsWith('pn-')
      ? `pn-${following.targetPnIdentifier}`
      : following.targetPnIdentifier;
    
    // For users, ensure normalized identifier is valid
    if (following.targetType === 'user' && (normalizedTargetPnIdentifier === 'pn-' || normalizedTargetPnIdentifier.length <= 3)) {
      throw new Error(`Invalid targetPnIdentifier for user: ${following.targetPnIdentifier} (normalized to ${normalizedTargetPnIdentifier})`);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Following!A:C',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          following.targetType,
          normalizedTargetPnIdentifier,
          following.followedAt
        ]]
      }
    });
  }

  /**
   * Get following entries from following sheet
   */
  static async getFollowing(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    options?: {
      limit?: number;
      offset?: number;
      targetType?: 'user' | 'feed';
    }
  ): Promise<{ following: Following[]; total: number }> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return SocialPortable.getFollowingPortable(userPnIdentifier, accountId, options);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Following!A2:C'
    });

    const rows = response.data.values || [];
    let following: Following[] = [];
    
    for (const row of rows) {
      const targetType = (row[0] || 'user') as 'user' | 'feed';
      const targetPnIdentifier = row[1];
      
      // Skip invalid rows (missing required field)
      if (!targetPnIdentifier) {
        console.warn('[ConnectionsSheetsService] Skipping invalid following row:', row);
        continue;
      }
      
      // Normalize targetPnIdentifier when reading from sheet (handles legacy data, only for users)
      const normalizedTargetPnIdentifier = targetType === 'user' && targetPnIdentifier && !targetPnIdentifier.startsWith('pn-')
        ? `pn-${targetPnIdentifier}`
        : targetPnIdentifier;
      
      // For users, ensure normalized identifier is valid
      if (targetType === 'user' && (normalizedTargetPnIdentifier === 'pn-' || normalizedTargetPnIdentifier.length <= 3)) {
        console.warn('[ConnectionsSheetsService] Skipping following with invalid targetPnIdentifier for user:', { row, normalizedTargetPnIdentifier });
        continue;
      }
      
      following.push({
        targetType,
        targetPnIdentifier: normalizedTargetPnIdentifier,
        followedAt: row[2] || new Date().toISOString()
      });
    }

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    targetType: 'user' | 'feed',
    targetPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await SocialPortable.removeFollowingPortable(userPnIdentifier, targetType, targetPnIdentifier, accountId);
      return;
    }
    const normalizedTargetPnIdentifier = targetType === 'user' && targetPnIdentifier && !targetPnIdentifier.startsWith('pn-')
      ? `pn-${targetPnIdentifier}`
      : targetPnIdentifier;
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all following to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Following!A2:C'
    });

    const rows = response.data.values || [];
    // Normalize each row entry when searching (handles legacy data)
    const rowIndex = rows.findIndex(row => {
      const rowTargetType = (row[0] || 'user') as 'user' | 'feed';
      const rowTargetPnIdentifier = row[1] || '';
      const normalizedRowTargetPnIdentifier = rowTargetType === 'user' && rowTargetPnIdentifier && !rowTargetPnIdentifier.startsWith('pn-')
        ? `pn-${rowTargetPnIdentifier}`
        : rowTargetPnIdentifier;
      return rowTargetType === targetType && normalizedRowTargetPnIdentifier === normalizedTargetPnIdentifier;
    });

    if (rowIndex === -1) {
      throw new Error('Following entry not found');
    }

    // Get the actual sheet ID for the "Following" sheet
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const followingSheet = spreadsheet.data.sheets?.find(
      sheet => sheet.properties?.title === 'Following'
    );

    if (!followingSheet?.properties?.sheetId) {
      throw new Error('Following sheet not found in spreadsheet');
    }

    const actualSheetId = followingSheet.properties.sheetId;

    // Delete row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: actualSheetId,
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

  static async setAllFollowers(
    token: GoogleDriveToken,
    spreadsheetId: string,
    followers: Follower[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Followers!A2:C' });
    if (followers.length === 0) return;
    const rows = followers.map((f) => [
      f.followerPnIdentifier,
      f.followedAt,
      f.feedId || ''
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Followers!A2:C',
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });
  }

  static async setAllFollowing(
    token: GoogleDriveToken,
    spreadsheetId: string,
    following: Following[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Following!A2:C' });
    if (following.length === 0) return;
    const rows = following.map((f) => [
      f.targetType,
      f.targetPnIdentifier,
      f.followedAt
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Following!A2:C',
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });
  }
}
