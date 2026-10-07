/**
 * Connection Service
 * Manages user connections (two-way mutually accepted connections)
 * Uses Google Drive via API (no IPFS/decentralized coordination)
 */

import { waitForOwnerCloudAccess } from './ownerApiHeaders';
import { ownerFetch } from './ownerApiFetch';
import { getUserProfile } from './profileService';
import { createKemSession, wrapAcceptorMessageRootKey } from './dmCryptoClient';
import { getMessagingMlKemPublicKey, getDmIdentity, isDmIdentityReady } from './dmIdentitySession';
import { notifyMessagingInboxRefresh, refreshMessagingInbox } from './messageService';
import { API_ENDPOINT } from '../config/api';
import { ensureMailboxRouteKey } from '@par-noir/device-cloud-credentials';
import { sealSocialEnvelope } from '@par-noir/dm-crypto';
import { PNOAuthService } from './pnOAuthService';
import {
  cachePeerMailboxRouteKey,
  clearPeerMailboxRouteKeyCache
} from './peerMailboxRouteCache';
import {
  createConnectionsClient,
  normalizePnId,
  type Connection,
  type ConnectionStatus,
  type PendingRequests,
  LEGACY_CONNECTION_REQUEST_KEY_MESSAGE
} from '@par-noir/social-connections';

export type { Connection, ConnectionStatus, PendingRequests };
export { LEGACY_CONNECTION_REQUEST_KEY_MESSAGE };

const connectionsClient = createConnectionsClient({
  waitForCloud: waitForOwnerCloudAccess,
  listConnectionRows: async (userPnIdentifier) => {
    const { listDeviceConnections } = await import('@par-noir/device-cloud-credentials');
    const { sessionDriveFor } = await import('./sessionDrive');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.connections;
    if (!sheetId) return [];
    return (await listDeviceConnections(drive.accessToken, sheetId)) as Connection[];
  },
  onAcceptedRowsLoaded: (connections) => {
    for (const row of connections) {
      if (row.peerMailboxRouteKey && /^[a-f0-9]{64}$/i.test(row.peerMailboxRouteKey)) {
        cachePeerMailboxRouteKey({
          connectionId: row.connectionId,
          peerPnIdentifier: row.userPnIdentifier,
          peerMailboxRouteKey: row.peerMailboxRouteKey.trim()
        });
      }
    }
  }
});

/**
 * Send connection request to another user
 * Uses Google Drive via API (no IPFS)
 */
