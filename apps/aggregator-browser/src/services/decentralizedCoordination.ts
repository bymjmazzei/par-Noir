/**
 * Decentralized Coordination Service
 * Handles social coordination (connections, messaging) using IPFS + DID documents
 * Eliminates need for centralized API server for coordination
 */

import { ipfsService } from './ipfsService';

// Simple DID Document storage using IndexedDB
class DIDDocumentManager {
  private dbName = 'DIDDocuments';
  private version = 1;

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getDidDocument(did: string): Promise<any | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const transaction = db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.get(did);
        
        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.document : null);
        };
        
        request.onerror = () => resolve(null);
      });
    } catch (error) {
      return null;
    }
  }

  async updateDidDocument(did: string, updates: Partial<any>): Promise<any | null> {
    try {
      const existing = await this.getDidDocument(did);
      if (!existing) {
        // Create new document if doesn't exist
        const newDoc = {
          '@context': ['https://www.w3.org/ns/did/v1'],
          id: did,
          service: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          ...updates
        };
        await this.storeDidDocument(did, newDoc);
        return newDoc;
      }

      const updated = {
        ...existing,
        ...updates,
        updated: new Date().toISOString()
      };

      await this.storeDidDocument(did, updated);
      return updated;
    } catch (error) {
      return null;
    }
  }

  private async storeDidDocument(did: string, document: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.put({ id: did, document, timestamp: Date.now() });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const didDocumentManager = new DIDDocumentManager();

export interface DecentralizedConnection {
  connectionId: string;
  userPnIdentifier: string;
  otherUserPnIdentifier: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
  cid?: string; // IPFS CID where connection is stored
}

export interface DecentralizedMessage {
  messageId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  mediaFileId?: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
  encrypted: boolean;
  cid?: string; // IPFS CID for offline delivery
}

/**
 * Send connection request - stores in IPFS and updates DID document
 */
export async function sendConnectionRequest(
  requesterPnIdentifier: string,
  recipientPnIdentifier: string
): Promise<DecentralizedConnection> {
  try {
    const connectionRequest: DecentralizedConnection = {
      connectionId: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userPnIdentifier: requesterPnIdentifier,
      otherUserPnIdentifier: recipientPnIdentifier,
      status: 'pending_sent',
      createdAt: new Date().toISOString()
    };

    // Store connection request in IPFS
    const cid = await ipfsService.uploadToIPFS(JSON.stringify(connectionRequest));
    connectionRequest.cid = cid;

    // Update requester's DID document with outgoing connection
    // Note: DID document uses DID format, but we store pn identifier in connection data
    const requesterDoc = await didDocumentManager.getDidDocument(requesterPnIdentifier);
    if (requesterDoc) {
      const connectionService = requesterDoc.service?.find(s => s.id === '#connections') || {
        id: `${requesterPnIdentifier}#connections`,
        type: 'Connections',
        serviceEndpoint: `ipfs://connections/${requesterPnIdentifier}`
      };

      // Add outgoing connection CID
      const outgoingConnections = (connectionService as any).outgoingConnections || [];
      outgoingConnections.push({
        connectionId: connectionRequest.connectionId,
        recipientPnIdentifier,
        cid,
        timestamp: connectionRequest.createdAt
      });

      await didDocumentManager.updateDidDocument(requesterPnIdentifier, {
        service: [
          ...(requesterDoc.service || []).filter(s => s.id !== '#connections'),
          {
            ...connectionService,
            id: `${requesterPnIdentifier}#connections`,
            type: 'Connections',
            serviceEndpoint: `ipfs://connections/${requesterPnIdentifier}`,
            outgoingConnections
          }
        ]
      });
    }

    // Update recipient's DID document with incoming connection
    const recipientDoc = await didDocumentManager.getDidDocument(recipientPnIdentifier);
    if (recipientDoc) {
      const connectionService = recipientDoc.service?.find(s => s.id === '#connections') || {
        id: `${recipientPnIdentifier}#connections`,
        type: 'Connections',
        serviceEndpoint: `ipfs://connections/${recipientPnIdentifier}`
      };

      // Add incoming connection CID
      const incomingConnections = (connectionService as any).incomingConnections || [];
      incomingConnections.push({
        connectionId: connectionRequest.connectionId,
        requesterPnIdentifier,
        cid,
        timestamp: connectionRequest.createdAt
      });

      await didDocumentManager.updateDidDocument(recipientPnIdentifier, {
        service: [
          ...(recipientDoc.service || []).filter(s => s.id !== '#connections'),
          {
            ...connectionService,
            id: `${recipientPnIdentifier}#connections`,
            type: 'Connections',
            serviceEndpoint: `ipfs://connections/${recipientPnIdentifier}`,
            incomingConnections
          }
        ]
      });
    }

    return connectionRequest;
  } catch (error) {
    console.error('Failed to send connection request:', error);
    throw error;
  }
}

/**
 * Accept connection request - updates both DID documents
 */
export async function acceptConnectionRequest(
  connectionId: string,
  userPnIdentifier: string,
  otherUserPnIdentifier: string
): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Update user's DID document - mark connection as accepted
    const userDoc = await didDocumentManager.getDidDocument(userPnIdentifier);
    if (userDoc) {
      const connectionService = userDoc.service?.find(s => s.id === '#connections');
      if (connectionService) {
        const incomingConnections = ((connectionService as any).incomingConnections || [])
          .map((conn: any) => {
            if (conn.connectionId === connectionId) {
              return { ...conn, status: 'accepted', acceptedAt: now };
            }
            return conn;
          });

        const acceptedConnections = ((connectionService as any).acceptedConnections || []);
        const acceptedConn = incomingConnections.find((conn: any) => conn.connectionId === connectionId);
        if (acceptedConn) {
          acceptedConnections.push({
            ...acceptedConn,
            otherUserPnIdentifier,
            acceptedAt: now
          });
        }

        await didDocumentManager.updateDidDocument(userPnIdentifier, {
          service: [
            ...(userDoc.service || []).filter(s => s.id !== '#connections'),
            {
              ...connectionService,
              acceptedConnections
            }
          ]
        });
      }
    }

    // Update other user's DID document - mark their outgoing as accepted
    const otherUserDoc = await didDocumentManager.getDidDocument(otherUserPnIdentifier);
    if (otherUserDoc) {
      const connectionService = otherUserDoc.service?.find(s => s.id === '#connections');
      if (connectionService) {
        const outgoingConnections = ((connectionService as any).outgoingConnections || [])
          .map((conn: any) => {
            if (conn.connectionId === connectionId) {
              return { ...conn, status: 'accepted', acceptedAt: now };
            }
            return conn;
          });

        const acceptedConnections = ((connectionService as any).acceptedConnections || []);
        const acceptedConn = outgoingConnections.find((conn: any) => conn.connectionId === connectionId);
        if (acceptedConn) {
          acceptedConnections.push({
            ...acceptedConn,
            otherUserPnIdentifier: userPnIdentifier,
            acceptedAt: now
          });
        }

        await didDocumentManager.updateDidDocument(otherUserPnIdentifier, {
          service: [
            ...(otherUserDoc.service || []).filter(s => s.id !== '#connections'),
            {
              ...connectionService,
              acceptedConnections
            }
          ]
        });
      }
    }
  } catch (error) {
    console.error('Failed to accept connection request:', error);
    throw error;
  }
}

