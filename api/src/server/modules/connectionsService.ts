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
    // Sort DIDs to ensure consistent ID regardless of order
    const sorted = [userDid1, userDid2].sort();
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
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getOrCreateConnectionsSheet(
        user1AccessToken,
        user1MetadataFolder
      );

      // Get all connections
      const result = await ConnectionsSheetsService.getConnections(
        user1AccessToken,
        spreadsheetId
      );

      // Find connection with user2
      const connection = result.connections.find(c => c.userDid === user2Did);
      
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

      if (connectionsFile.blocked.includes(user2Did)) {
        return { status: 'blocked' };
      }

      const connection = connectionsFile.connections.find(c => c.userDid === user2Did);
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
    try {
      const connectionId = this.generateConnectionId(requesterDid, recipientDid);
      const now = new Date().toISOString();

      // Get or create connections sheets for both users
      const requesterSheetId = await ConnectionsSheetsService.getOrCreateConnectionsSheet(
        requesterAccessToken,
        requesterMetadataFolder
      );

      const recipientSheetId = await ConnectionsSheetsService.getOrCreateConnectionsSheet(
        recipientAccessToken,
        recipientMetadataFolder
      );

      // Remove existing connections if any (by checking if connection exists)
      try {
        const existingRequester = await ConnectionsSheetsService.getConnections(
          requesterAccessToken,
          requesterSheetId
        );
        const existingReq = existingRequester.connections.find(c => c.userDid === recipientDid);
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
        const existingRec = existingRecipient.connections.find(c => c.userDid === requesterDid);
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

      // Add connection request to requester's sheet
      await ConnectionsSheetsService.addConnection(
        requesterAccessToken,
        requesterSheetId,
        {
          connectionId,
          userDid: recipientDid,
          status: 'pending_sent',
          createdAt: now
        }
      );

      // Add connection request to recipient's sheet
      await ConnectionsSheetsService.addConnection(
        recipientAccessToken,
        recipientSheetId,
        {
          connectionId,
          userDid: requesterDid,
          status: 'pending_received',
          createdAt: now
        }
      );

      return {
        connectionId,
        userDid: recipientDid,
        status: 'pending_sent',
        createdAt: now
      };
    } catch (error) {
      console.error('Error sending connection request via sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      return this.sendConnectionRequestJSON(
        requesterAccessToken,
        requesterMetadataFolder,
        requesterDid,
        recipientAccessToken,
        recipientMetadataFolder,
        recipientDid
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
    const connectionId = this.generateConnectionId(requesterDid, recipientDid);
    const now = new Date().toISOString();

    // Update requester's connections file
    let requesterFile = await this.getConnectionsFile(requesterAccessToken, requesterMetadataFolder);
    if (!requesterFile) {
      requesterFile = {
        identifier: requesterDid,
        updatedAt: now,
        connections: [],
        blocked: []
      };
    }

    requesterFile.connections = requesterFile.connections.filter(c => c.userDid !== recipientDid);
    requesterFile.connections.push({
      connectionId,
      userDid: recipientDid,
      status: 'pending_sent',
      createdAt: now
    });
    requesterFile.updatedAt = now;
    await this.updateConnectionsFile(requesterAccessToken, requesterMetadataFolder, requesterDid, requesterFile);

    // Update recipient's connections file
    let recipientFile = await this.getConnectionsFile(recipientAccessToken, recipientMetadataFolder);
    if (!recipientFile) {
      recipientFile = {
        identifier: recipientDid,
        updatedAt: now,
        connections: [],
        blocked: []
      };
    }

    recipientFile.connections = recipientFile.connections.filter(c => {
      const normalizedC = c.userDid.startsWith('pn-') ? c.userDid : `pn-${c.userDid}`;
      const normalizedRequester = requesterDid.startsWith('pn-') ? requesterDid : `pn-${requesterDid}`;
      return normalizedC !== normalizedRequester && c.userDid !== requesterDid;
    });
    
    recipientFile.connections.push({
      connectionId,
      userDid: requesterDid,
      status: 'pending_received',
      createdAt: now
    });
    recipientFile.updatedAt = now;
    await this.updateConnectionsFile(recipientAccessToken, recipientMetadataFolder, recipientDid, recipientFile);

    return {
      connectionId,
      userDid: recipientDid,
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
  ): Promise<void> {
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getOrCreateConnectionsSheet(
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
          // Already accepted, this is fine (idempotent)
          return;
        }
        throw new Error(`Connection request is not in acceptable status. Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`);
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

      // Note: The other user's file should also be updated, but that requires their access token
      // This will be handled by the API endpoint that has access to both users' tokens
    } catch (error) {
      console.error('Error accepting connection request via sheets, falling back to JSON:', error);
      // Fallback to JSON for backward compatibility
      await this.acceptConnectionRequestJSON(
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
  ): Promise<void> {
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
        // Already accepted, this is fine (idempotent)
        return;
      }
      throw new Error(`Connection request is not in acceptable status. Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`);
    }

    const otherUserDid = connection.userDid;
    const now = new Date().toISOString();

    // Update acceptor's file
    connection.status = 'accepted';
    connection.acceptedAt = now;
    acceptorFile.updatedAt = now;

    await this.updateConnectionsFile(acceptorAccessToken, acceptorMetadataFolder, acceptorDid, acceptorFile);

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
    try {
      // Get or create connections sheet
      const spreadsheetId = await ConnectionsSheetsService.getOrCreateConnectionsSheet(
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
        if (newStatus === 'accepted' && acceptorDid) {
          await ConnectionsSheetsService.addConnection(
            otherUserAccessToken,
            spreadsheetId,
            {
              connectionId,
              userDid: acceptorDid,
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
        otherUserDid,
        connectionId,
        newStatus,
        acceptorDid
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
    const otherUserFile = await this.getConnectionsFile(otherUserAccessToken, otherUserMetadataFolder);
    if (!otherUserFile) {
      console.log(`[updateOtherUserConnectionStatus] Connections file not found for ${otherUserDid}, creating new file`);
      // Create new file with the connection
      if (newStatus === 'accepted' && acceptorDid) {
        const now = new Date().toISOString();
        const newFile: ConnectionsFile = {
          identifier: otherUserDid,
          updatedAt: now,
          connections: [{
            connectionId,
            userDid: acceptorDid,
            status: 'accepted',
            createdAt: now,
            acceptedAt: now
          }],
          blocked: []
        };
        await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, otherUserDid, newFile);
        console.log(`[updateOtherUserConnectionStatus] Created new connections file for ${otherUserDid} with accepted connection to ${acceptorDid}`);
        return;
      }
      return; // Can't create connection without acceptorDid
    }

    const connection = otherUserFile.connections.find(c => c.connectionId === connectionId);
    if (!connection) {
      console.log(`[updateOtherUserConnectionStatus] Connection ${connectionId} not found in ${otherUserDid}'s file`);
      console.log(`[updateOtherUserConnectionStatus] Available connections:`, otherUserFile.connections.map(c => ({
        connectionId: c.connectionId,
        userDid: c.userDid,
        status: c.status
      })));
      
      // If accepting and we have acceptorDid, create the connection
      if (newStatus === 'accepted' && acceptorDid) {
        console.log(`[updateOtherUserConnectionStatus] Creating missing connection in ${otherUserDid}'s file`);
        const now = new Date().toISOString();
        otherUserFile.connections.push({
          connectionId,
          userDid: acceptorDid,
          status: 'accepted',
          createdAt: now,
          acceptedAt: now
        });
        otherUserFile.updatedAt = now;
        await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, otherUserDid, otherUserFile);
        console.log(`[updateOtherUserConnectionStatus] Successfully created connection in ${otherUserDid}'s file`);
        return;
      }
      
      console.warn(`[updateOtherUserConnectionStatus] Connection not found and cannot create (missing acceptorDid or wrong status)`);
      return; // Connection not found in their file
    }

    console.log(`[updateOtherUserConnectionStatus] Found connection in ${otherUserDid}'s file:`, {
      connectionId: connection.connectionId,
      userDid: connection.userDid,
      currentStatus: connection.status,
      newStatus
    });

    const now = new Date().toISOString();

    if (newStatus === 'accepted') {
      connection.status = 'accepted';
      connection.acceptedAt = now;
    } else if (newStatus === 'blocked') {
      connection.status = 'blocked';
      // Also add to blocked list
      if (!otherUserFile.blocked.includes(connection.userDid)) {
        otherUserFile.blocked.push(connection.userDid);
      }
    }

    otherUserFile.updatedAt = now;
    await this.updateConnectionsFile(otherUserAccessToken, otherUserMetadataFolder, otherUserDid, otherUserFile);
    console.log(`[updateOtherUserConnectionStatus] Successfully updated connection status to ${newStatus} in ${otherUserDid}'s file`);
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
    const connectionsFile = await this.getConnectionsFile(userAccessToken, userMetadataFolder);
    if (!connectionsFile) {
      return;
    }

    connectionsFile.connections = connectionsFile.connections.filter(c => c.connectionId !== connectionId);
    connectionsFile.updatedAt = new Date().toISOString();

    await this.updateConnectionsFile(userAccessToken, userMetadataFolder, userDid, connectionsFile);
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
      const spreadsheetId = await ConnectionsSheetsService.getOrCreateConnectionsSheet(
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
      const spreadsheetId = await ConnectionsSheetsService.getOrCreateConnectionsSheet(
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

