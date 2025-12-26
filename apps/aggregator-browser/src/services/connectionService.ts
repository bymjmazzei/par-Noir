/**
 * Connection Service
 * Manages user connections (two-way mutually accepted connections)
 * Uses Google Drive via API (no IPFS/decentralized coordination)
 */

import { PNOAuthService } from './pnOAuthService';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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
 * Uses Google Drive via API (no IPFS)
 */
export async function sendConnectionRequest(
  requesterDid: string,
  recipientDid: string
): Promise<Connection> {
  // Use Google Drive API directly (no IPFS)
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
      let errorMessage = 'Failed to send connection request';
      try {
        const error = await response.json();
        errorMessage = error.error || error.error_description || errorMessage;
        if (error.details) {
          errorMessage += ` - ${error.details}`;
        }
        console.error('Connection request API error:', error);
      } catch (e) {
        const errorText = await response.text().catch(() => 'Unknown error');
        errorMessage = `HTTP ${response.status}: ${errorText}`;
        console.error('Connection request API error (non-JSON):', response.status, errorText);
      }
      throw new Error(errorMessage);
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
 * Uses Google Drive via API
 */
export async function acceptConnectionRequest(
  connectionId: string,
  userDid: string
): Promise<void> {
  // Use Google Drive API directly
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/${connectionId}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid
      })
    });

    if (!response.ok) {
      let errorMessage = 'Failed to accept connection request';
      try {
        const error = await response.json();
        errorMessage = error.error || error.error_description || errorMessage;
        if (error.details) {
          errorMessage += ` - ${error.details}`;
        }
        console.error('Accept connection request API error:', error);
      } catch (e) {
        const errorText = await response.text().catch(() => 'Unknown error');
        errorMessage = `HTTP ${response.status}: ${errorText}`;
        console.error('Accept connection request API error (non-JSON):', response.status, errorText);
      }
      throw new Error(errorMessage);
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
      let errorMessage = 'Failed to reject connection request';
      try {
        const error = await response.json();
        errorMessage = error.error || error.error_description || errorMessage;
        if (error.details) {
          errorMessage += ` - ${error.details}`;
        }
        console.error('Reject connection request API error:', error);
      } catch (e) {
        const errorText = await response.text().catch(() => 'Unknown error');
        errorMessage = `HTTP ${response.status}: ${errorText}`;
        console.error('Reject connection request API error (non-JSON):', response.status, errorText);
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('Failed to reject connection request:', error);
    throw error;
  }
}

/**
 * Get user's accepted connections
 * Uses Google Drive via API
 */
export async function getConnections(userDid: string): Promise<Connection[]> {
  // Use Google Drive API directly
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
 * Uses Google Drive via API
 */
export async function getPendingRequests(userDid: string): Promise<PendingRequests> {
  // Use Google Drive API directly
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
 * Uses Google Drive via API
 */
export async function getConnectionStatus(
  userDid: string,
  otherUserDid: string
): Promise<ConnectionStatus> {
  // Use Google Drive API directly
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

