/**
 * Connections Service
 * Manages user connections stored on Google Drive
 * Each user stores their connections in connections.xlsx (Sheets) in their _metadata folder
 */

import { ConnectionsSheetsService } from './connectionsSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import {
  appendConnectionPortable,
  getConnectionsFilePortable,
  listConnectionsPortable,
  removeConnectionByPeerPortable,
  updateConnectionsFilePortable,
  updateConnectionStatusPortable
} from './storage/connectionsPortableService';

export interface Connection {
  connectionId: string;
  userPnIdentifier: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
  sharedSecret?: string; // Deprecated
  peerMlKemPublicKey?: string;
  kemCiphertext?: string;
}

export interface ConnectionsFile {
  identifier: string;
  updatedAt: string;
  connections: Connection[];
  blocked: string[]; // Array of blocked user pn-identifiers
}

export class ConnectionsService {
  /**
   * Normalize identifier to pn-identifier format (for legacy data compatibility only)
   * New code should expect pn identifier already normalized
   */
  private static normalizeToPnIdentifier(pnIdentifier: string): string {
    // For legacy data compatibility - check if already normalized
    return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  }

  /**
   * Get connections file from user's Google Drive (connections.xlsx / Sheets)
   */
  static async getConnectionsFile(
    token: GoogleDriveToken | string,
    metadataFolderId: string,
    userPnIdentifier?: string,
    accountId?: string
  ): Promise<ConnectionsFile | null> {
    const tokenObj: GoogleDriveToken = typeof token === 'string' ? { access_token: token } : token;
    if (!userPnIdentifier) {
      throw new Error('userPnIdentifier is required');
    }
    const normalized = this.normalizeToPnIdentifier(userPnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      return getConnectionsFilePortable(normalized, accountId);
    }
    return ConnectionsSheetsService.getConnectionsFile(tokenObj, metadataFolderId, normalized, accountId);
  }

  /**
   * Create or update connections file (connections.xlsx / Sheets)
   */
  static async updateConnectionsFile(
    token: GoogleDriveToken | string,
    metadataFolderId: string,
    identifier: string,
    connectionsData: ConnectionsFile,
    userPnIdentifier?: string,
    accountId?: string
  ): Promise<void> {
    const tokenObj: GoogleDriveToken = typeof token === 'string' ? { access_token: token } : token;
    if (!userPnIdentifier) {
      throw new Error('userPnIdentifier is required');
    }
    const normalized = this.normalizeToPnIdentifier(userPnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      await updateConnectionsFilePortable(normalized, connectionsData, accountId);
      return;
    }
    await ConnectionsSheetsService.updateConnectionsFile(
      tokenObj,
      metadataFolderId,
      identifier,
      connectionsData,
      normalized,
      accountId
    );
  }

  /**
   * Generate unique connection ID
   */
  static generateConnectionId(userPnIdentifier1: string, userPnIdentifier2: string): string {
    // Use pn identifiers directly (already normalized)
    // Sort to ensure consistent ID regardless of order
    const sorted = [userPnIdentifier1, userPnIdentifier2].sort();
    const hash = `${sorted[0]}_${sorted[1]}`;
    return `conn_${Buffer.from(hash).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)}`;
  }