export async function sendConnectionRequest(
  requesterPnIdentifier: string,
  recipientPnIdentifier: string
): Promise<Connection> {
  if (!isDmIdentityReady()) {
    throw new Error(
      'Messaging keys unavailable. Lock and unlock your pN before sending connection requests.'
    );
  }
  const mlKemPublicKey = getMessagingMlKemPublicKey();
  if (!mlKemPublicKey) {
    throw new Error('Messaging public key missing. Lock and unlock your pN again.');
  }

  const identity = getDmIdentity();
  const session = PNOAuthService.loadSession();
  if (!session?.accessToken) {
    throw new Error('Not authenticated. Unlock before sending a connection request.');
  }
  const mailboxRouteKey = await ensureMailboxRouteKey(
    requesterPnIdentifier,
    {
      sessionId: requesterPnIdentifier,
      pnName: identity.pnName || 'browser-mailbox',
      passcode: identity.mlKemSecretKey
    },
    {
      apiBaseUrl: API_ENDPOINT,
      authToken: session.accessToken,
      pnIdentifier: requesterPnIdentifier
    }
  );

  // The mailbox strips clear pn fields from durable rows, so who this is from
  // and the key to answer it are sealed to the recipient's published ML-KEM key.
  // Without it their device receives a job it cannot attribute.
  const recipientProfile = await getUserProfile(recipientPnIdentifier);
  if (!recipientProfile?.mlKemPublicKey) {
    throw new Error(
      'This user has not published messaging keys yet. Ask them to unlock their pN once.'
    );
  }
  const envelopeContext = `connect:${requesterPnIdentifier}:${recipientPnIdentifier}`;
  const connectionId = `conn_${Date.now().toString(36)}`;
  const createdAt = new Date().toISOString();
  const recipientEnvelope = await sealSocialEnvelope(
    recipientProfile.mlKemPublicKey,
    envelopeContext,
    {
      peerPnIdentifier: requesterPnIdentifier,
      peerMlKemPublicKey: mlKemPublicKey,
      peerMailboxRouteKey: mailboxRouteKey,
      connectionId,
      createdAt
    }
  );

  try {
    const { upsertDeviceConnection } = await import('@par-noir/device-cloud-credentials');
    const { sessionDriveFor } = await import('./sessionDrive');
    const drive = await sessionDriveFor(requesterPnIdentifier);
    const sheetId = drive.index.sheetIds.connections;
    if (sheetId) {
      await upsertDeviceConnection(drive.accessToken, sheetId, {
        connectionId,
        userPnIdentifier: recipientPnIdentifier,
        status: 'pending_sent',
        createdAt,
        peerMailboxRouteKey: mailboxRouteKey,
      });
    }
    const requestBody: Record<string, unknown> = {
      requesterPnIdentifier,
      recipientPnIdentifier,
      requesterMlKemPublicKey: mlKemPublicKey,
      requesterMailboxRouteKey: mailboxRouteKey,
      recipientEnvelope,
      envelopeContext,
      deviceCloudResult: {
        spreadsheetId: sheetId,
        provider: 'google',
        connectionId,
        peerPnIdentifier: recipientPnIdentifier,
      },
    };
    const response = await ownerFetch(
      'POST',
      '/api/connections/request',
      requestBody,
      { pnIdentifier: requesterPnIdentifier }
    );

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
    if (result?.delivered === false) {
      throw new Error(
        result.error_description ||
          'Recipient inbox is not ready. Ask them to unlock messaging once, then Connect again.'
      );
    }
    invalidateConnectionsCache(requesterPnIdentifier);
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
  requesterPnIdentifier: string,
  requesterMlKemPublicKey?: string,
  channelClientId: string = 'platform'
): Promise<void> {
  if (!isDmIdentityReady()) {
    throw new Error('Messaging keys unavailable. Lock and unlock your pN again to accept connections.');
  }

  let kemPk = requesterMlKemPublicKey;
  if (!kemPk) {
    const pending = await getPendingRequests(userPnIdentifier);
    const pendingRow = pending.received.find((r) => r.connectionId === connectionId);
    kemPk = pendingRow?.peerMlKemPublicKey;
  }
  if (!kemPk && requesterPnIdentifier) {
    const profile = await getUserProfile(requesterPnIdentifier);
    kemPk = profile.mlKemPublicKey ?? undefined;
  }
  if (!kemPk) {
    throw new Error(LEGACY_CONNECTION_REQUEST_KEY_MESSAGE);
  }

  const { kemCiphertext, messageRootKey } = createKemSession(kemPk);
  const wrappedMessageRootKey = await wrapAcceptorMessageRootKey(messageRootKey, connectionId);

  const identity = getDmIdentity();
  const session = PNOAuthService.loadSession();
  if (!session?.accessToken) {
    throw new Error('Not authenticated. Unlock before accepting a connection request.');
  }
  const mailboxRouteKey = await ensureMailboxRouteKey(
    userPnIdentifier,
    {
      sessionId: userPnIdentifier,
      pnName: identity.pnName || 'browser-mailbox',
      passcode: identity.mlKemSecretKey
    },
    {
      apiBaseUrl: API_ENDPOINT,
      authToken: session.accessToken,
      pnIdentifier: userPnIdentifier
    }
  );

  try {
    const { listDeviceConnections, upsertDeviceConnection } = await import('@par-noir/device-cloud-credentials');
    const { sessionDriveFor } = await import('./sessionDrive');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.connections;
    const existing = sheetId
      ? (await listDeviceConnections(drive.accessToken, sheetId)).find((row) => row.connectionId === connectionId)
      : undefined;
    const peerPn = requesterPnIdentifier.startsWith('pn-')
      ? requesterPnIdentifier
      : `pn-${requesterPnIdentifier}`;
    if (sheetId) {
      await upsertDeviceConnection(drive.accessToken, sheetId, {
        connectionId,
        userPnIdentifier: existing?.userPnIdentifier || peerPn,
        status: 'accepted',
        createdAt: existing?.createdAt || new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
        peerMlKemPublicKey: kemPk,
        kemCiphertext,
        peerMailboxRouteKey: existing?.peerMailboxRouteKey,
      });
    }
    let conversationSpreadsheetId = '';
    if (drive.index.messagesFolderId) {
      const { deviceDriveCall } = await import('@par-noir/device-cloud-credentials');
      const created = await deviceDriveCall(
        'POST',
        '/api/drive/native',
        {
          fileName: `dm-${connectionId}`,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [drive.index.messagesFolderId],
        },
        { accessToken: drive.accessToken }
      );
      if (created.ok) {
        const createdBody = (await created.json()) as { file?: { id?: string } };
        conversationSpreadsheetId = createdBody.file?.id || '';
      }
    }
    if (conversationSpreadsheetId && drive.index.inboxSheetId) {
      const { upsertDeviceInboxThread } = await import('@par-noir/device-cloud-credentials');
      await upsertDeviceInboxThread(drive.accessToken, drive.index.inboxSheetId, {
        threadType: 'dm',
        participantPnIdentifier: peerPn,
        spreadsheetId: conversationSpreadsheetId,
        connectionId,
        lastMessageAt: new Date().toISOString(),
        kemCiphertext,
        wrappedMessageRootKey,
      });
    }
    const response = await ownerFetch(
      'POST',
      `/api/connections/${connectionId}/accept`,
      {
        userPnIdentifier,
        kemCiphertext,
        wrappedMessageRootKey,
        kemAlgId: 'ML-KEM-768',
        acceptorMailboxRouteKey: mailboxRouteKey,
        channelClientId,
        peerPnIdentifier: peerPn,
        conversationSpreadsheetId,
        deviceCloudResult: {
          spreadsheetId: sheetId,
          provider: 'google',
          peerPnIdentifier: peerPn,
        },
      },
      { pnIdentifier: userPnIdentifier }
    );

    const result = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
      let errorMessage = 'Failed to accept connection request';
      errorMessage =
        (typeof result.error_description === 'string' && result.error_description) ||
        (typeof result.error === 'string' && result.error) ||
        errorMessage;
      if (typeof result.details === 'string') {
        errorMessage += ` - ${result.details}`;
      }
      console.error('Accept connection request API error:', result);
      throw new Error(errorMessage);
    }
    if (result?.delivered === false) {
      throw new Error(
        (typeof result.error_description === 'string' && result.error_description) ||
          'Accept did not reach their inbox. Ask them to unlock messaging once, then try again.'
      );
    }
    invalidateConnectionsCache(userPnIdentifier);
    try {
      await refreshMessagingInbox(userPnIdentifier);
    } catch {
      notifyMessagingInboxRefresh();
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
    const { listDeviceConnections, upsertDeviceConnection } = await import('@par-noir/device-cloud-credentials');
    const { sessionDriveFor } = await import('./sessionDrive');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.connections;
    const existing = sheetId
      ? (await listDeviceConnections(drive.accessToken, sheetId)).find((row) => row.connectionId === connectionId)
      : undefined;
    if (sheetId && existing) {
      await upsertDeviceConnection(drive.accessToken, sheetId, { ...existing, status: 'blocked' });
    }
    const response = await ownerFetch(
      'POST',
      `/api/connections/${connectionId}/reject`,
      {
        userPnIdentifier,
        peerPnIdentifier: existing?.userPnIdentifier,
        deviceCloudResult: {
          spreadsheetId: sheetId,
          provider: 'google',
          peerPnIdentifier: existing?.userPnIdentifier,
        },
      },
      { pnIdentifier: userPnIdentifier }
    );

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
    invalidateConnectionsCache(userPnIdentifier);
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
  try {
    return await connectionsClient.getConnections(userPnIdentifier);
  } catch (error) {
    console.error('[getConnections] Failed to get connections:', error);
    return [];
  }
}

/**
 * Get pending connection requests (both sent and received)
 * Uses Google Drive via API
 */
const pendingRequestsInflight = new Map<string, Promise<PendingRequests>>();

export function invalidateConnectionsCache(pnIdentifier?: string): void {
  connectionsClient.invalidateConnectionsCache(pnIdentifier);
  if (!pnIdentifier) {
    clearPeerMailboxRouteKeyCache();
  }
}

/** Warm connections list after cloud unlock (single GET, cached). */
export function prefetchConnectionsList(userPnIdentifier: string): Promise<Connection[]> {
  return connectionsClient.prefetchConnectionsList(userPnIdentifier);
}

/**
 * Resolve status from cached connections list; falls back to per-peer status API.
 */
export async function resolveConnectionStatusFromCache(
  userPnIdentifier: string,
  otherUserPnIdentifier: string
): Promise<ConnectionStatus> {
  const fromCache = await connectionsClient.resolveConnectionStatusFromCache(
    userPnIdentifier,
    otherUserPnIdentifier
  );
  if (fromCache.status !== 'not_connected') return fromCache;
  return getConnectionStatus(userPnIdentifier, otherUserPnIdentifier);
}

export async function getPendingRequests(userPnIdentifier: string): Promise<PendingRequests> {
  const inflight = pendingRequestsInflight.get(userPnIdentifier);
  if (inflight) return inflight;

  const work = (async (): Promise<PendingRequests> => {
    try {
      const { listDeviceConnections } = await import('@par-noir/device-cloud-credentials');
      const { sessionDriveFor } = await import('./sessionDrive');
      const drive = await sessionDriveFor(userPnIdentifier);
      const sheetId = drive.index.sheetIds.connections;
      if (!sheetId) return { sent: [], received: [] };
      const rows = await listDeviceConnections(drive.accessToken, sheetId);
      return {
        sent: rows.filter((row) => row.status === 'pending_sent'),
        received: rows.filter((row) => row.status === 'pending_received'),
      };
    } catch (error) {
      console.error('Failed to get pending requests:', error);
      return { sent: [], received: [] };
    }
  })();

  pendingRequestsInflight.set(userPnIdentifier, work);
  try {
    return await work;
  } finally {
    pendingRequestsInflight.delete(userPnIdentifier);
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
  try {
    if (otherUserPnIdentifier.length > 200) {
      return { status: 'not_connected' };
    }

    // Under device custody this endpoint needs X-PN-Cloud-Access-Token — wait for vault hydrate.
    const ready = await waitForOwnerCloudAccess(userPnIdentifier);
    if (!ready) {
      return { status: 'not_connected' };
    }

    const { listDeviceConnections } = await import('@par-noir/device-cloud-credentials');
    const { sessionDriveFor } = await import('./sessionDrive');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.connections;
    if (!sheetId) return { status: 'not_connected' };
    const other = normalizePnId(otherUserPnIdentifier);
    const row = (await listDeviceConnections(drive.accessToken, sheetId)).find(
      (item) => normalizePnId(item.userPnIdentifier) === other
    );
    if (!row) return { status: 'not_connected' };
    if (row.status === 'accepted') return { status: 'connected', connectionId: row.connectionId };
    return { status: row.status, connectionId: row.connectionId };
  } catch (error) {
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
    const { listDeviceConnections, upsertDeviceConnection } = await import('@par-noir/device-cloud-credentials');
    const { sessionDriveFor } = await import('./sessionDrive');
    const drive = await sessionDriveFor(userPnIdentifier);
    const sheetId = drive.index.sheetIds.connections;
    const existing = sheetId
      ? (await listDeviceConnections(drive.accessToken, sheetId)).find((row) => row.connectionId === connectionId)
      : undefined;
    if (sheetId && existing) {
      await upsertDeviceConnection(drive.accessToken, sheetId, { ...existing, status: 'blocked' });
    }
    const response = await ownerFetch(
      'DELETE',
      `/api/connections/${connectionId}`,
      {
        userPnIdentifier,
        peerPnIdentifier: existing?.userPnIdentifier,
        deviceCloudResult: {
          spreadsheetId: sheetId,
          provider: 'google',
          peerPnIdentifier: existing?.userPnIdentifier,
        },
      },
      { pnIdentifier: userPnIdentifier }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove connection');
    }
    invalidateConnectionsCache(userPnIdentifier);
  } catch (error) {
    console.error('Failed to remove connection:', error);
    throw error;
  }
}

