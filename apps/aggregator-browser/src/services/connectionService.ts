/**
 * Connection Service
 * Manages user connections (two-way mutually accepted connections)
 * Uses Google Drive via API (no IPFS/decentralized coordination)
 */

import { PNOAuthService } from './pnOAuthService';
import { getUserProfile } from './profileService';
import { createKemSession } from './dmCryptoClient';
import { isDmIdentityReady } from './dmIdentitySession';
import { setMessageRootKey } from './dmSessionCache';
import { API_ENDPOINT } from '../config/api';

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
  userPnIdentifier: string;
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
  requesterPnIdentifier: string,
  recipientPnIdentifier: string
): Promise<Connection> {
  // Use Google Drive API directly (no IPFS)
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/request`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        requesterPnIdentifier,
        recipientPnIdentifier
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
  userPnIdentifier: string,
  requesterPnIdentifier: string
): Promise<void> {
  if (!isDmIdentityReady()) {
    throw new Error('Messaging keys unavailable. Lock and unlock your pN again to accept connections.');
  }
  const profile = await getUserProfile(requesterPnIdentifier);
  if (!profile.mlKemPublicKey) {
    throw new Error('Requester has no messaging public key on file');
  }
  const { kemCiphertext, messageRootKey } = createKemSession(profile.mlKemPublicKey);
  setMessageRootKey(connectionId, messageRootKey);

  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/${connectionId}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier,
        kemCiphertext,
        kemAlgId: 'ML-KEM-768'
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
  userPnIdentifier: string
): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/${connectionId}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier
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
export async function getConnections(userPnIdentifier: string): Promise<Connection[]> {
  // Use Google Drive API directly
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections?userPnIdentifier=${userPnIdentifier}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[getConnections] API returned ${response.status}:`, errorText);
      throw new Error(`Failed to load connections: ${response.status}`);
    }

    const result = await response.json();
    const connections = result.connections || [];
    return connections;
  } catch (error) {
    console.error('[getConnections] Failed to get connections:', error);
    return [];
  }
}

/**
 * Get pending connection requests (both sent and received)
 * Uses Google Drive via API
 */
export async function getPendingRequests(userPnIdentifier: string): Promise<PendingRequests> {
  // Use Google Drive API directly
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/pending?userPnIdentifier=${userPnIdentifier}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      if (response.status === 409 || response.status === 401) {
        return { sent: [], received: [] };
      }
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
  userPnIdentifier: string,
  otherUserPnIdentifier: string
): Promise<ConnectionStatus> {
  // Use Google Drive API directly
  try {
    if (otherUserPnIdentifier.length > 200) {
      return { status: 'not_connected' };
    }

    const response = await fetch(
      `${API_ENDPOINT}/api/connections/${encodeURIComponent(otherUserPnIdentifier)}/status?userPnIdentifier=${encodeURIComponent(userPnIdentifier)}`,
      {
        headers: getAuthHeaders()
      }
    );

    if (!response.ok) {
      // Log error for debugging, but still return not_connected
      if (response.status === 401 || response.status === 500) {
        console.warn(`[getConnectionStatus] API returned ${response.status} for ${otherUserPnIdentifier}`);
      }
      return { status: 'not_connected' };
    }

    return await response.json();
  } catch (error) {
    // Log error for debugging, but still return not_connected
    console.warn('[getConnectionStatus] Failed to check connection status:', error);
    return { status: 'not_connected' };
  }
}

/**
 * Remove connection
 */
export async function removeConnection(
  connectionId: string,
  userPnIdentifier: string
): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/connections/${connectionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier
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

