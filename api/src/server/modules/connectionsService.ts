/**
 * Connections Service
 * Manages user connections stored on Google Drive
 * Each user stores their connections in connections.json in their _metadata folder
 */

export interface Connection {
  connectionId: string;
  userDid: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
}

export interface ConnectionsFile {
  identifier: string;
  updatedAt: string;
  connections: Connection[];
  blocked: string[]; // Array of blocked user DIDs
}

export class ConnectionsService {
  private static readonly CONNECTIONS_FILE_NAME = 'connections.json';

  /**
   * Get connections file from user's Google Drive
   */
  static async getConnectionsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<ConnectionsFile | null> {
    try {
      // Search for connections.json in metadata folder
      const searchQuery = `name='${this.CONNECTIONS_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok || searchResponse.status === 404) {
        return null;
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      
      if (!searchData.files || searchData.files.length === 0) {
        return null;
      }

      // Download connections file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        return await getResponse.json() as ConnectionsFile;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting connections file:', error);
      return null;
    }
  }

  /**
   * Create or update connections file
   */
  static async updateConnectionsFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    connectionsData: ConnectionsFile
  ): Promise<void> {
    const connectionsContent = JSON.stringify(connectionsData, null, 2);

    try {
      // Search for existing connections.json
      const searchQuery = `name='${this.CONNECTIONS_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
        
        if (searchData.files && searchData.files.length > 0) {
          // Update existing file
          const fileId = searchData.files[0].id;
          await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: connectionsContent
          });
          return;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.CONNECTIONS_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="connections.json"',
        'Content-Type: application/json',
        '',
        connectionsContent,
        `--${boundary}--`
      ].join('\r\n');

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
    } catch (error) {
      console.error('Error updating connections file:', error);
      throw error;
    }
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
   */
  static async getConnectionStatus(
    user1AccessToken: string,
    user1MetadataFolder: string,
    user1Did: string,
    user2Did: string
  ): Promise<{ status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked'; connectionId?: string }> {
    const connectionsFile = await this.getConnectionsFile(user1AccessToken, user1MetadataFolder);
    
    if (!connectionsFile) {
      return { status: 'not_connected' };
    }

    // Check if user2 is blocked
    if (connectionsFile.blocked.includes(user2Did)) {
      return { status: 'blocked' };
    }

    // Find connection with user2
    const connection = connectionsFile.connections.find(c => c.userDid === user2Did);
    
    if (!connection) {
      return { status: 'not_connected' };
    }

    return {
      status: connection.status === 'accepted' ? 'connected' : connection.status,
      connectionId: connection.connectionId
    };
  }

  /**
   * Send connection request (adds to both users' files)
   */
  static async sendConnectionRequest(
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

    // Remove existing connection if any
    requesterFile.connections = requesterFile.connections.filter(c => c.userDid !== recipientDid);
    
    // Add new connection request
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

    // Remove existing connection if any (check both normalized and original DID formats)
    recipientFile.connections = recipientFile.connections.filter(c => {
      const normalizedC = c.userDid.startsWith('pn-') ? c.userDid : `pn-${c.userDid}`;
      const normalizedRequester = requesterDid.startsWith('pn-') ? requesterDid : `pn-${requesterDid}`;
      return normalizedC !== normalizedRequester && c.userDid !== requesterDid;
    });
    
    // Add new connection request
    const recipientConnection: Connection = {
      connectionId,
      userDid: requesterDid,
      status: 'pending_received',
      createdAt: now
    };
    recipientFile.connections.push(recipientConnection);
    recipientFile.updatedAt = now;

    console.log(`[ConnectionsService] Updating recipient's connections file:`, {
      recipientDid,
      connectionId,
      requesterDid,
      status: recipientConnection.status,
      totalConnections: recipientFile.connections.length
    });

    try {
      await this.updateConnectionsFile(recipientAccessToken, recipientMetadataFolder, recipientDid, recipientFile);
      console.log(`[ConnectionsService] Successfully updated recipient's connections file`);
    } catch (updateError: any) {
      console.error(`[ConnectionsService] ERROR: Failed to update recipient's connections file:`, updateError);
      throw new Error(`Failed to save connection request to recipient's file: ${updateError.message || updateError}`);
    }

    // Verify the update was successful
    try {
      const verifyFile = await this.getConnectionsFile(recipientAccessToken, recipientMetadataFolder);
      if (verifyFile) {
        const verifyConnection = verifyFile.connections.find(c => c.connectionId === connectionId);
        if (!verifyConnection) {
          console.error(`[ConnectionsService] WARNING: Connection ${connectionId} not found in recipient's file after update!`);
          console.error(`[ConnectionsService] Recipient's file contents:`, JSON.stringify(verifyFile, null, 2));
          throw new Error(`Connection was not saved to recipient's file`);
        } else if (verifyConnection.status !== 'pending_received') {
          console.error(`[ConnectionsService] WARNING: Connection ${connectionId} has wrong status: ${verifyConnection.status}, expected pending_received`);
          console.error(`[ConnectionsService] Connection details:`, JSON.stringify(verifyConnection, null, 2));
          throw new Error(`Connection saved with wrong status: ${verifyConnection.status}, expected pending_received`);
        } else {
          console.log(`[ConnectionsService] Verified: Connection ${connectionId} correctly saved with status pending_received`);
        }
      } else {
        console.error(`[ConnectionsService] WARNING: Could not verify recipient's file - file not found after update`);
        throw new Error(`Recipient's connections file not found after update`);
      }
    } catch (verifyError: any) {
      console.error(`[ConnectionsService] Verification failed:`, verifyError);
      // Don't throw here - the update might have succeeded but verification failed due to timing
      // But log it so we can see what's happening
    }

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
   */
  static async acceptConnectionRequest(
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
   * Update connection status in other user's file (requires both access tokens)
   * Also creates the connection if it doesn't exist (for mutual request scenarios)
   */
  static async updateOtherUserConnectionStatus(
    otherUserAccessToken: string,
    otherUserMetadataFolder: string,
    otherUserDid: string,
    connectionId: string,
    newStatus: 'accepted' | 'blocked',
    acceptorDid?: string // The DID of the user who accepted (to create connection if missing)
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
   */
  static async getConnections(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Connection[]> {
    const connectionsFile = await this.getConnectionsFile(accessToken, metadataFolderId);
    if (!connectionsFile) {
      console.log(`[ConnectionsService.getConnections] Connections file not found`);
      return [];
    }

    const allConnections = connectionsFile.connections || [];
    const acceptedConnections = allConnections.filter(c => c.status === 'accepted');
    
    console.log(`[ConnectionsService.getConnections] Total connections: ${allConnections.length}, Accepted: ${acceptedConnections.length}`);
    console.log(`[ConnectionsService.getConnections] Connection statuses:`, 
      allConnections.map(c => ({ connectionId: c.connectionId, userDid: c.userDid, status: c.status }))
    );

    return acceptedConnections;
  }

  /**
   * Get pending requests (both sent and received)
   */
  static async getPendingRequests(
    accessToken: string,
    metadataFolderId: string
  ): Promise<{ sent: Connection[]; received: Connection[] }> {
    const connectionsFile = await this.getConnectionsFile(accessToken, metadataFolderId);
    if (!connectionsFile) {
      return { sent: [], received: [] };
    }

    const sent = connectionsFile.connections.filter(c => c.status === 'pending_sent');
    const received = connectionsFile.connections.filter(c => c.status === 'pending_received');

    return { sent, received };
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

