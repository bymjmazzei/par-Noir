/**
 * Connections Service
 * Manages user connections stored on Google Drive
 * Each user stores their connections in connections.xlsx (Sheets) in their _metadata folder
 */

import { ConnectionsSheetsService } from './connectionsSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';

export interface Connection {
  connectionId: string;
  userPnIdentifier: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
  sharedSecret?: string; // Encrypted shared secret (new field)
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
      // Backward compatibility - try to get from token if available
      throw new Error('userPnIdentifier is required');
    }
    return ConnectionsSheetsService.getConnectionsFile(tokenObj, metadataFolderId, userPnIdentifier, accountId);
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
    await ConnectionsSheetsService.updateConnectionsFile(tokenObj, metadataFolderId, identifier, connectionsData, userPnIdentifier, accountId);
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
    const token: GoogleDriveToken = { access_token: user1AccessToken };
    try {
      // Get or create connections sheet
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
    requesterAccountId?: string,
    recipientAccountId?: string
  ): Promise<Connection> {
    // Use pn identifiers directly (already normalized)
    // Build token objects from accessToken strings (backward compatibility)
    const requesterToken: GoogleDriveToken = { access_token: requesterAccessToken };
    const recipientToken: GoogleDriveToken = { access_token: recipientAccessToken };
    try {
      const connectionId = this.generateConnectionId(requesterPnIdentifier, recipientPnIdentifier);
      const now = new Date().toISOString();

      // Get or create connections sheets for both users
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
          createdAt: now
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
    } catch (error) {
      console.error('Error sending connection request via sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      return this.sendConnectionRequestJSON(
        requesterAccessToken,
        requesterMetadataFolder,
        requesterPnIdentifier,
        recipientAccessToken,
        recipientMetadataFolder,
        recipientPnIdentifier,
        requesterAccountId,
        recipientAccountId
      );
    }
  }

  /**
   * Fallback method using JSON (for backward compatibility)
   */
  private static async sendConnectionRequestJSON(
    requesterAccessToken: string,
    requesterMetadataFolder: string,
    requesterPnIdentifier: string,
    recipientAccessToken: string,
    recipientMetadataFolder: string,
    recipientPnIdentifier: string,
    requesterAccountId?: string,
    recipientAccountId?: string
  ): Promise<Connection> {
    // Use pn identifiers directly (already normalized)

    const connectionId = this.generateConnectionId(requesterPnIdentifier, recipientPnIdentifier);
    const now = new Date().toISOString();

    // Update requester's connections file
    let requesterFile = await this.getConnectionsFile(requesterAccessToken, requesterMetadataFolder, requesterPnIdentifier, requesterAccountId);
    if (!requesterFile) {
      requesterFile = {
        identifier: requesterPnIdentifier,
        updatedAt: now,
        connections: [],
        blocked: []
      };
    }

    // Normalize identifier if it exists (for legacy data compatibility)
    requesterFile.identifier = requesterFile.identifier?.startsWith('pn-') ? requesterFile.identifier : this.normalizeToPnIdentifier(requesterFile.identifier || requesterPnIdentifier);

    // Normalize when filtering (handles legacy data)
    requesterFile.connections = requesterFile.connections.filter(c => {
      const normalizedCUserPnIdentifier = c.userPnIdentifier.startsWith('pn-') ? c.userPnIdentifier : this.normalizeToPnIdentifier(c.userPnIdentifier);
      return normalizedCUserPnIdentifier !== recipientPnIdentifier;
    });
    requesterFile.connections.push({
      connectionId,
      userPnIdentifier: recipientPnIdentifier,
      status: 'pending_sent',
      createdAt: now
    });
    requesterFile.updatedAt = now;
    await this.updateConnectionsFile(requesterAccessToken, requesterMetadataFolder, requesterPnIdentifier, requesterFile, requesterPnIdentifier, requesterAccountId);

    // Update recipient's connections file
    let recipientFile = await this.getConnectionsFile(recipientAccessToken, recipientMetadataFolder, recipientPnIdentifier, recipientAccountId);
    if (!recipientFile) {
      recipientFile = {
        identifier: recipientPnIdentifier,
        updatedAt: now,
        connections: [],
        blocked: []
      };
    }

    // Normalize identifier if it exists (for legacy data compatibility)
    recipientFile.identifier = recipientFile.identifier?.startsWith('pn-') ? recipientFile.identifier : this.normalizeToPnIdentifier(recipientFile.identifier || recipientPnIdentifier);

    // Normalize when filtering (handles legacy data)
    recipientFile.connections = recipientFile.connections.filter(c => {
      const normalizedCUserPnIdentifier = c.userPnIdentifier.startsWith('pn-') ? c.userPnIdentifier : this.normalizeToPnIdentifier(c.userPnIdentifier);
      return normalizedCUserPnIdentifier !== requesterPnIdentifier;
    });
    
    recipientFile.connections.push({
      connectionId,
      userPnIdentifier: requesterPnIdentifier,
      status: 'pending_received',
      createdAt: now
    });
    recipientFile.updatedAt = now;
    await this.updateConnectionsFile(recipientAccessToken, recipientMetadataFolder, recipientPnIdentifier, recipientFile, recipientPnIdentifier, recipientAccountId);

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
    accountId?: string
  ): Promise<string> {
    // Build token object from accessToken string (backward compatibility)
    const token: GoogleDriveToken = { access_token: acceptorAccessToken };
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        acceptorMetadataFolder,
        acceptorPnIdentifier,
        accountId
      );

      // Get all connections
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
          // Already accepted - but check if it has a shared secret
          if (!connection.sharedSecret) {
            // Generate shared secret for existing accepted connection
            const crypto = await import('crypto');
            const { MetadataEncryption } = await import('../utils/metadataEncryption');
            const rawSecret = crypto.randomBytes(32).toString('base64');
            const sharedSecret = MetadataEncryption.encryptField(rawSecret);
            
            // Update with shared secret
            await ConnectionsSheetsService.updateConnectionStatus(
              token,
              spreadsheetId,
              connectionId,
              'accepted',
              acceptorPnIdentifier,
              accountId,
              connection.acceptedAt || new Date().toISOString(),
              sharedSecret
            );
            console.log(`[ConnectionsService] Generated shared secret for existing accepted connection ${connectionId}`);
            // Continue to update other user's connection below (don't return early)
          } else {
            // Already accepted with shared secret - idempotent
            return connection.sharedSecret!;
          }
        } else {
          throw new Error(`Connection request is not in acceptable status. Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`);
        }
      }

      const now = new Date().toISOString();

      // Generate shared secret if connection doesn't already have one
      let sharedSecret: string | undefined;
      if (!connection.sharedSecret) {
        const crypto = await import('crypto');
        const { MetadataEncryption } = await import('../utils/metadataEncryption');
        
        // Generate random 32-byte shared secret
        const rawSecret = crypto.randomBytes(32).toString('base64');
        
        // Encrypt shared secret using MetadataEncryption
        sharedSecret = MetadataEncryption.encryptField(rawSecret);
        
        console.log(`[ConnectionsService] Generated shared secret for connection ${connectionId}`);
      } else {
        // Connection already has shared secret (idempotent)
        sharedSecret = connection.sharedSecret;
        console.log(`[ConnectionsService] Connection ${connectionId} already has shared secret`);
      }

      // Update connection status and shared secret in Sheets
      await ConnectionsSheetsService.updateConnectionStatus(
        token,
        spreadsheetId,
        connectionId,
        'accepted',
        acceptorPnIdentifier,
        accountId,
        now,
        sharedSecret
      );

      // Return the shared secret so the API endpoint can sync it to the other user
      return sharedSecret;
    } catch (error) {
      console.error('Error accepting connection request via sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      return await this.acceptConnectionRequestJSON(
        acceptorAccessToken,
        acceptorMetadataFolder,
        acceptorPnIdentifier,
        connectionId,
        accountId
      );
    }
  }

  /**
   * Fallback method using JSON (for backward compatibility)
   */
  private static async acceptConnectionRequestJSON(
    acceptorAccessToken: string,
    acceptorMetadataFolder: string,
    acceptorPnIdentifier: string,
    connectionId: string,
    accountId?: string
  ): Promise<string> {
    const acceptorFile = await this.getConnectionsFile(acceptorAccessToken, acceptorMetadataFolder, acceptorPnIdentifier, accountId);
    if (!acceptorFile) {
      throw new Error('Connections file not found');
    }

    // Find all connections with this ID (in case of mutual requests)
    const allMatchingConnections = acceptorFile.connections.filter(c => c.connectionId === connectionId);
    
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
        // Already accepted, return existing shared secret or generate one
        if (connection.sharedSecret) {
          return connection.sharedSecret;
        }
        // Generate shared secret for existing accepted connection
        const crypto = await import('crypto');
        const { MetadataEncryption } = await import('../utils/metadataEncryption');
        const rawSecret = crypto.randomBytes(32).toString('base64');
        const sharedSecret = MetadataEncryption.encryptField(rawSecret);
        connection.sharedSecret = sharedSecret;
        acceptorFile.updatedAt = new Date().toISOString();
        await this.updateConnectionsFile(acceptorAccessToken, acceptorMetadataFolder, acceptorPnIdentifier, acceptorFile);
        return sharedSecret;
      }
      throw new Error(`Connection request is not in acceptable status. Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`);
    }

    // Normalize connection.userPnIdentifier when reading (handles legacy data)
    const otherUserPnIdentifier = this.normalizeToPnIdentifier(connection.userPnIdentifier);
    connection.userPnIdentifier = otherUserPnIdentifier;
    const now = new Date().toISOString();

    // Generate shared secret
    const crypto = await import('crypto');
    const { MetadataEncryption } = await import('../utils/metadataEncryption');
    const rawSecret = crypto.randomBytes(32).toString('base64');
    const sharedSecret = MetadataEncryption.encryptField(rawSecret);

    // Update acceptor's file
    connection.status = 'accepted';
    connection.acceptedAt = now;
    connection.sharedSecret = sharedSecret;
    acceptorFile.updatedAt = now;

    await this.updateConnectionsFile(acceptorAccessToken, acceptorMetadataFolder, acceptorPnIdentifier, acceptorFile);
    
    return sharedSecret;

    // Note: The other user's file should also be updated, but that requires their access token
    // This will be handled by the API endpoint that has access to both users' tokens
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
    sharedSecret?: string, // Encrypted shared secret to store in connection
    accountId?: string
  ): Promise<void> {
    // Use pn identifiers directly (already normalized)
    const normalizedAcceptorPnIdentifier = acceptorPnIdentifier;
    // Build token object from accessToken string (backward compatibility)
    const token: GoogleDriveToken = { access_token: otherUserAccessToken };

    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        otherUserMetadataFolder,
        otherUserPnIdentifier,
        accountId
      );

      // Get all connections to find the one to update
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
            sharedSecret: sharedSecret
          },
          otherUserPnIdentifier,
          accountId
        );
          return;
        }
        throw new Error('Connection not found');
      }

      // Update connection status and shared secret
      const now = new Date().toISOString();
      await ConnectionsSheetsService.updateConnectionStatus(
        token,
        spreadsheetId,
        connectionId,
        newStatus,
        otherUserPnIdentifier,
        accountId,
        newStatus === 'accepted' ? now : undefined,
        sharedSecret
      );
    } catch (error) {
      console.error('Error updating other user connection via sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      await this.updateOtherUserConnectionStatusJSON(
        otherUserAccessToken,
        otherUserMetadataFolder,
        otherUserPnIdentifier,
        connectionId,
        newStatus,
        normalizedAcceptorPnIdentifier
      );
    }
  }

  /**
   * Fallback method using JSON (for backward compatibility)
   */
  private static async updateOtherUserConnectionStatusJSON(
    otherUserAccessToken: string,
    otherUserMetadataFolder: string,
    otherUserPnIdentifier: string,
    connectionId: string,
    newStatus: 'accepted' | 'blocked',
    acceptorPnIdentifier?: string
  ): Promise<void> {
    // Use pn identifiers directly (already normalized)
    const normalizedAcceptorPnIdentifier = acceptorPnIdentifier;

    const otherUserFile = await this.getConnectionsFile(otherUserAccessToken, otherUserMetadataFolder);
    if (!otherUserFile) {
      console.log(`[updateOtherUserConnectionStatus] Connections file not found for ${otherUserPnIdentifier}, creating new file`);
      // Create new file with the connection
      if (newStatus === 'accepted' && normalizedAcceptorPnIdentifier) {
        const now = new Date().toISOString();
        const newFile: ConnectionsFile = {
          identifier: otherUserPnIdentifier,
          updatedAt: now,
          connections: [{
            connectionId,
            userPnIdentifier: normalizedAcceptorPnIdentifier,
            status: 'accepted',
            createdAt: now,
            acceptedAt: now
          }],
          blocked: []
        };
        await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, otherUserPnIdentifier, newFile);
        console.log(`[updateOtherUserConnectionStatus] Created new connections file for ${otherUserPnIdentifier} with accepted connection to ${normalizedAcceptorPnIdentifier}`);
        return;
      }
      return; // Can't create connection without acceptorPnIdentifier
    }

    // Normalize identifier if it exists (for legacy data compatibility)
    otherUserFile.identifier = otherUserFile.identifier?.startsWith('pn-') ? otherUserFile.identifier : this.normalizeToPnIdentifier(otherUserFile.identifier || otherUserPnIdentifier);

    const connection = otherUserFile.connections.find(c => c.connectionId === connectionId);
    if (!connection) {
      console.log(`[updateOtherUserConnectionStatus] Connection ${connectionId} not found in ${otherUserPnIdentifier}'s file`);
        console.log(`[updateOtherUserConnectionStatus] Available connections:`, otherUserFile.connections.map(c => ({
          connectionId: c.connectionId,
          userPnIdentifier: c.userPnIdentifier,
          status: c.status
        })));
      
      // If accepting and we have acceptorPnIdentifier, create the connection
      if (newStatus === 'accepted' && normalizedAcceptorPnIdentifier) {
        console.log(`[updateOtherUserConnectionStatus] Creating missing connection in ${otherUserPnIdentifier}'s file`);
        const now = new Date().toISOString();
        otherUserFile.connections.push({
          connectionId,
          userPnIdentifier: normalizedAcceptorPnIdentifier,
          status: 'accepted',
          createdAt: now,
          acceptedAt: now
        });
        otherUserFile.updatedAt = now;
        await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, otherUserPnIdentifier, otherUserFile);
        console.log(`[updateOtherUserConnectionStatus] Successfully created connection in ${otherUserPnIdentifier}'s file`);
        return;
      }
      
      console.warn(`[updateOtherUserConnectionStatus] Connection not found and cannot create (missing acceptorPnIdentifier or wrong status)`);
      return; // Connection not found in their file
    }

    // Normalize connection.userPnIdentifier when reading (handles legacy data)
    const normalizedConnectionUserPnIdentifier = connection.userPnIdentifier.startsWith('pn-') ? connection.userPnIdentifier : this.normalizeToPnIdentifier(connection.userPnIdentifier);
    connection.userPnIdentifier = normalizedConnectionUserPnIdentifier;

    console.log(`[updateOtherUserConnectionStatus] Found connection in ${otherUserPnIdentifier}'s file:`, {
      connectionId: connection.connectionId,
      userPnIdentifier: normalizedConnectionUserPnIdentifier,
      currentStatus: connection.status,
      newStatus
    });

    const now = new Date().toISOString();

    if (newStatus === 'accepted') {
      connection.status = 'accepted';
      connection.acceptedAt = now;
    } else if (newStatus === 'blocked') {
      connection.status = 'blocked';
      // Normalize blocked entries when checking and adding (handles legacy data)
      const normalizedBlocked = otherUserFile.blocked.map(b => this.normalizeToPnIdentifier(b));
      if (!normalizedBlocked.includes(normalizedConnectionUserPnIdentifier)) {
        otherUserFile.blocked.push(normalizedConnectionUserPnIdentifier);
      }
      // Update blocked array with normalized values
      otherUserFile.blocked = normalizedBlocked;
    }

    otherUserFile.updatedAt = now;
    await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, otherUserPnIdentifier, otherUserFile);
    console.log(`[updateOtherUserConnectionStatus] Successfully updated connection status to ${newStatus} in ${otherUserPnIdentifier}'s file`);
  }

  /**
   * Reject or remove connection
   */
  static async removeConnection(
    userAccessToken: string,
    userMetadataFolder: string,
    userPnIdentifier: string,
    connectionId: string
  ): Promise<void> {
    // Use pn identifier directly (already normalized)
    const connectionsFile = await this.getConnectionsFile(userAccessToken, userMetadataFolder);
    if (!connectionsFile) {
      return;
    }

    // Normalize identifier if it exists (for legacy data compatibility)
    connectionsFile.identifier = connectionsFile.identifier?.startsWith('pn-') ? connectionsFile.identifier : this.normalizeToPnIdentifier(connectionsFile.identifier || userPnIdentifier);

    connectionsFile.connections = connectionsFile.connections.filter(c => c.connectionId !== connectionId);
    connectionsFile.updatedAt = new Date().toISOString();

    await this.updateConnectionsFile(userAccessToken, userMetadataFolder, userPnIdentifier, connectionsFile);
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
    const token: GoogleDriveToken = { access_token: accessToken };
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        metadataFolderId,
        userPnIdentifier || '',
        accountId
      );

      // Get accepted connections
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
      // Fallback to JSON for backward compatibility
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
    const token: GoogleDriveToken = { access_token: accessToken };
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        metadataFolderId,
        userPnIdentifier || '',
        accountId
      );

      // Get pending sent
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
      // Fallback to JSON for backward compatibility
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
    user2Did: string
  ): Promise<boolean> {
    const status = await this.getConnectionStatus(user1AccessToken, user1MetadataFolder, user1Did, user2Did);
    return status.status === 'connected';
  }
}