/**
 * Get pending connection requests from DID document
 */
export async function getPendingRequests(userPnIdentifier: string): Promise<{
  sent: DecentralizedConnection[];
  received: DecentralizedConnection[];
}> {
  try {
    const userDoc = await didDocumentManager.getDidDocument(userPnIdentifier);
    if (!userDoc) {
      return { sent: [], received: [] };
    }

    const connectionService = userDoc.service?.find(s => s.id === '#connections');
    if (!connectionService) {
      return { sent: [], received: [] };
    }

    const sent: DecentralizedConnection[] = [];
    const received: DecentralizedConnection[] = [];

    // Fetch sent connections from IPFS
    const outgoingConnections = (connectionService as any).outgoingConnections || [];
    for (const conn of outgoingConnections) {
      if (conn.cid) {
        try {
          const data = await ipfsService.downloadFromIPFS(conn.cid);
          const connection: DecentralizedConnection = JSON.parse(data);
          if (connection.status === 'pending_sent') {
            sent.push(connection);
          }
        } catch (error) {
          // Skip failed fetches
        }
      }
    }

    // Fetch received connections from IPFS
    const incomingConnections = (connectionService as any).incomingConnections || [];
    for (const conn of incomingConnections) {
      if (conn.cid) {
        try {
          const data = await ipfsService.downloadFromIPFS(conn.cid);
          const connection: DecentralizedConnection = JSON.parse(data);
          if (connection.status === 'pending_sent') {
            // Mark as pending_received from recipient's perspective
            connection.status = 'pending_received';
            received.push(connection);
          }
        } catch (error) {
          // Skip failed fetches
        }
      }
    }

    return { sent, received };
  } catch (error) {
    console.error('Failed to get pending requests:', error);
    return { sent: [], received: [] };
  }
}

