/**
 * Connections Service
 * Manages user connections stored on Google Drive
 * Each user stores their connections in connections.xlsx (Sheets) in their _metadata folder
 */

import { ConnectionsSheetsService } from './connectionsSheetsService';

export interface Connection {
  connectionId: string;
  userDid: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
  sharedSecret?: string; // Encrypted shared secret (new field)
}

export interface ConnectionsFile {
  identifier: string;
  updatedAt: string;
  connections: Connection[];
  blocked: string[]; // Array of blocked user DIDs
}

export class ConnectionsService {
  /**
   * Normalize identifier to pn-identifier format
   */
  private static normalizeToPnIdentifier(did: string): string {
    return did.startsWith('pn-') ? did : `pn-${did}`;
  }

  /**
   * Get connections file from user's Google Drive (connections.xlsx / Sheets)
   */
  static async getConnectionsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<ConnectionsFile | null> {
    return ConnectionsSheetsService.getConnectionsFile(accessToken, metadataFolderId);
  }

  /**
   * Create or update connections file (connections.xlsx / Sheets)
   */
  static async updateConnectionsFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    connectionsData: ConnectionsFile
  ): Promise<void> {
    await ConnectionsSheetsService.updateConnectionsFile(accessToken, metadataFolderId, identifier, connectionsData);
  }

  /**
   * Generate unique connection ID
   */
  static generateConnectionId(userDid1: string, userDid2: string): string {
    // Normalize to pn-identifier before generating ID
    const normalized1 = this.normalizeToPnIdentifier(userDid1);
    const normalized2 = this.normalizeToPnIdentifier(userDid2);
    // Sort DIDs to ensure consistent ID regardless of order
    const sorted = [normalized1, normalized2].sort();
    const hash = `${sorted[0]}_${sorted[1]}`;
    return `conn_${Buffer.from(hash).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)}`;
  }

  /**
   * Get connection status between two users
   * Returns status from perspective of userDid1
   * Uses Google Sheets instead of JSON file
   */
  static async getConnectionStatus(
    user1AccessToken: string,
    user1MetadataFolder: string,
    user1Did: string,
    user2Did: string
  ): Promise<{ status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked'; connectionId?: string }> {
    // Normalize DIDs to pn-identifiers
    const normalizedUser1Did = this.normalizeToPnIdentifier(user1Did);
    const normalizedUser2Did = this.normalizeToPnIdentifier(user2Did);

    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        user1AccessToken,
        user1MetadataFolder
      );

      // Get all connections
      const result = await ConnectionsSheetsService.getConnections(
        user1AccessToken,
        spreadsheetId
      );

      // Find connection with user2 (normalize when comparing)
      const connection = result.connections.find(c => {
        const normalizedCUserDid = this.normalizeToPnIdentifier(c.userDid);
        return normalizedCUserDid === normalizedUser2Did;
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
      const connectionsFile = await this.getConnectionsFile(user1AccessToken, user1MetadataFolder);
      if (!connectionsFile) {
        return { status: 'not_connected' };
      }

      // Normalize blocked entries when checking (handles legacy data)
      const normalizedBlocked = connectionsFile.blocked.map(b => this.normalizeToPnIdentifier(b));
      if (normalizedBlocked.includes(normalizedUser2Did)) {
        return { status: 'blocked' };
      }

      // Normalize when comparing connections
      const connection = connectionsFile.connections.find(c => {
        const normalizedCUserDid = this.normalizeToPnIdentifier(c.userDid);
        return normalizedCUserDid === normalizedUser2Did;
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
    requesterDid: string,
    recipientAccessToken: string,
    recipientMetadataFolder: string,
    recipientDid: string
  ): Promise<Connection> {
    // Normalize DIDs to pn-identifiers at the start
    const normalizedRequesterDid = this.normalizeToPnIdentifier(requesterDid);
    const normalizedRecipientDid = this.normalizeToPnIdentifier(recipientDid);

    try {
      const connectionId = this.generateConnectionId(normalizedRequesterDid, normalizedRecipientDid);
      const now = new Date().toISOString();

      // Get or create connections sheets for both users
      const requesterSheetId = await ConnectionsSheetsService.getConnectionsSheet(
        requesterAccessToken,
        requesterMetadataFolder
      );

      const recipientSheetId = await ConnectionsSheetsService.getConnectionsSheet(
        recipientAccessToken,
        recipientMetadataFolder
      );

      // Remove existing connections if any (by checking if connection exists)
      try {
        const existingRequester = await ConnectionsSheetsService.getConnections(
          requesterAccessToken,
          requesterSheetId
        );
        const existingReq = existingRequester.connections.find(c => {
          const normalizedCUserDid = this.normalizeToPnIdentifier(c.userDid);
          return normalizedCUserDid === normalizedRecipientDid;
        });
        if (existingReq) {
          await ConnectionsSheetsService.removeConnection(
            requesterAccessToken,
            requesterSheetId,
            existingReq.connectionId
          );
        }
      } catch (error) {
        // Ignore if connection doesn't exist
      }

      try {
        const existingRecipient = await ConnectionsSheetsService.getConnections(
          recipientAccessToken,
          recipientSheetId
        );
        const existingRec = existingRecipient.connections.find(c => {
          const normalizedCUserDid = this.normalizeToPnIdentifier(c.userDid);
          return normalizedCUserDid === normalizedRequesterDid;
        });
        if (existingRec) {
          await ConnectionsSheetsService.removeConnection(
            recipientAccessToken,
            recipientSheetId,
            existingRec.connectionId
          );
        }
      } catch (error) {
        // Ignore if connection doesn't exist
      }

      // Add connection request to requester's sheet (store normalized pn-identifier)
      await ConnectionsSheetsService.addConnection(
        requesterAccessToken,
        requesterSheetId,
        {
          connectionId,
          userDid: normalizedRecipientDid,
          status: 'pending_sent',
          createdAt: now
        }
      );

      // Add connection request to recipient's sheet (store normalized pn-identifier)
      await ConnectionsSheetsService.addConnection(
        recipientAccessToken,
        recipientSheetId,
        {
          connectionId,
          userDid: normalizedRequesterDid,
          status: 'pending_received',
          createdAt: now
        }
      );

      return {
        connectionId,
        userDid: normalizedRecipientDid,
        status: 'pending_sent',
        createdAt: now
      };
    } catch (error) {
      console.error('Error sending connection request via sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      return this.sendConnectionRequestJSON(
        requesterAccessToken,
        requesterMetadataFolder,
        normalizedRequesterDid,
        recipientAccessToken,
        recipientMetadataFolder,
        normalizedRecipientDid
      );
    }
  }

  /**
   * Fallback method using JSON (for backward compatibility)
   */
  private static async sendConnectionRequestJSON(
    requesterAccessToken: string,
    requesterMetadataFolder: string,
    requesterDid: string,
    recipientAccessToken: string,
    recipientMetadataFolder: string,
    recipientDid: string
  ): Promise<Connection> {
    // DIDs should already be normalized when passed to this method, but normalize again to be safe
    const normalizedRequesterDid = this.normalizeToPnIdentifier(requesterDid);
    const normalizedRecipientDid = this.normalizeToPnIdentifier(recipientDid);

    const connectionId = this.generateConnectionId(normalizedRequesterDid, normalizedRecipientDid);
    const now = new Date().toISOString();

    // Update requester's connections file
    let requesterFile = await this.getConnectionsFile(requesterAccessToken, requesterMetadataFolder);
    if (!requesterFile) {
      requesterFile = {
        identifier: normalizedRequesterDid,
        updatedAt: now,
        connections: [],
        blocked: []
      };
    }

    // Normalize identifier if it exists
    requesterFile.identifier = this.normalizeToPnIdentifier(requesterFile.identifier || normalizedRequesterDid);

    // Normalize when filtering (handles legacy data)
    requesterFile.connections = requesterFile.connections.filter(c => {
      const normalizedCUserDid = this.normalizeToPnIdentifier(c.userDid);
      return normalizedCUserDid !== normalizedRecipientDid;
    });
    requesterFile.connections.push({
      connectionId,
      userDid: normalizedRecipientDid,
      status: 'pending_sent',
      createdAt: now
    });
    requesterFile.updatedAt = now;
    await this.updateConnectionsFile(requesterAccessToken, requesterMetadataFolder, normalizedRequesterDid, requesterFile);

    // Update recipient's connections file
    let recipientFile = await this.getConnectionsFile(recipientAccessToken, recipientMetadataFolder);
    if (!recipientFile) {
      recipientFile = {
        identifier: normalizedRecipientDid,
        updatedAt: now,
        connections: [],
        blocked: []
      };
    }

    // Normalize identifier if it exists
    recipientFile.identifier = this.normalizeToPnIdentifier(recipientFile.identifier || normalizedRecipientDid);

    // Normalize when filtering (handles legacy data)
    recipientFile.connections = recipientFile.connections.filter(c => {
      const normalizedCUserDid = this.normalizeToPnIdentifier(c.userDid);
      return normalizedCUserDid !== normalizedRequesterDid;
    });
    
    recipientFile.connections.push({
      connectionId,
      userDid: normalizedRequesterDid,
      status: 'pending_received',
      createdAt: now
    });
    recipientFile.updatedAt = now;
    await this.updateConnectionsFile(recipientAccessToken, recipientMetadataFolder, normalizedRecipientDid, recipientFile);

    return {
      connectionId,
      userDid: normalizedRecipientDid,
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
    acceptorDid: string,
    connectionId: string
  ): Promise<string> {
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        acceptorAccessToken,
        acceptorMetadataFolder
      );

      // Get all connections
      const allConnections = await ConnectionsSheetsService.getConnections(
        acceptorAccessToken,
        spreadsheetId
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
              acceptorAccessToken,
              spreadsheetId,
              connectionId,
              'accepted',
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
        acceptorAccessToken,
        spreadsheetId,
        connectionId,
        'accepted',
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
        acceptorDid,
        connectionId
      );
    }
  }

  /**
   * Fallback method using JSON (for backward compatibility)
   */
  private static async acceptConnectionRequestJSON(
    acceptorAccessToken: string,
    acceptorMetadataFolder: string,
    acceptorDid: string,
    connectionId: string
  ): Promise<string> {
    const acceptorFile = await this.getConnectionsFile(acceptorAccessToken, acceptorMetadataFolder);
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
        await this.updateConnectionsFile(acceptorAccessToken, acceptorMetadataFolder, acceptorDid, acceptorFile);
        return sharedSecret;
      }
      throw new Error(`Connection request is not in acceptable status. Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`);
    }

    const otherUserDid = connection.userDid;
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

    await this.updateConnectionsFile(acceptorAccessToken, acceptorMetadataFolder, acceptorDid, acceptorFile);
    
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
    otherUserDid: string,
    connectionId: string,
    newStatus: 'accepted' | 'blocked',
    acceptorDid?: string, // The DID of the user who accepted (to create connection if missing)
    sharedSecret?: string // Encrypted shared secret to store in connection
  ): Promise<void> {
    // Normalize DIDs to pn-identifiers
    const normalizedOtherUserDid = this.normalizeToPnIdentifier(otherUserDid);
    const normalizedAcceptorDid = acceptorDid ? this.normalizeToPnIdentifier(acceptorDid) : undefined;

    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        otherUserAccessToken,
        otherUserMetadataFolder
      );

      // Get all connections to find the one to update
      const allConnections = await ConnectionsSheetsService.getConnections(
        otherUserAccessToken,
        spreadsheetId
      );

      // Find connection by ID
      const connection = allConnections.connections.find(c => c.connectionId === connectionId);

      if (!connection) {
        // Connection doesn't exist - create it if accepting
        if (newStatus === 'accepted' && normalizedAcceptorDid) {
          await ConnectionsSheetsService.addConnection(
            otherUserAccessToken,
            spreadsheetId,
            {
              connectionId,
              userDid: normalizedAcceptorDid,
              status: 'accepted',
              createdAt: new Date().toISOString(),
              acceptedAt: new Date().toISOString(),
              sharedSecret: sharedSecret
            }
          );
          return;
        }
        throw new Error('Connection not found');
      }

      // Update connection status and shared secret
      const now = new Date().toISOString();
      await ConnectionsSheetsService.updateConnectionStatus(
        otherUserAccessToken,
        spreadsheetId,
        connectionId,
        newStatus,
        newStatus === 'accepted' ? now : undefined,
        sharedSecret
      );
    } catch (error) {
      console.error('Error updating other user connection via sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      await this.updateOtherUserConnectionStatusJSON(
        otherUserAccessToken,
        otherUserMetadataFolder,
        normalizedOtherUserDid,
        connectionId,
        newStatus,
        normalizedAcceptorDid
      );
    }
  }

  /**
   * Fallback method using JSON (for backward compatibility)
   */
  private static async updateOtherUserConnectionStatusJSON(
    otherUserAccessToken: string,
    otherUserMetadataFolder: string,
    otherUserDid: string,
    connectionId: string,
    newStatus: 'accepted' | 'blocked',
    acceptorDid?: string
  ): Promise<void> {
    // DIDs should already be normalized when passed to this method, but normalize again to be safe
    const normalizedOtherUserDid = this.normalizeToPnIdentifier(otherUserDid);
    const normalizedAcceptorDid = acceptorDid ? this.normalizeToPnIdentifier(acceptorDid) : undefined;

    const otherUserFile = await this.getConnectionsFile(otherUserAccessToken, otherUserMetadataFolder);
    if (!otherUserFile) {
      console.log(`[updateOtherUserConnectionStatus] Connections file not found for ${normalizedOtherUserDid}, creating new file`);
      // Create new file with the connection
      if (newStatus === 'accepted' && normalizedAcceptorDid) {
        const now = new Date().toISOString();
        const newFile: ConnectionsFile = {
          identifier: normalizedOtherUserDid,
          updatedAt: now,
          connections: [{
            connectionId,
            userDid: normalizedAcceptorDid,
            status: 'accepted',
            createdAt: now,
            acceptedAt: now
          }],
          blocked: []
        };
        await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, normalizedOtherUserDid, newFile);
        console.log(`[updateOtherUserConnectionStatus] Created new connections file for ${normalizedOtherUserDid} with accepted connection to ${normalizedAcceptorDid}`);
        return;
      }
      return; // Can't create connection without acceptorDid
    }

    // Normalize identifier if it exists
    otherUserFile.identifier = this.normalizeToPnIdentifier(otherUserFile.identifier || normalizedOtherUserDid);

    const connection = otherUserFile.connections.find(c => c.connectionId === connectionId);
    if (!connection) {
      console.log(`[updateOtherUserConnectionStatus] Connection ${connectionId} not found in ${normalizedOtherUserDid}'s file`);
      console.log(`[updateOtherUserConnectionStatus] Available connections:`, otherUserFile.connections.map(c => ({
        connectionId: c.connectionId,
        userDid: c.userDid,
        status: c.status
      })));
      
      // If accepting and we have acceptorDid, create the connection
      if (newStatus === 'accepted' && normalizedAcceptorDid) {
        console.log(`[updateOtherUserConnectionStatus] Creating missing connection in ${normalizedOtherUserDid}'s file`);
        const now = new Date().toISOString();
        otherUserFile.connections.push({
          connectionId,
          userDid: normalizedAcceptorDid,
          status: 'accepted',
          createdAt: now,
          acceptedAt: now
        });
        otherUserFile.updatedAt = now;
        await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, normalizedOtherUserDid, otherUserFile);
        console.log(`[updateOtherUserConnectionStatus] Successfully created connection in ${normalizedOtherUserDid}'s file`);
        return;
      }
      
      console.warn(`[updateOtherUserConnectionStatus] Connection not found and cannot create (missing acceptorDid or wrong status)`);
      return; // Connection not found in their file
    }

    // Normalize connection.userDid when reading (handles legacy data)
    const normalizedConnectionUserDid = this.normalizeToPnIdentifier(connection.userDid);
    connection.userDid = normalizedConnectionUserDid;

    console.log(`[updateOtherUserConnectionStatus] Found connection in ${normalizedOtherUserDid}'s file:`, {
      connectionId: connection.connectionId,
      userDid: normalizedConnectionUserDid,
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
      if (!normalizedBlocked.includes(normalizedConnectionUserDid)) {
        otherUserFile.blocked.push(normalizedConnectionUserDid);
      }
      // Update blocked array with normalized values
      otherUserFile.blocked = normalizedBlocked;
    }

    otherUserFile.updatedAt = now;
    await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, normalizedOtherUserDid, otherUserFile);
    console.log(`[updateOtherUserConnectionStatus] Successfully updated connection status to ${newStatus} in ${normalizedOtherUserDid}'s file`);
  }

  /**
   * Reject or remove connection
   */
  static async removeConnection(
    userAccessToken: string,
    userMetadataFolder: string,
    userDid: string,
    connectionId: string
  ): Promise<void> {
    // Normalize userDid to pn-identifier
    const normalizedUserDid = this.normalizeToPnIdentifier(userDid);

    const connectionsFile = await this.getConnectionsFile(userAccessToken, userMetadataFolder);
    if (!connectionsFile) {
      return;
    }

    // Normalize identifier if it exists
    connectionsFile.identifier = this.normalizeToPnIdentifier(connectionsFile.identifier || normalizedUserDid);

    connectionsFile.connections = connectionsFile.connections.filter(c => c.connectionId !== connectionId);
    connectionsFile.updatedAt = new Date().toISOString();

    await this.updateConnectionsFile(userAccessToken, userMetadataFolder, normalizedUserDid, connectionsFile);
  }

  /**
   * Get all accepted connections for a user
   * Uses Google Sheets instead of JSON file
   */
  static async getConnections(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Connection[]> {
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        accessToken,
        metadataFolderId
      );

      // Get accepted connections
      const result = await ConnectionsSheetsService.getConnections(
        accessToken,
        spreadsheetId,
        { status: 'accepted' }
      );

      return result.connections;
    } catch (error) {
      console.error('Error getting connections from sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      const connectionsFile = await this.getConnectionsFile(accessToken, metadataFolderId);
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
    metadataFolderId: string
  ): Promise<{ sent: Connection[]; received: Connection[] }> {
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        accessToken,
        metadataFolderId
      );

      // Get pending sent
      const sentResult = await ConnectionsSheetsService.getConnections(
        accessToken,
        spreadsheetId,
        { status: 'pending_sent' }
      );

      // Get pending received
      const receivedResult = await ConnectionsSheetsService.getConnections(
        accessToken,
        spreadsheetId,
        { status: 'pending_received' }
      );

      return {
        sent: sentResult.connections,
        received: receivedResult.connections
      };
    } catch (error) {
      console.error('Error getting pending requests from sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      const connectionsFile = await this.getConnectionsFile(accessToken, metadataFolderId);
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