  /**
   * Get connection status between two users
   * Returns status from perspective of userPnIdentifier1
   * Uses Google Sheets instead of JSON file
   */
  static async getConnectionStatus(
    user1AccessToken: string,
    user1MetadataFolder: string,
    user1PnIdentifier: string,
    user2PnIdentifier: string,
    accountId?: string
  ): Promise<{ status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked'; connectionId?: string }> {
    // Use pn identifiers directly (already normalized)
    // Build token object from accessToken string (backward compatibility)
    const normalizedUser1 = this.normalizeToPnIdentifier(user1PnIdentifier);
    if (await isPortableStorageProvider(normalizedUser1)) {
      const connectionsFile = await this.getConnectionsFile(
        user1AccessToken,
        user1MetadataFolder,
        normalizedUser1,
        accountId
      );
      if (!connectionsFile) {
        return { status: 'not_connected' };
      }
      const normalizedBlocked = connectionsFile.blocked.map((b) => this.normalizeToPnIdentifier(b));
      if (normalizedBlocked.includes(user2PnIdentifier)) {
        return { status: 'blocked' };
      }
      const connection = connectionsFile.connections.find((c) => {
        const peer = c.userPnIdentifier.startsWith('pn-')
          ? c.userPnIdentifier
          : this.normalizeToPnIdentifier(c.userPnIdentifier);
        return peer === user2PnIdentifier;
      });
      if (!connection) {
        return { status: 'not_connected' };
      }
      if (connection.status === 'blocked') {
        return { status: 'blocked', connectionId: connection.connectionId };
      }
      return {
        status: connection.status === 'accepted' ? 'connected' : connection.status,
        connectionId: connection.connectionId
      };
    }

    const token: GoogleDriveToken = { access_token: user1AccessToken };
    try {
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        user1MetadataFolder,
        user1PnIdentifier,
        accountId
      );

      // Get all connections
      const result = await ConnectionsSheetsService.getConnections(
        token,
        spreadsheetId,
        user1PnIdentifier,
        accountId
      );

      // Find connection with user2 (normalize when comparing - handles legacy data)
      const connection = result.connections.find(c => {
        const normalizedCUserPnIdentifier = c.userPnIdentifier.startsWith('pn-') ? c.userPnIdentifier : this.normalizeToPnIdentifier(c.userPnIdentifier);
        return normalizedCUserPnIdentifier === user2PnIdentifier;
      });
      
      if (!connection) {
        return { status: 'not_connected' };
      }

      // Check if blocked (would need separate blocked sheet or column)
      if (connection.status === 'blocked') {
        return { status: 'blocked', connectionId: connection.connectionId };
      }

      return {
        status: connection.status === 'accepted' ? 'connected' : connection.status,
        connectionId: connection.connectionId
      };
    } catch (error) {
      console.error('Error getting connection status from sheets:', error);
      if (isGoogleSheetsRateLimit(error)) {
        throw error;
      }
      const connectionsFile = await this.getConnectionsFile(user1AccessToken, user1MetadataFolder, user1PnIdentifier, accountId);
      if (!connectionsFile) {
        return { status: 'not_connected' };
      }

      // Normalize blocked entries when checking (handles legacy data)
      const normalizedBlocked = connectionsFile.blocked.map(b => this.normalizeToPnIdentifier(b));
      if (normalizedBlocked.includes(user2PnIdentifier)) {
        return { status: 'blocked' };
      }

      // Normalize when comparing connections (handles legacy data)
      const connection = connectionsFile.connections.find(c => {
        const normalizedCUserPnIdentifier = c.userPnIdentifier.startsWith('pn-') ? c.userPnIdentifier : this.normalizeToPnIdentifier(c.userPnIdentifier);
        return normalizedCUserPnIdentifier === user2PnIdentifier;
      });
      if (!connection) {
        return { status: 'not_connected' };
      }

      return {
        status: connection.status === 'accepted' ? 'connected' : connection.status,
        connectionId: connection.connectionId
      };
    }
  }

  /**
   * Send connection request (adds to both users' sheets)
   * Uses Google Sheets instead of JSON file
   */
  static async sendConnectionRequest(
    requesterAccessToken: string,
    requesterMetadataFolder: string,
    requesterPnIdentifier: string,
    recipientAccessToken: string,
    recipientMetadataFolder: string,
    recipientPnIdentifier: string,
    requesterMlKemPublicKey: string,
    requesterAccountId?: string,
    recipientAccountId?: string
  ): Promise<Connection> {
    // Use pn identifiers directly (already normalized)
    // Build token objects from accessToken strings (backward compatibility)
    const requesterToken: GoogleDriveToken = { access_token: requesterAccessToken };
    const recipientToken: GoogleDriveToken = { access_token: recipientAccessToken };
    const connectionId = this.generateConnectionId(requesterPnIdentifier, recipientPnIdentifier);
    const now = new Date().toISOString();

    const requesterPortable = await isPortableStorageProvider(requesterPnIdentifier);
    const recipientPortable = await isPortableStorageProvider(recipientPnIdentifier);

    if (requesterPortable || recipientPortable) {
      if (requesterPortable) {
        await removeConnectionByPeerPortable(
          requesterPnIdentifier,
          recipientPnIdentifier,
          requesterAccountId
        );
        await appendConnectionPortable(
          requesterPnIdentifier,
          {
            connectionId,
            userPnIdentifier: recipientPnIdentifier,
            status: 'pending_sent',
            createdAt: now
          },
          requesterAccountId
        );
      } else {
        const requesterSheetId = await ConnectionsSheetsService.getConnectionsSheet(
          requesterToken,
          requesterMetadataFolder,
          requesterPnIdentifier,
          requesterAccountId
        );
        try {
          const existingRequester = await ConnectionsSheetsService.getConnections(
            requesterToken,
            requesterSheetId,
            requesterPnIdentifier,
            requesterAccountId
          );
          const existingReq = existingRequester.connections.find((c) => {
            const peer = c.userPnIdentifier.startsWith('pn-')
              ? c.userPnIdentifier
              : this.normalizeToPnIdentifier(c.userPnIdentifier);
            return peer === recipientPnIdentifier;
          });
          if (existingReq) {
            await ConnectionsSheetsService.removeConnection(
              requesterToken,
              requesterSheetId,
              existingReq.connectionId,
              requesterPnIdentifier,
              requesterAccountId
            );
          }
        } catch {
          /* ignore */
        }
        await ConnectionsSheetsService.addConnection(
          requesterToken,
          requesterSheetId,
          {
            connectionId,
            userPnIdentifier: recipientPnIdentifier,
            status: 'pending_sent',
            createdAt: now
          },
          requesterPnIdentifier,
          requesterAccountId
        );
      }

      if (recipientPortable) {
        await removeConnectionByPeerPortable(
          recipientPnIdentifier,
          requesterPnIdentifier,
          recipientAccountId
        );
        await appendConnectionPortable(
          recipientPnIdentifier,
          {
            connectionId,
            userPnIdentifier: requesterPnIdentifier,
            status: 'pending_received',
            createdAt: now,
            peerMlKemPublicKey: requesterMlKemPublicKey,
          },
          recipientAccountId
        );
      } else {
        const recipientSheetId = await ConnectionsSheetsService.getConnectionsSheet(
          recipientToken,
          recipientMetadataFolder,
          recipientPnIdentifier,
          recipientAccountId
        );
        try {
          const existingRecipient = await ConnectionsSheetsService.getConnections(
            recipientToken,
            recipientSheetId,
            recipientPnIdentifier,
            recipientAccountId
          );
          const existingRec = existingRecipient.connections.find((c) => {
            const peer = c.userPnIdentifier.startsWith('pn-')
              ? c.userPnIdentifier
              : this.normalizeToPnIdentifier(c.userPnIdentifier);
            return peer === requesterPnIdentifier;
          });
          if (existingRec) {
            await ConnectionsSheetsService.removeConnection(
              recipientToken,
              recipientSheetId,
              existingRec.connectionId,
              recipientPnIdentifier,
              recipientAccountId
            );
          }
        } catch {
          /* ignore */
        }
        await ConnectionsSheetsService.addConnection(
          recipientToken,
          recipientSheetId,
          {
            connectionId,
            userPnIdentifier: requesterPnIdentifier,
            status: 'pending_received',
            createdAt: now,
            peerMlKemPublicKey: requesterMlKemPublicKey,
          },
          recipientPnIdentifier,
          recipientAccountId
        );
      }

      return {
        connectionId,
        userPnIdentifier: recipientPnIdentifier,
        status: 'pending_sent',
        createdAt: now
      };
    }

      const requesterSheetId = await ConnectionsSheetsService.getConnectionsSheet(
        requesterToken,
        requesterMetadataFolder,
        requesterPnIdentifier,
        requesterAccountId
      );

      const recipientSheetId = await ConnectionsSheetsService.getConnectionsSheet(
        recipientToken,
        recipientMetadataFolder,
        recipientPnIdentifier,
        recipientAccountId
      );

      // Remove existing connections if any (by checking if connection exists)
      try {
        const existingRequester = await ConnectionsSheetsService.getConnections(
          requesterToken,
          requesterSheetId,
          requesterPnIdentifier,
          requesterAccountId
        );
        const existingReq = existingRequester.connections.find(c => {
          const normalizedCUserPnIdentifier = c.userPnIdentifier.startsWith('pn-') ? c.userPnIdentifier : this.normalizeToPnIdentifier(c.userPnIdentifier);
          return normalizedCUserPnIdentifier === recipientPnIdentifier;
        });
        if (existingReq) {
          await ConnectionsSheetsService.removeConnection(
            requesterToken,
            requesterSheetId,
            existingReq.connectionId,
            requesterPnIdentifier,
            requesterAccountId
          );
        }
      } catch (error) {
        // Ignore if connection doesn't exist
      }

      try {
        const existingRecipient = await ConnectionsSheetsService.getConnections(
          recipientToken,
          recipientSheetId,
          recipientPnIdentifier,
          recipientAccountId
        );
        const existingRec = existingRecipient.connections.find(c => {
          const normalizedCUserPnIdentifier = c.userPnIdentifier.startsWith('pn-') ? c.userPnIdentifier : this.normalizeToPnIdentifier(c.userPnIdentifier);
          return normalizedCUserPnIdentifier === requesterPnIdentifier;
        });
        if (existingRec) {
          await ConnectionsSheetsService.removeConnection(
            recipientToken,
            recipientSheetId,
            existingRec.connectionId,
            recipientPnIdentifier,
            recipientAccountId
          );
        }
      } catch (error) {
        // Ignore if connection doesn't exist
      }

      // Add connection request to requester's sheet
      await ConnectionsSheetsService.addConnection(
        requesterToken,
        requesterSheetId,
        {
          connectionId,
          userPnIdentifier: recipientPnIdentifier,
          status: 'pending_sent',
          createdAt: now
        },
        requesterPnIdentifier,
        requesterAccountId
      );

      // Add connection request to recipient's sheet
      await ConnectionsSheetsService.addConnection(
        recipientToken,
        recipientSheetId,
        {
          connectionId,
          userPnIdentifier: requesterPnIdentifier,
          status: 'pending_received',
          createdAt: now,
          peerMlKemPublicKey: requesterMlKemPublicKey,
        },
        recipientPnIdentifier,
        recipientAccountId
      );

      return {
        connectionId,
        userPnIdentifier: recipientPnIdentifier,
        status: 'pending_sent',
        createdAt: now
      };
  }

  /**
   * Accept connection request
   * Allows accepting both pending_received (normal case) and pending_sent (mutual request scenario)
   * Uses Google Sheets instead of JSON file
   */
  static async acceptConnectionRequest(
    acceptorAccessToken: string,
    acceptorMetadataFolder: string,
    acceptorPnIdentifier: string,
    connectionId: string,
    kemCiphertext: string,
    accountId?: string
  ): Promise<void> {
    // Build token object from accessToken string (backward compatibility)
    if (await isPortableStorageProvider(acceptorPnIdentifier)) {
      const allConnections = await listConnectionsPortable(acceptorPnIdentifier, accountId);
      const allMatchingConnections = allConnections.filter((c) => c.connectionId === connectionId);
      let connection = allMatchingConnections.find((c) => c.status === 'pending_received');
      if (!connection && allMatchingConnections.length > 0) {
        connection = allMatchingConnections.find((c) => c.status === 'pending_sent');
      }
      if (!connection) {
        const statuses = allMatchingConnections.map((c) => c.status).join(', ');
        throw new Error(
          `Connection request not found or not in acceptable status. Found connections with statuses: ${statuses || 'none'}`
        );
      }
      if (connection.status !== 'pending_received' && connection.status !== 'pending_sent') {
        if (connection.status === 'accepted') {
          if (!connection.kemCiphertext && kemCiphertext) {
            await updateConnectionStatusPortable(
              acceptorPnIdentifier,
              connectionId,
              'accepted',
              accountId,
              connection.acceptedAt || new Date().toISOString(),
              kemCiphertext
            );
          }
          return;
        }
        throw new Error(
          `Connection request is not in acceptable status. Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`
        );
      }
      if (!kemCiphertext || kemCiphertext.trim() === '') {
        throw new Error('kemCiphertext is required to accept a connection (client E2E)');
      }
      await updateConnectionStatusPortable(
        acceptorPnIdentifier,
        connectionId,
        'accepted',
        accountId,
        new Date().toISOString(),
        kemCiphertext
      );
      return;
    }

    const token: GoogleDriveToken = { access_token: acceptorAccessToken };
    const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        acceptorMetadataFolder,
        acceptorPnIdentifier,
        accountId
      );

      const allConnections = await ConnectionsSheetsService.getConnections(
        token,
        spreadsheetId,
        acceptorPnIdentifier,
        accountId
      );

      // Find all connections with this ID (in case of mutual requests)
      const allMatchingConnections = allConnections.connections.filter(c => c.connectionId === connectionId);
      
      // Prioritize pending_received, but also allow pending_sent (mutual request)
      let connection = allMatchingConnections.find(c => c.status === 'pending_received');
      if (!connection && allMatchingConnections.length > 0) {
        connection = allMatchingConnections.find(c => c.status === 'pending_sent');
      }

      if (!connection) {
        const statuses = allMatchingConnections.map(c => c.status).join(', ');
        throw new Error(`Connection request not found or not in acceptable status. Found connections with statuses: ${statuses || 'none'}`);
      }

      // Allow accepting if it's pending_received or pending_sent (mutual request)
      if (connection.status !== 'pending_received' && connection.status !== 'pending_sent') {
        if (connection.status === 'accepted') {
          if (!connection.kemCiphertext && kemCiphertext) {
            await ConnectionsSheetsService.updateConnectionStatus(
              token,
              spreadsheetId,
              connectionId,
              'accepted',
              acceptorPnIdentifier,
              accountId,
              connection.acceptedAt || new Date().toISOString(),
              undefined,
              kemCiphertext
            );
          }
          return;
        }
        throw new Error(`Connection request is not in acceptable status. Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`);
      }

      if (!kemCiphertext || kemCiphertext.trim() === '') {
        throw new Error('kemCiphertext is required to accept a connection (client E2E)');
      }

      const now = new Date().toISOString();

      await ConnectionsSheetsService.updateConnectionStatus(
        token,
        spreadsheetId,
        connectionId,
        'accepted',
        acceptorPnIdentifier,
        accountId,
        now,
        undefined,
        kemCiphertext
      );
  }

  /**
   * Update connection status in other user's sheet (requires both access tokens)
   * Uses Google Sheets instead of JSON file
   */
  static async updateOtherUserConnectionStatus(
    otherUserAccessToken: string,
    otherUserMetadataFolder: string,
    otherUserPnIdentifier: string,
    connectionId: string,
    newStatus: 'accepted' | 'blocked',
    acceptorPnIdentifier?: string, // The pn identifier of the user who accepted (to create connection if missing)
    kemCiphertext?: string,
    accountId?: string
  ): Promise<void> {
    // Use pn identifiers directly (already normalized)
    const normalizedAcceptorPnIdentifier = acceptorPnIdentifier;
    // Build token object from accessToken string (backward compatibility)
    if (await isPortableStorageProvider(otherUserPnIdentifier)) {
      const allConnections = await listConnectionsPortable(otherUserPnIdentifier, accountId);
      const connection = allConnections.find((c) => c.connectionId === connectionId);
      if (!connection) {
        if (newStatus === 'accepted' && normalizedAcceptorPnIdentifier) {
          await appendConnectionPortable(
            otherUserPnIdentifier,
            {
              connectionId,
              userPnIdentifier: normalizedAcceptorPnIdentifier,
              status: 'accepted',
              createdAt: new Date().toISOString(),
              acceptedAt: new Date().toISOString(),
              kemCiphertext
            },
            accountId
          );
          return;
        }
        throw new Error('Connection not found');
      }
      await updateConnectionStatusPortable(
        otherUserPnIdentifier,
        connectionId,
        newStatus,
        accountId,
        newStatus === 'accepted' ? new Date().toISOString() : undefined,
        kemCiphertext
      );
      return;
    }

    const token: GoogleDriveToken = { access_token: otherUserAccessToken };

    const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        otherUserMetadataFolder,
        otherUserPnIdentifier,
        accountId
      );

      const allConnections = await ConnectionsSheetsService.getConnections(
        token,
        spreadsheetId,
        otherUserPnIdentifier,
        accountId
      );

      // Find connection by ID
      const connection = allConnections.connections.find(c => c.connectionId === connectionId);

      if (!connection) {
        // Connection doesn't exist - create it if accepting
        if (newStatus === 'accepted' && normalizedAcceptorPnIdentifier) {
        await ConnectionsSheetsService.addConnection(
          token,
          spreadsheetId,
          {
            connectionId,
            userPnIdentifier: normalizedAcceptorPnIdentifier,
            status: 'accepted',
            createdAt: new Date().toISOString(),
            acceptedAt: new Date().toISOString(),
            kemCiphertext: kemCiphertext
          },
          otherUserPnIdentifier,
          accountId
        );
          return;
        }
        throw new Error('Connection not found');
      }

      const now = new Date().toISOString();
      await ConnectionsSheetsService.updateConnectionStatus(
        token,
        spreadsheetId,
        connectionId,
        newStatus,
        otherUserPnIdentifier,
        accountId,
        newStatus === 'accepted' ? now : undefined,
        undefined,
        kemCiphertext
      );
  }

  /**
   * Reject or remove connection
   */
  static async removeConnection(
    userAccessToken: string,
    userMetadataFolder: string,
    userPnIdentifier: string,
    connectionId: string,
    accountId?: string
  ): Promise<void> {
    // Use pn identifier directly (already normalized)
    const connectionsFile = await this.getConnectionsFile(userAccessToken, userMetadataFolder, userPnIdentifier, accountId);
    if (!connectionsFile) {
      return;
    }

    // Normalize identifier if it exists (for legacy data compatibility)
    connectionsFile.identifier = connectionsFile.identifier?.startsWith('pn-') ? connectionsFile.identifier : this.normalizeToPnIdentifier(connectionsFile.identifier || userPnIdentifier);

    connectionsFile.connections = connectionsFile.connections.filter(c => c.connectionId !== connectionId);
    connectionsFile.updatedAt = new Date().toISOString();

    await this.updateConnectionsFile(userAccessToken, userMetadataFolder, userPnIdentifier, connectionsFile, userPnIdentifier, accountId);
  }

  /**
   * Get all accepted connections for a user
   * Uses Google Sheets instead of JSON file
   */
  static async getConnections(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier?: string,
    accountId?: string
  ): Promise<Connection[]> {
    // Build token object from accessToken string (backward compatibility)
    const normalized = userPnIdentifier ? this.normalizeToPnIdentifier(userPnIdentifier) : '';
    if (normalized && (await isPortableStorageProvider(normalized))) {
      return listConnectionsPortable(normalized, accountId, { status: 'accepted' });
    }

    const token: GoogleDriveToken = { access_token: accessToken };
    try {
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        metadataFolderId,
        userPnIdentifier || '',
        accountId
      );

      const result = await ConnectionsSheetsService.getConnections(
        token,
        spreadsheetId,
        userPnIdentifier || '',
        accountId,
        { status: 'accepted' }
      );

      return result.connections;
    } catch (error) {
      console.error('Error getting connections from sheets, falling back to JSON:', error);
      if (!userPnIdentifier) {
        return [];
      }
      const connectionsFile = await this.getConnectionsFile(accessToken, metadataFolderId, userPnIdentifier, accountId);
      if (!connectionsFile) {
        return [];
      }
      const allConnections = connectionsFile.connections || [];
      return allConnections.filter(c => c.status === 'accepted');
    }
  }

  /**
   * Get pending requests (both sent and received)
   * Uses Google Sheets instead of JSON file
   */
  static async getPendingRequests(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier?: string,
    accountId?: string
  ): Promise<{ sent: Connection[]; received: Connection[] }> {
    // Build token object from accessToken string (backward compatibility)
    const normalized = userPnIdentifier ? this.normalizeToPnIdentifier(userPnIdentifier) : '';
    if (normalized && (await isPortableStorageProvider(normalized))) {
      const file = await getConnectionsFilePortable(normalized, accountId);
      if (!file) return { sent: [], received: [] };
      return {
        sent: file.connections.filter((c) => c.status === 'pending_sent'),
        received: file.connections.filter((c) => c.status === 'pending_received')
      };
    }

    const token: GoogleDriveToken = { access_token: accessToken };
    try {
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        metadataFolderId,
        userPnIdentifier || '',
        accountId
      );

      const sentResult = await ConnectionsSheetsService.getConnections(
        token,
        spreadsheetId,
        userPnIdentifier || '',
        accountId,
        { status: 'pending_sent' }
      );

      // Get pending received
      const receivedResult = await ConnectionsSheetsService.getConnections(
        token,
        spreadsheetId,
        userPnIdentifier || '',
        accountId,
        { status: 'pending_received' }
      );

      return {
        sent: sentResult.connections,
        received: receivedResult.connections
      };
    } catch (error) {
      console.error('Error getting pending requests from sheets, falling back to JSON:', error);
      if (!userPnIdentifier) {
        return { sent: [], received: [] };
      }
      const connectionsFile = await this.getConnectionsFile(accessToken, metadataFolderId, userPnIdentifier, accountId);
      if (!connectionsFile) {
        return { sent: [], received: [] };
      }
      const sent = connectionsFile.connections.filter(c => c.status === 'pending_sent');
      const received = connectionsFile.connections.filter(c => c.status === 'pending_received');
      return { sent, received };
    }
  }

  /**
   * Check if two users are connected
   */
  static async areConnected(
    user1AccessToken: string,
    user1MetadataFolder: string,
    user1Did: string,
    user2Did: string,
    accountId?: string
  ): Promise<boolean> {
    const status = await this.getConnectionStatus(user1AccessToken, user1MetadataFolder, user1Did, user2Did, accountId);
    return status.status === 'connected';
  }

  /**
   * Fast path: accepted DM threads appear in the user's inbox with a connectionId.
   * One bounded inbox read instead of loading the full connections sheet.
   */
  static async areConnectedViaInbox(
    token: GoogleDriveToken,
    inboxSheetId: string,
    userPnIdentifier: string,
    otherPnIdentifier: string,
    accountId?: string
  ): Promise<boolean> {
    const { MessageSheetsService } = await import('./messageSheetsService');
    const entry = await MessageSheetsService.getInboxConversationByParticipant(
      token,
      inboxSheetId,
      otherPnIdentifier,
      userPnIdentifier,
      accountId,
      100
    );
    return Boolean(entry?.connectionId);
  }
}

function isGoogleSheetsRateLimit(error: unknown): boolean {
  const err = error as { code?: number; response?: { status?: number } };
  return err?.code === 429 || err?.response?.status === 429;
}