/**
 * Get accepted connections from DID document
 */
export async function getConnections(userPnIdentifier: string): Promise<DecentralizedConnection[]> {
  try {
    const userDoc = await didDocumentManager.getDidDocument(userPnIdentifier);
    if (!userDoc) {
      return [];
    }

    const connectionService = userDoc.service?.find(s => s.id === '#connections');
    if (!connectionService) {
      return [];
    }

    const acceptedConnections = (connectionService as any).acceptedConnections || [];
    const connections: DecentralizedConnection[] = [];

    // Resolve connection details from CIDs if available
    for (const conn of acceptedConnections) {
      if (conn.cid) {
        try {
          const data = await ipfsService.downloadFromIPFS(conn.cid);
          const connection: DecentralizedConnection = JSON.parse(data);
          connection.status = 'accepted';
          if (conn.acceptedAt) {
            connection.acceptedAt = conn.acceptedAt;
          }
          connections.push(connection);
        } catch (error) {
          // Create connection object from metadata if CID fetch fails
          connections.push({
            connectionId: conn.connectionId,
            userPnIdentifier,
            otherUserPnIdentifier: conn.otherUserPnIdentifier,
            status: 'accepted',
            createdAt: conn.timestamp || new Date().toISOString(),
            acceptedAt: conn.acceptedAt
          });
        }
      } else {
        // Use metadata directly if no CID
        connections.push({
          connectionId: conn.connectionId,
          userPnIdentifier,
          otherUserPnIdentifier: conn.otherUserPnIdentifier,
          status: 'accepted',
          createdAt: conn.timestamp || new Date().toISOString(),
          acceptedAt: conn.acceptedAt
        });
      }
    }

    return connections;
  } catch (error) {
    console.error('Failed to get connections:', error);
    return [];
  }
}

/**
 * Check connection status with another user
 */
export async function getConnectionStatus(
  userPnIdentifier: string,
  otherUserPnIdentifier: string
): Promise<{
  status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked';
  connectionId?: string;
}> {
  try {
    const pendingRequests = await getPendingRequests(userPnIdentifier);
    
    // Check received requests
    const received = pendingRequests.received.find(
      conn => (conn.userPnIdentifier && conn.userPnIdentifier === otherUserPnIdentifier) || (conn.otherUserPnIdentifier && conn.otherUserPnIdentifier === otherUserPnIdentifier)
    );
    if (received) {
      return {
        status: 'pending_received',
        connectionId: received.connectionId
      };
    }

    // Check sent requests
    const sent = pendingRequests.sent.find(
      conn => (conn.userPnIdentifier && conn.userPnIdentifier === otherUserPnIdentifier) || (conn.otherUserPnIdentifier && conn.otherUserPnIdentifier === otherUserPnIdentifier)
    );
    if (sent) {
      return {
        status: 'pending_sent',
        connectionId: sent.connectionId
      };
    }

    // Check accepted connections
    const connections = await getConnections(userPnIdentifier);
    const connected = connections.find(
      conn => (conn.userPnIdentifier && conn.userPnIdentifier === otherUserPnIdentifier) || (conn.otherUserPnIdentifier && conn.otherUserPnIdentifier === otherUserPnIdentifier)
    );
    if (connected) {
      return {
        status: 'connected',
        connectionId: connected.connectionId
      };
    }

    return { status: 'not_connected' };
  } catch (error) {
    return { status: 'not_connected' };
  }
}

