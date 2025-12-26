/**
 * Connection Service
 * Manages user connections (two-way mutually accepted connections)
 * Uses decentralized coordination when available, falls back to API
 */

import { PNOAuthService } from './pnOAuthService';
import * as decentralizedCoordination from './decentralizedCoordination';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
const USE_DECENTRALIZED = process.env.REACT_APP_USE_DECENTRALIZED === 'true'; // Default false - use Google Drive via API

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const session = PNOAuthService.loadSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  
  return headers;
}

export interface Connection {
  connectionId: string;
  userDid: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
}

export interface ConnectionStatus {
  status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked';
  connectionId?: string;
}

export interface PendingRequests {
  sent: Connection[];
  received: Connection[];
}

/**
 * Send connection request to another user
 * Uses decentralized coordination (IPFS + DID) when available
 */
export async function sendConnectionRequest(
  requesterDid: string,
  recipientDid: string
): Promise<Connection> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      const decentralizedConn = await decentralizedCoordination.sendConnectionRequest(
        requesterDid,
        recipientDid
      );
      
      // Convert to Connection format
      return {
        connectionId: decentralizedConn.connectionId,
        userDid: decentralizedConn.userDid,
        status: decentralizedConn.status,
        createdAt: decentralizedConn.createdAt,
        acceptedAt: decentralizedConn.acceptedAt
      };
    } catch (error) {
      console.warn('Decentralized connection request failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/request`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        requesterDid,
        recipientDid
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send connection request');
    }

    const result = await response.json();
    return result.connection;
  } catch (error) {
    console.error('Failed to send connection request:', error);
    throw error;
  }
}

/**
 * Accept connection request
 * Uses decentralized coordination when available
 */
export async function acceptConnectionRequest(
  connectionId: string,
  userDid: string
): Promise<void> {
  // Get other user DID from connection
  const pending = await getPendingRequests(userDid);
  const request = pending.received.find(r => r.connectionId === connectionId);
  
  if (!request) {
    throw new Error('Connection request not found');
  }
  
  // Extract other user DID - in received requests, the requester is the otherUserDid
  // We need to find the requester's DID from the connection
  let otherUserDid = '';
  
  // Try decentralized first to get the connection details
  if (USE_DECENTRALIZED) {
    try {
      // Get full connection details from decentralized storage
      const decentralizedPending = await decentralizedCoordination.getPendingRequests(userDid);
      const decentralizedRequest = decentralizedPending.received.find(
        r => r.connectionId === connectionId
      );
      
      if (decentralizedRequest) {
        // In received requests, userDid is the requester
        otherUserDid = decentralizedRequest.userDid;
        
        await decentralizedCoordination.acceptConnectionRequest(
          connectionId,
          userDid,
          otherUserDid
        );
        return;
      }
    } catch (error) {
      console.warn('Decentralized accept failed, falling back to API:', error);
    }
  }
  
  // If decentralized didn't work, try to extract from request
  // The request structure may vary, so we'll pass userDid as otherUserDid as fallback
  // This is a limitation - in full implementation, we'd fetch connection from IPFS
  if (!otherUserDid && request.userDid) {
    otherUserDid = request.userDid;
  }
  
  // Fallback to centralized API
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/${connectionId}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to accept connection request');
    }
  } catch (error) {
    console.error('Failed to accept connection request:', error);
    throw error;
  }
}

/**
 * Reject connection request
 */
export async function rejectConnectionRequest(
  connectionId: string,
  userDid: string
): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/${connectionId}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reject connection request');
    }
  } catch (error) {
    console.error('Failed to reject connection request:', error);
    throw error;
  }
}

/**
 * Get user's accepted connections
 * Uses decentralized coordination when available
 */
export async function getConnections(userDid: string): Promise<Connection[]> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      const decentralizedConns = await decentralizedCoordination.getConnections(userDid);
      return decentralizedConns.map(conn => ({
        connectionId: conn.connectionId,
        userDid: conn.userDid,
        status: conn.status as Connection['status'],
        createdAt: conn.createdAt,
        acceptedAt: conn.acceptedAt
      }));
    } catch (error) {
      console.warn('Decentralized get connections failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections?userDid=${userDid}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load connections');
    }

    const result = await response.json();
    return result.connections || [];
  } catch (error) {
    console.error('Failed to get connections:', error);
    return [];
  }
}

/**
 * Get pending connection requests (both sent and received)
 * Uses decentralized coordination when available
 */
export async function getPendingRequests(userDid: string): Promise<PendingRequests> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      const decentralized = await decentralizedCoordination.getPendingRequests(userDid);
      return {
        sent: decentralized.sent.map(conn => ({
          connectionId: conn.connectionId,
          userDid: conn.userDid,
          status: conn.status as Connection['status'],
          createdAt: conn.createdAt,
          acceptedAt: conn.acceptedAt
        })),
        received: decentralized.received.map(conn => ({
          connectionId: conn.connectionId,
          userDid: conn.userDid,
          status: conn.status as Connection['status'],
          createdAt: conn.createdAt,
          acceptedAt: conn.acceptedAt
        }))
      };
    } catch (error) {
      console.warn('Decentralized get pending requests failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/pending?userDid=${userDid}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load pending requests');
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get pending requests:', error);
    return { sent: [], received: [] };
  }
}

/**
 * Check connection status with another user
 * Uses decentralized coordination when available
 */
export async function getConnectionStatus(
  userDid: string,
  otherUserDid: string
): Promise<ConnectionStatus> {
  // Skip if it's a DID or public key (but still try decentralized)
  if (otherUserDid.startsWith('did:key:') && !USE_DECENTRALIZED) {
    return { status: 'not_connected' };
  }
  
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      const status = await decentralizedCoordination.getConnectionStatus(userDid, otherUserDid);
      return {
        status: status.status === 'connected' ? 'connected' :
                status.status === 'pending_sent' ? 'pending_sent' :
                status.status === 'pending_received' ? 'pending_received' :
                'not_connected',
        connectionId: status.connectionId
      };
    } catch (error) {
      console.warn('Decentralized connection status failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API
  try {
    if (otherUserDid.length > 200) {
      return { status: 'not_connected' };
    }

    const response = await fetch(
      `${API_ENDPOINT}/api/connections/${encodeURIComponent(otherUserDid)}/status?userDid=${encodeURIComponent(userDid)}`,
      {
        headers: getAuthHeaders()
      }
    );

    if (!response.ok) {
      return { status: 'not_connected' };
    }

    return await response.json();
  } catch (error) {
    // Silently return not_connected - connection status may not be available
    return { status: 'not_connected' };
  }
}

/**
 * Remove connection
 */
export async function removeConnection(
  connectionId: string,
  userDid: string
): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/${connectionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove connection');
    }
  } catch (error) {
    console.error('Failed to remove connection:', error);
    throw error;
  }
}

