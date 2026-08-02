/**
 * Connection Routes
 * Connection requests, accept/reject, follow/unfollow, and connection listing endpoints
 */

import express from 'express';
import crypto from 'crypto';
import { safeClientErrorMessage } from '../utils/safeError';
import { messagingLog } from '../utils/messagingLog';
import { safeLogger } from '../../utils/logger';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface ConnectionRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
  driveNotInitialized: (res: express.Response) => express.Response;
}

/**
 * Setup connection routes
 */
export function setupConnectionRoutes(app: express.Application, deps: ConnectionRouteDeps) {
  const { extractAccountId, getMetadataFolder, driveNotInitialized } = deps;

    // ============================================================================
    // Connections APIs
    // ============================================================================

    // POST /api/connections/request - Send connection request
    app.post('/api/connections/request', async (req, res) => {
      try {
        const { requesterPnIdentifier, recipientPnIdentifier, requesterMlKemPublicKey, requesterMailboxRouteKey, mailboxRouteKey } = req.body;
        if (!requesterPnIdentifier || !recipientPnIdentifier) {
          return res.status(400).json({ error: 'requesterPnIdentifier and recipientPnIdentifier are required' });
        }
        if (!requesterMlKemPublicKey || typeof requesterMlKemPublicKey !== 'string') {
          return res.status(400).json({ error: 'requesterMlKemPublicKey is required' });
        }
        try {
          const kemBuf = Buffer.from(String(requesterMlKemPublicKey).replace(/\s/g, ''), 'base64');
          if (kemBuf.length < 1000) {
            return res.status(400).json({ error: 'requesterMlKemPublicKey is invalid' });
          }
        } catch {
          return res.status(400).json({ error: 'requesterMlKemPublicKey is invalid' });
        }

        if (requesterPnIdentifier === recipientPnIdentifier) {
          return res.status(400).json({ error: 'Cannot connect to yourself' });
        }

        const { ConnectionsService } = await import('./connectionsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        safeLogger.info('[ConnectionRequest] start', { category: 'connections' });
        
        // Get requester's credentials
        let requesterCredentials = await storageCredentialsService.getCredentials(requesterPnIdentifier);
        if (!requesterCredentials?.credentials) {
          // Credentials not found
          requesterCredentials = await storageCredentialsService.getCredentials(requesterPnIdentifier);
        }
        if (!requesterCredentials?.credentials) {
          console.error(`[ConnectionRequest] No credentials found for requester. Tried: ${requesterPnIdentifier}`);
          return res.status(404).json({ error: 'Requester credentials not found' });
        }
        console.log(`[ConnectionRequest] Found requester credentials under: ${requesterCredentials.identityId}`);

        const requesterGoogleDriveAccounts = requesterCredentials.credentials.googleDriveAccounts || 
          (requesterCredentials.credentials.googleDrive ? [requesterCredentials.credentials.googleDrive] : []);
        
        if (requesterGoogleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Requester has no Google Drive connected' });
        }

        const requesterAccount = requesterGoogleDriveAccounts[0];
        // Try backendId first, then keyPrefix, then accountId/id for backward compatibility
        const requesterAccountId = (requesterAccount as any).backendId || (requesterAccount as any).keyPrefix || (requesterAccount as any).accountId || (requesterAccount as any).id || undefined;
        console.log(`[ConnectionRequest] Requester account structure:`, {
          backendId: (requesterAccount as any).backendId,
          keyPrefix: (requesterAccount as any).keyPrefix,
          accountId: (requesterAccount as any).accountId,
          id: (requesterAccount as any).id,
          usingAccountId: requesterAccountId
        });
        // Use requesterPnIdentifier (the pn identifier from request)
        let requesterAccessToken: string;
        try {
          requesterAccessToken = await googleDriveProxyService.getAccessToken(requesterPnIdentifier, requesterAccountId, [requesterPnIdentifier]);
        } catch (error: any) {
          console.error('[ConnectionRequest] Failed to get requester access token:', error);
          console.error('[ConnectionRequest] Requester details:', {
            identityId: requesterCredentials.identityId,
            accountId: requesterAccountId,
            hasCredentials: !!requesterCredentials.credentials,
            hasGoogleDriveAccounts: !!requesterCredentials.credentials?.googleDriveAccounts,
            googleDriveAccountsCount: requesterCredentials.credentials?.googleDriveAccounts?.length || 0
          });
          return res.status(500).json({
            error: 'Failed to send connection request',
            error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Invalid Credentials',
            details: 'Failed to get requester Google Drive access token. Please ensure your Google Drive is connected in the dashboard.'
          });
        }

        // Get or create requester's metadata folder
        let requesterMetadataFolderId: string;
        try {
          // Create refresh function for retry on 401 - force refresh
          const refreshTokenFn = async () => {
            return await googleDriveProxyService.forceRefreshAccessToken(requesterPnIdentifier, requesterAccountId, [requesterPnIdentifier]);
          };
          
          // Build token object for requester
          const requesterAccount = requesterCredentials.credentials.googleDriveAccounts?.[0] || requesterCredentials.credentials.googleDrive;
          const requesterToken = {
            access_token: requesterAccount.access_token || requesterAccount.accessToken,
            refresh_token: requesterAccount.refresh_token || requesterAccount.refreshToken,
            expires_at: requesterAccount.expires_at,
            expires_in: requesterAccount.expires_in
          };
          // Use normalized requesterPnIdentifier
          const _g = await getMetadataFolder(requesterToken, requesterPnIdentifier, requesterAccountId);
          if (!_g) {
            return driveNotInitialized(res);
          }
          requesterMetadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          if (error.message?.includes('authentication failed') || error?.response?.status === 401 || error?.response?.status === 403) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: safeClientErrorMessage(error, NODE_ENV === 'production') || `Google Drive API returned ${error?.response?.status || 'unknown error'}`
            });
          }
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Drive API error'
          });
        }

        // Use recipientPnIdentifier directly (already normalized)
        console.log(`[ConnectionRequest] Recipient: ${recipientPnIdentifier}`);
        
        // Get recipient's credentials
        let recipientCredentials = await storageCredentialsService.getCredentials(recipientPnIdentifier);
        if (!recipientCredentials?.credentials) {
          console.error(`[ConnectionRequest] No credentials found for recipient: ${recipientPnIdentifier}`);
          return res.status(404).json({ error: 'Recipient credentials not found' });
        }
        console.log(`[ConnectionRequest] Found recipient credentials under: ${recipientCredentials.identityId}`);

        const recipientGoogleDriveAccounts = recipientCredentials.credentials.googleDriveAccounts || 
          (recipientCredentials.credentials.googleDrive ? [recipientCredentials.credentials.googleDrive] : []);
        
        if (recipientGoogleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Recipient has no Google Drive connected' });
        }

        const recipientAccount = recipientGoogleDriveAccounts[0];
        // Try backendId first, then keyPrefix, then accountId/id for backward compatibility
        const recipientAccountId = (recipientAccount as any).backendId || (recipientAccount as any).keyPrefix || (recipientAccount as any).accountId || (recipientAccount as any).id || undefined;
        console.log(`[ConnectionRequest] Recipient account structure:`, {
          backendId: (recipientAccount as any).backendId,
          keyPrefix: (recipientAccount as any).keyPrefix,
          accountId: (recipientAccount as any).accountId,
          id: (recipientAccount as any).id,
          usingAccountId: recipientAccountId
        });
        // Use recipientPnIdentifier (the pn identifier from request)
        let recipientAccessToken: string;
        try {
          recipientAccessToken = await googleDriveProxyService.getAccessToken(recipientPnIdentifier, recipientAccountId, [recipientPnIdentifier]);
        } catch (error: any) {
          console.error('[ConnectionRequest] Failed to get recipient access token:', error);
          console.error('[ConnectionRequest] Recipient details:', {
            identityId: recipientCredentials.identityId,
            accountId: recipientAccountId,
            hasCredentials: !!recipientCredentials.credentials,
            hasGoogleDriveAccounts: !!recipientCredentials.credentials?.googleDriveAccounts,
            googleDriveAccountsCount: recipientCredentials.credentials?.googleDriveAccounts?.length || 0
          });
          return res.status(500).json({
            error: 'Failed to send connection request',
            error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Invalid Credentials',
            details: 'Failed to get recipient Google Drive access token. Please ensure the recipient has Google Drive connected in the dashboard.'
          });
        }

        // Get recipient's metadata folder
        let recipientMetadataFolderId: string;
        try {
          // Create refresh function for retry on 401 - force refresh
          const refreshTokenFn = async () => {
            return await googleDriveProxyService.forceRefreshAccessToken(recipientPnIdentifier, recipientAccountId, [recipientPnIdentifier]);
          };
          
          // Build token object for recipient
          const recipientAccount = recipientCredentials.credentials.googleDriveAccounts?.[0] || recipientCredentials.credentials.googleDrive;
          const recipientTokenForMetadata = {
            access_token: recipientAccount.access_token || recipientAccount.accessToken,
            refresh_token: recipientAccount.refresh_token || recipientAccount.refreshToken,
            expires_at: recipientAccount.expires_at,
            expires_in: recipientAccount.expires_in
          };
          // Use normalized recipientPnIdentifier
          const _g = await getMetadataFolder(recipientTokenForMetadata, recipientPnIdentifier, recipientAccountId);
          if (!_g) {
            return driveNotInitialized(res);
          }
          recipientMetadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          if (error.message?.includes('authentication failed') || error?.response?.status === 401 || error?.response?.status === 403) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: safeClientErrorMessage(error, NODE_ENV === 'production') || `Google Drive API returned ${error?.response?.status || 'unknown error'}`
            });
          }
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Drive API error'
          });
        }

        // Send connection request (pass normalized pn-identifiers)
        let connection;
        try {
          const routeKeyForRequest =
            (typeof requesterMailboxRouteKey === 'string' && requesterMailboxRouteKey.trim()) ||
            (typeof mailboxRouteKey === 'string' && mailboxRouteKey.trim()) ||
            undefined;
          connection = await ConnectionsService.sendConnectionRequest(
            requesterAccessToken,
            requesterMetadataFolderId,
            requesterPnIdentifier,
            recipientAccessToken,
            recipientMetadataFolderId,
            recipientPnIdentifier,
            requesterMlKemPublicKey,
            requesterAccountId,
            recipientAccountId,
            routeKeyForRequest
          );
        } catch (connectionError: any) {
          console.error('[ConnectionRequest] Error in ConnectionsService.sendConnectionRequest:', connectionError);
          return res.status(500).json({
            error: 'Failed to send connection request',
            error_description: connectionError.message || 'Failed to create connection in Google Drive'
          });
        }

        // Validate connection was created
        if (!connection || !connection.connectionId) {
          console.error('[ConnectionRequest] Connection created but missing connectionId:', connection);
          return res.status(500).json({
            error: 'Connection request created but missing connectionId',
            error_description: 'Failed to get connection ID from created connection'
          });
        }

        // Record activity and send notification with separate error handling for each operation
        const { ActivityLedgerService } = await import('./activityLedgerService');
        const { NotificationService } = await import('./notificationService');
        
        // Record activity for requester (using pnIdentifier from credentials)
        try {
          await ActivityLedgerService.recordActivity(
            requesterAccessToken,
            requesterMetadataFolderId,
            requesterCredentials.identityId,
            'connection_request',
            {
              targetType: 'user',
              targetPnIdentifier: recipientPnIdentifier, // Use normalized
              metadata: { connectionId: connection.connectionId }
            }
          );
          console.log(`[ConnectionRequest] Activity recorded for requester: ${requesterCredentials.identityId}`);
        } catch (error: any) {
          console.error(`[ConnectionRequest] Failed to record activity for requester ${requesterCredentials.identityId}:`, error);
          console.error(`[ConnectionRequest] Error details:`, { 
            connectionId: connection.connectionId, 
            requesterPnIdentifier, 
            recipientPnIdentifier, 
            requesterIdentityId: requesterCredentials.identityId,
            error: error.message, 
            stack: error.stack 
          });
          // Continue - don't fail the request
        }

        // Record activity for recipient (use normalized pn-identifier)
        try {
          await ActivityLedgerService.recordActivity(
            recipientAccessToken,
            recipientMetadataFolderId,
            recipientPnIdentifier, // Use normalized pn-identifier
            'connection_request',
            {
              targetType: 'user',
              targetPnIdentifier: requesterPnIdentifier,
              actorPnIdentifier: requesterPnIdentifier,
              metadata: { connectionId: connection.connectionId }
            }
          );
          console.log(`[ConnectionRequest] Activity recorded for recipient: ${recipientCredentials.identityId}`);
        } catch (error: any) {
          console.error(`[ConnectionRequest] Failed to record activity for recipient ${recipientCredentials.identityId}:`, error);
          console.error(`[ConnectionRequest] Error details:`, { 
            connectionId: connection.connectionId, 
            requesterPnIdentifier, 
            recipientPnIdentifier: recipientCredentials.identityId,
            error: error.message, 
            stack: error.stack 
          });
          // Continue - don't fail the request
        }

        // Send notification to recipient (use normalized DIDs)
        try {
          await NotificationService.notifyConnectionRequest(
            recipientAccessToken,
            recipientMetadataFolderId,
            connection.connectionId,
            requesterPnIdentifier,
            recipientPnIdentifier
          );
          console.log(`[ConnectionRequest] Notification sent to recipient: ${recipientCredentials.identityId}`);
        } catch (error: any) {
          console.error(`[ConnectionRequest] Failed to send notification to recipient ${recipientCredentials.identityId}:`, error);
          console.error(`[ConnectionRequest] Error details:`, { 
            connectionId: connection.connectionId, 
            requesterPnIdentifier, 
            recipientPnIdentifier: recipientCredentials.identityId,
            error: error.message, 
            stack: error.stack 
          });
          // Continue - don't fail the request
        }

        return res.json({
          success: true,
          connection
        });
      } catch (error: any) {
        console.error('Error sending connection request:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
          error: 'Failed to send connection request',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to send connection request',
          details: error.stack ? error.stack.substring(0, 500) : undefined
        });
      }
    });

    // POST /api/connections/:connectionId/accept - Accept connection request
    app.post('/api/connections/:connectionId/accept', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { userPnIdentifier, kemCiphertext, wrappedMessageRootKey, kemAlgId, acceptorMailboxRouteKey, mailboxRouteKey } = req.body;
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }
        if (!kemCiphertext || !wrappedMessageRootKey || kemAlgId !== 'ML-KEM-768') {
          return res.status(400).json({
            error: 'kemCiphertext, wrappedMessageRootKey, and kemAlgId (ML-KEM-768) are required'
          });
        }

        const { ConnectionsService } = await import('./connectionsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
                const accountId = account ? extractAccountId(account) : undefined;
        // Use normalized pn identifier for access token retrieval
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        // Get metadata folder and pN root folder (for conversation sheets)
        let metadataFolderId: string;
        let acceptorPnFolderId: string;
        try {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            // Folders actually missing - this is the only case for DRIVE_NOT_INITIALIZED
            return driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
          acceptorPnFolderId = _g.pnFolderId;
        } catch (error: any) {
          // Drive API error (token, permissions, etc.) - return appropriate error
          if (error.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: safeClientErrorMessage(error, NODE_ENV === 'production')
            });
          }
          console.error('Error getting metadata folder:', error);
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Drive API error'
          });
        }

        // Get connection to find other user
        const connectionsFile = await ConnectionsService.getConnectionsFile(userAccessToken, metadataFolderId, pnIdentifier, accountId);
        if (!connectionsFile) {
          messagingLog.error('[AcceptConnection] Connections file not found for user', { pnIdentifier });
          return res.status(404).json({ error: 'Connection request not found' });
        }

        messagingLog.debug(`[AcceptConnection] Looking for connection ${connectionId} in user's connections file`);
        messagingLog.debug(`[AcceptConnection] User has ${connectionsFile.connections.length} connections`, {
          connections: connectionsFile.connections.map(c => ({
            connectionId: c.connectionId,
            userPnIdentifier: c.userPnIdentifier,
            status: c.status
          }))
        });

        // Find connection - prioritize pending_received, but also check for pending_sent (mutual request scenario)
        const allMatchingConnections = connectionsFile.connections.filter(c => c.connectionId === connectionId);
        messagingLog.debug(`[AcceptConnection] Found ${allMatchingConnections.length} connections with ID ${connectionId}`, {
          matches: allMatchingConnections.map(c => ({ userPnIdentifier: c.userPnIdentifier, status: c.status }))
        });

        // Prioritize pending_received connection (the one we want to accept)
        let connection = allMatchingConnections.find(c => c.status === 'pending_received');
        
        // If no pending_received found, but there's a pending_sent, it means the recipient sent a request first
        // In this case, we should accept their own request and update the other user's file
        if (!connection && allMatchingConnections.length > 0) {
          connection = allMatchingConnections.find(c => c.status === 'pending_sent');
          if (connection) {
            messagingLog.debug(`[AcceptConnection] Found pending_sent connection - this is a mutual request scenario`);
            messagingLog.debug(`[AcceptConnection] Will accept by updating both users' files to accepted status`);
          }
        }

        if (!connection) {
          messagingLog.error(`[AcceptConnection] Connection ${connectionId} not found in user's connections file`);
          messagingLog.error('[AcceptConnection] Available connections', {
            connections: connectionsFile.connections.map(c => ({
              connectionId: c.connectionId,
              userPnIdentifier: c.userPnIdentifier,
              status: c.status
            }))
          });
          return res.status(404).json({ error: 'Connection request not found' });
        }

        messagingLog.debug(`[AcceptConnection] Found connection:`, {
          connectionId: connection.connectionId,
          userPnIdentifier: connection.userPnIdentifier,
          status: connection.status,
          expectedStatus: 'pending_received'
        });

        // Check status - allow accepting if it's pending_received, pending_sent (mutual request), or already accepted (idempotent)
        if (connection.status === 'accepted') {
          if (!connection.kemCiphertext && kemCiphertext) {
            await ConnectionsService.acceptConnectionRequest(
              token.access_token,
              metadataFolderId,
              pnIdentifier,
              connectionId,
              kemCiphertext,
              accountId
            );
          }
          return res.json({ success: true, message: 'Connection already accepted' });
        }

        // Allow accepting pending_sent connections (mutual request scenario)
        // In this case, both users sent requests, so accepting either one should connect them
        if (connection.status === 'pending_sent') {
          messagingLog.debug(`[AcceptConnection] Accepting pending_sent connection (mutual request scenario)`);
          // We'll treat this as accepting the connection - update both files to accepted
        } else if (connection.status !== 'pending_received') {
          messagingLog.error(`[AcceptConnection] Connection status is '${connection.status}', expected 'pending_received' or 'pending_sent'`);
          return res.status(400).json({ 
            error: 'Connection request is not in pending_received status',
            error_description: `Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`
          });
        }

        // Normalize connection.userPnIdentifier when reading (handles legacy data)
        if (!connection.userPnIdentifier) {
          messagingLog.error('[AcceptConnection] Connection missing userPnIdentifier', { connection });
          throw new Error('Connection missing userPnIdentifier');
        }
        const otherUserPnIdentifier = connection.userPnIdentifier.startsWith('pn-') ? connection.userPnIdentifier : `pn-${connection.userPnIdentifier}`;
        connection.userPnIdentifier = otherUserPnIdentifier;

        // Record activity FIRST (use normalized DIDs)
        const { ActivityLedgerService } = await import('./activityLedgerService');
        
        await ActivityLedgerService.recordActivity(
          token.access_token,
          metadataFolderId,
          pnIdentifier, // Use normalized pn-identifier
          'connection_accepted',
          {
            targetType: 'user',
            targetPnIdentifier: otherUserPnIdentifier,
            metadata: { connectionId }
          }
        );

        await ConnectionsService.acceptConnectionRequest(
          token.access_token,
          metadataFolderId,
          pnIdentifier,
          connectionId,
          kemCiphertext,
          accountId
        );

        const refreshedConnectionsFile = await ConnectionsService.getConnectionsFile(
          userAccessToken,
          metadataFolderId,
          pnIdentifier,
          accountId
        );
        const acceptorConnection = refreshedConnectionsFile?.connections.find(
          (c) => c.connectionId === connectionId
        );
        if (!acceptorConnection) {
          messagingLog.warn('[AcceptConnection] Accepted connection not found after update', { connectionId });
        }

        // Get other user's credentials (requester) - required for syncing shared secret
        // Use normalized pn-identifier only (no fallback to original DID)
        const otherUserCredentials = await storageCredentialsService.getCredentials(otherUserPnIdentifier);

        if (!otherUserCredentials?.credentials) {
          return res.status(500).json({
            error: 'Other user credentials not found',
            error_description: 'Cannot sync shared secret - other user\'s credentials not found'
          });
        }

        const otherGoogleDriveAccounts = otherUserCredentials.credentials.googleDriveAccounts || 
          (otherUserCredentials.credentials.googleDrive ? [otherUserCredentials.credentials.googleDrive] : []);
        
        if (otherGoogleDriveAccounts.length === 0) {
          return res.status(500).json({
            error: 'Other user has no Google Drive connected',
            error_description: 'Cannot sync shared secret - other user has no Google Drive account'
          });
        }

        const otherAccount = otherGoogleDriveAccounts[0];
        const otherAccountId = extractAccountId(otherAccount);
        
        // Get full token object for other user (not just access token string) for automatic refresh
        const otherToken = {
          access_token: otherAccount.access_token || otherAccount.accessToken,
          refresh_token: otherAccount.refresh_token || otherAccount.refreshToken,
          expires_at: otherAccount.expires_at,
          expires_in: otherAccount.expires_in
        };
        const otherAccessToken = otherToken.access_token; // Keep for backward compatibility in this endpoint
        
        const otherMetadataFolder = await getMetadataFolder(otherToken, otherUserPnIdentifier, otherAccountId);
        if (!otherMetadataFolder) {
          return res.status(500).json({
            error: 'Failed to access other user\'s metadata folder',
            error_description: 'Cannot sync shared secret - other user\'s metadata folder not accessible'
          });
        }
        const otherMetadataFolderId = otherMetadataFolder.metadataFolderId;

        // Sync shared secret to other user's connection record - this MUST succeed
        const acceptorRouteKey =
          (typeof acceptorMailboxRouteKey === 'string' && acceptorMailboxRouteKey.trim()) ||
          (typeof mailboxRouteKey === 'string' && mailboxRouteKey.trim()) ||
          undefined;
        await ConnectionsService.updateOtherUserConnectionStatus(
          otherAccessToken,
          otherMetadataFolderId,
          otherUserPnIdentifier,
          connectionId,
          'accepted',
          pnIdentifier,
          kemCiphertext,
          otherAccountId,
          acceptorRouteKey
        );

        // Send notification and record activity for requester
        if (otherAccessToken && otherMetadataFolderId && otherUserCredentials?.credentials) {
          try {
            const { NotificationService } = await import('./notificationService');

            await ActivityLedgerService.recordActivity(
              otherAccessToken,
              otherMetadataFolderId,
              otherUserPnIdentifier, // Use normalized pn-identifier
              'connection_accepted',
              {
                targetType: 'user',
                targetPnIdentifier: pnIdentifier, // Use normalized pn-identifier
                actorPnIdentifier: pnIdentifier, // Use normalized pn-identifier
                metadata: { connectionId }
              }
            );

            await NotificationService.notifyConnectionAccepted(
              otherAccessToken,
              otherMetadataFolderId,
              connectionId,
              pnIdentifier, // Use normalized pn-identifier
              otherUserPnIdentifier // Use normalized pn-identifier
            );
          } catch (otherUserActivityError: any) {
            console.warn('Failed to record activity/notification for other user:', otherUserActivityError);
          }
        }

        // Create conversation sheets for both users when connection is accepted
        // Note: connectionId and sharedSecret are available from the outer scope
        try {
          const { MessageSheetsService } = await import('./messageSheetsService');
          const { ProfileService } = await import('./profileService');
          const { MetadataEncryption } = await import('../utils/metadataEncryption');
          
          // Get display names for the system message
          // Acceptor is the user accepting (user B), Requester is the user who sent the request (user A)
          let acceptorDisplayName = userCredentials.identityId.substring(0, 8);
          let requesterDisplayName = otherUserPnIdentifier.substring(0, 8);
          
          // Ensure connectionId and sharedSecret are available for system messages
          if (!connectionId) {
            messagingLog.warn('[AcceptConnection] No connectionId available for system messages');
            return res.json({ success: true });
          }
          
          try {
            const acceptorProfile = await ProfileService.getProfileFile(userAccessToken, metadataFolderId);
            if (acceptorProfile?.displayName) {
              acceptorDisplayName = acceptorProfile.displayName;
            }
          } catch (e) {
            // Use short identifier if profile not found
          }
          
          // Get requester's credentials and profile if available
          let otherAccessToken: string | null = null;
          let otherMetadataFolderId: string | null = null;
          
          if (otherUserCredentials?.credentials) {
            const otherGoogleDriveAccounts = otherUserCredentials.credentials.googleDriveAccounts || 
              (otherUserCredentials.credentials.googleDrive ? [otherUserCredentials.credentials.googleDrive] : []);
            
            if (otherGoogleDriveAccounts.length > 0) {
              const otherAccount = otherGoogleDriveAccounts[0];
              const otherAccountId = extractAccountId(otherAccount);
              
              // Get full token object for other user (not just access token string) for automatic refresh
              const otherTokenForProfile = {
                access_token: otherAccount.access_token || otherAccount.accessToken,
                refresh_token: otherAccount.refresh_token || otherAccount.refreshToken,
                expires_at: otherAccount.expires_at,
                expires_in: otherAccount.expires_in
              };
              otherAccessToken = otherTokenForProfile.access_token; // Keep for backward compatibility
              
              try {
                const _g = await getMetadataFolder(otherTokenForProfile, otherUserPnIdentifier, otherAccountId);
                if (_g) {
                  otherMetadataFolderId = _g.metadataFolderId;
                } else {
                  messagingLog.warn(`[AcceptConnection] Other user's metadata folder not found, continuing anyway`);
                }
              } catch (error: any) {
                messagingLog.warn('[AcceptConnection] Failed to get other user metadata folder, continuing anyway', { message: error.message });
                // Continue even if we can't access other user's folder
              }
              
              if (otherMetadataFolderId) {
                try {
                  const requesterProfile = await ProfileService.getProfileFile(otherToken.access_token, otherMetadataFolderId);
                  if (requesterProfile?.displayName) {
                    requesterDisplayName = requesterProfile.displayName;
                  }
                } catch (e) {
                  // Use short identifier if profile not found
                }
              }
            }
          }

          if (acceptorPnFolderId) {
              // Get or create messages folder for acceptor
              const acceptorMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
                token,
                acceptorPnFolderId,
                pnIdentifier,
                accountId
              );

              // Check if acceptor's conversation file exists, if not create
              let acceptorConversationSheetId: string;
              try {
                // Try to get existing conversation sheet (if reconnecting after deletion)
                acceptorConversationSheetId = await MessageSheetsService.getConversationSheet(
                  token,
                  acceptorMessagesFolderId,
                  otherUserPnIdentifier,
                  pnIdentifier,
                  accountId
                );
                
                // Check if the sheet is empty (only has header) - if so, try to restore
                const { google } = await import('googleapis');
                const auth = new google.auth.OAuth2();
                auth.setCredentials({ access_token: userAccessToken });
                const sheets = google.sheets({ version: 'v4', auth });
                const existingMessages = await sheets.spreadsheets.values.get({
                  spreadsheetId: acceptorConversationSheetId,
                  range: 'Messages!A2:F'
                });
                
                // E2E-only: no server-side shared-secret restore of peer conversation sheets
              } catch (error: any) {
                // First connection or re-connection after deletion - create new sheet
                if (error?.message?.includes('not found')) {
                  acceptorConversationSheetId = await MessageSheetsService.createConversationSheet(
                    token,
                    acceptorMessagesFolderId,
                    otherUserPnIdentifier,
                    pnIdentifier,
                    accountId
                  );
                } else {
                  throw error;
                }
              }

              // Add initial system message to acceptor's conversation
              // System messages don't need encryption - use empty connectionId and sharedSecret
              const systemMessageId = crypto.randomUUID();
              const now = new Date().toISOString();
              const systemMessageContent = `${acceptorDisplayName} accepted ${requesterDisplayName}'s connection request`;
              await MessageSheetsService.appendMessage(
                token,
                acceptorConversationSheetId,
                {
                  messageId: systemMessageId,
                  fromPnIdentifier: 'system',
                  toPnIdentifier: userCredentials.identityId,
                  content: systemMessageContent,
                  timestamp: now,
                  read: false
                },
                connectionId, // Use the connection ID
                '',
                pnIdentifier,
                accountId
              );

              // Update inbox for acceptor
              try {
                const acceptorInboxSheetId = await MessageSheetsService.getOrCreateInboxSheet(
                  token,
                  acceptorMessagesFolderId,
                  pnIdentifier,
                  accountId
                );
                await MessageSheetsService.updateInboxEntryWithRetry(
                  token,
                  acceptorInboxSheetId,
                  otherUserPnIdentifier,
                  acceptorConversationSheetId,
                  connectionId,
                  now,
                  pnIdentifier,
                  accountId,
                  systemMessageContent,
                  kemCiphertext,
                  wrappedMessageRootKey
                );
                messagingLog.debug('[AcceptConnection] Updated acceptor inbox');
              } catch (inboxError: any) {
                messagingLog.warn('[AcceptConnection] Failed to update acceptor inbox', { message: inboxError?.message });
              }
          }

          // Create conversation for requester (if we have their Drive credentials)
          const requesterPnFolderId = otherMetadataFolder.pnFolderId;
          if (otherAccessToken && otherMetadataFolderId && requesterPnFolderId && otherUserCredentials?.credentials) {
                // Get or create messages folder for requester
                const requesterMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
                  otherToken,
                  requesterPnFolderId,
                  otherUserPnIdentifier,
                  otherAccountId
                );

                // Check if requester's conversation file exists, if not try to restore from acceptor
                let requesterConversationSheetId: string;
                try {
                  // Try to get existing conversation sheet (use normalized pnIdentifier)
                  requesterConversationSheetId = await MessageSheetsService.getConversationSheet(
                    otherToken,
                    requesterMessagesFolderId,
                    pnIdentifier,
                    otherUserPnIdentifier,
                    otherAccountId
                  );
                  
                  // Check if the sheet is empty (only has header) - if so, try to restore
                  const { google } = await import('googleapis');
                  const otherAuth = new google.auth.OAuth2();
                  otherAuth.setCredentials({ access_token: otherAccessToken });
                  const otherSheets = google.sheets({ version: 'v4', auth: otherAuth });
                  const existingMessages = await otherSheets.spreadsheets.values.get({
                    spreadsheetId: requesterConversationSheetId,
                    range: 'Messages!A2:F'
                  });
                  
                  // E2E-only: no server-side shared-secret restore of peer conversation sheets
                } catch (error: any) {
                  // First connection or re-connection after deletion - create new sheet
                  if (error?.message?.includes('not found')) {
                    requesterConversationSheetId = await MessageSheetsService.createConversationSheet(
                      otherToken,
                      requesterMessagesFolderId,
                      pnIdentifier,
                      otherUserPnIdentifier,
                      otherAccountId
                    );
                  } else {
                    throw error;
                  }
                }

                // Add initial system message to requester's conversation
                // Message: "user b accepted user a's connection request" (acceptor accepted requester's request)
                const systemMessageId2 = crypto.randomUUID();
                const now2 = new Date().toISOString();
                const systemMessageContent2 = `${acceptorDisplayName} accepted ${requesterDisplayName}'s connection request`;
                await MessageSheetsService.appendMessage(
                  otherToken,
                  requesterConversationSheetId,
                  {
                    messageId: systemMessageId2,
                    fromPnIdentifier: 'system',
                    toPnIdentifier: otherUserCredentials.identityId,
                    content: systemMessageContent2,
                    timestamp: now2,
                    read: false
                  },
                  connectionId, // Use the connection ID
                  '',
                  otherUserPnIdentifier,
                  otherAccountId
                );

                // Update inbox for requester
                try {
                  const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
                  const requesterIndex = readPnDriveIndex(
                    otherUserCredentials.credentials as Record<string, unknown>
                  );
                  const requesterInboxSheetId = isPnDriveIndexComplete(requesterIndex)
                    ? requesterIndex.inboxSheetId
                    : await MessageSheetsService.getInboxSheet(
                        otherToken,
                        requesterMessagesFolderId,
                        otherUserPnIdentifier,
                        otherAccountId
                      );
                  await MessageSheetsService.updateInboxEntryWithRetry(
                    otherToken,
                    requesterInboxSheetId,
                    pnIdentifier,
                    requesterConversationSheetId,
                    connectionId,
                    now2,
                    otherUserPnIdentifier,
                    otherAccountId,
                    systemMessageContent2,
                    kemCiphertext
                  );
                  messagingLog.debug('[AcceptConnection] Updated requester inbox');
                } catch (inboxError: any) {
                  messagingLog.warn('[AcceptConnection] Failed to update requester inbox', { message: inboxError?.message });
                }
          }
        } catch (conversationError: any) {
          messagingLog.error('[AcceptConnection] Failed to create conversation sheets', { message: conversationError?.message });
          messagingLog.error('[AcceptConnection] Error details:', {
            connectionId,
            acceptorPnIdentifier: userCredentials.identityId,
            requesterPnIdentifier: otherUserPnIdentifier,
            error: conversationError?.message,
            stack: conversationError?.stack
          });
          // Don't fail the request if conversation creation fails
        }

        const { invalidateMessagingCachesForUsers } = await import('./messagingReadCache');
        await invalidateMessagingCachesForUsers(
          [pnIdentifier, otherUserPnIdentifier],
          [
            { pn: pnIdentifier, other: otherUserPnIdentifier },
            { pn: otherUserPnIdentifier, other: pnIdentifier },
          ]
        ).catch(() => undefined);

        return res.json({ success: true });
      } catch (error: any) {
        messagingLog.error('[AcceptConnection] Error accepting connection request', {
          message: error?.message,
          name: error?.name,
        });
        return res.status(500).json({
          error: 'Failed to accept connection request',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to accept connection request'
        });
      }
    });

    // POST /api/connections/:connectionId/reject - Reject connection request
    app.post('/api/connections/:connectionId/reject', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { userPnIdentifier } = req.body;
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }

        const { ConnectionsService } = await import('./connectionsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
                const accountId = account ? extractAccountId(account) : undefined;
        // Use normalized pn identifier for access token retrieval
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        // Get metadata folder
        let metadataFolderId: string;
        try {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            // Folders actually missing - this is the only case for DRIVE_NOT_INITIALIZED
            return driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          // Drive API error (token, permissions, etc.) - return appropriate error
          if (error.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: safeClientErrorMessage(error, NODE_ENV === 'production')
            });
          }
          console.error('Error getting metadata folder:', error);
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Drive API error'
          });
        }

        // Use userPnIdentifier directly (already normalized)
        // Remove connection from user's file
        await ConnectionsService.removeConnection(
          userAccessToken,
          metadataFolderId,
          userPnIdentifier,
          connectionId,
          accountId
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error rejecting connection request:', error);
        return res.status(500).json({
          error: 'Failed to reject connection request',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to reject connection request'
        });
      }
    });

    // GET /api/connections - Get user's accepted connections
    app.get('/api/connections', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsService } = await import('./connectionsService');
        const { requireOwnerDriveContext, DriveIndexError } = await import('./ownerDriveContext');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');

        const pnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        console.log(`[GetConnections] User: ${pnIdentifier}`);

        let driveCtx;
        try {
          driveCtx = await requireOwnerDriveContext(pnIdentifier);
        } catch (err) {
          if (err instanceof DriveIndexError && err.code === 'DRIVE_NOT_INITIALIZED') {
            return driveNotInitialized(res);
          }
          if (err instanceof Error && err.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: safeClientErrorMessage(err, NODE_ENV === 'production'),
            });
          }
          throw err;
        }

        const connectionsSheetId = driveCtx.sheetId(PN_DRIVE_SHEET_KEYS.CONNECTIONS);
        const connections = await ConnectionsService.getConnections(
          driveCtx.token.access_token!,
          '',
          pnIdentifier,
          driveCtx.accountId,
          connectionsSheetId
        );
        console.log(`[GetConnections] Found ${connections.length} accepted connections for user ${pnIdentifier}`);

        const normalizedConnections = connections
          .filter(c => {
            if (!c.userPnIdentifier) {
              console.warn('[GetConnections] Filtering out connection with undefined userPnIdentifier:', c);
              return false;
            }
            return true;
          })
          .map(c => ({
            ...c,
            userPnIdentifier: c.userPnIdentifier
          }));

        return res.json({ connections: normalizedConnections });
      } catch (error: unknown) {
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
        if (isGoogleSheetsRateLimit(error)) {
          return res.status(503).json({
            error: 'drive_rate_limited',
            message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
          });
        }
        console.error('Error getting connections:', error);
        return res.status(500).json({
          error: 'Failed to get connections',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get connections'
        });
      }
    });

    // POST /api/connections/follow - Follow a user or feed
    app.post('/api/connections/follow', async (req, res) => {
      try {
        const { userPnIdentifier, targetType, targetId } = req.body;
        if (!userPnIdentifier || !targetType || !targetId) {
          return res.status(400).json({ error: 'userPnIdentifier, targetType, and targetId are required' });
        }

        const targetTypeStr = String(targetType);
        if (targetTypeStr !== 'user' && targetTypeStr !== 'feed') {
          return res.status(400).json({ error: 'targetType must be "user" or "feed"' });
        }

        // Record activity FIRST
        const { ActivityLedgerService } = await import('./activityLedgerService');
        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const { NotificationService } = await import('./notificationService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        // Normalize targetId if it's a user (not a feed)
        const normalizedTargetId = targetTypeStr === 'user' && targetId
          ? (targetId.startsWith('pn-') ? targetId : `pn-${targetId}`)
          : targetId;

        // Record activity FIRST (use normalized targetPnIdentifier)
        await ActivityLedgerService.recordActivity(
          userAccessToken,
          metadataFolderId,
          userCredentials.identityId,
          'follow',
          {
            targetType: targetTypeStr,
            targetPnIdentifier: normalizedTargetId,
            metadata: { targetType: targetTypeStr, targetPnIdentifier: normalizedTargetId }
          }
        );

        // Get or create following sheet
        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          token,
          metadataFolderId,
          pnIdentifier,
          accountId
        );

        // Add to following sheet (use normalized targetPnIdentifier)
        await ConnectionsSheetsService.addFollowing(
          token,
          followingSheetId,
          {
            targetType: targetTypeStr as 'user' | 'feed',
            targetPnIdentifier: String(normalizedTargetId),
            followedAt: new Date().toISOString()
          },
          pnIdentifier,
          accountId
        );

        // If following a user with paid feed, add to their followers sheet (use normalized targetId)
        if (targetTypeStr === 'user') {
          try {
            const targetCredentials = await storageCredentialsService.getCredentials(normalizedTargetId);
            
            if (targetCredentials?.credentials) {
              // Check if target has paid feed (this would need feed service check)
              // For now, we'll add to followers if they have credentials
              const targetGoogleDriveAccounts = targetCredentials.credentials.googleDriveAccounts || 
                (targetCredentials.credentials.googleDrive ? [targetCredentials.credentials.googleDrive] : []);
              
              if (targetGoogleDriveAccounts.length > 0) {
                const targetAccount = targetGoogleDriveAccounts[0];
                const targetAccountId = (targetAccount as any).backendId || (targetAccount as any).keyPrefix || (targetAccount as any).accountId || (targetAccount as any).id || undefined;
                // Build token object for target
                const targetToken = {
                  access_token: targetAccount.access_token || targetAccount.accessToken,
                  refresh_token: targetAccount.refresh_token || targetAccount.refreshToken,
                  expires_at: targetAccount.expires_at,
                  expires_in: targetAccount.expires_in
                };
                const targetAccessToken = targetToken.access_token; // Keep for backward compatibility
                const _g = await getMetadataFolder(targetToken, normalizedTargetId, targetAccountId);
                if (!_g) return driveNotInitialized(res);
                const targetMetadataFolderId = _g.metadataFolderId;

                // Get or create followers sheet (paid feeds only)
                const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
                  targetToken,
                  targetMetadataFolderId,
                  normalizedTargetId,
                  targetAccountId
                );

                // Add follower (use normalized pnIdentifier)
                await ConnectionsSheetsService.addFollower(
                  targetToken,
                  followersSheetId,
                  {
                    followerPnIdentifier: pnIdentifier,
                    followedAt: new Date().toISOString()
                  },
                  normalizedTargetId,
                  targetAccountId
                );

                // Send notification to target user (use normalized DIDs)
                try {
                  await NotificationService.createNotification(
                    targetAccessToken,
                    targetMetadataFolderId,
                    targetCredentials.identityId,
                    {
                      user_pn_identifier: targetCredentials.identityId,
                      type: 'follow',
                      title: 'New Follower',
                      message: `${pnIdentifier} started following you`,
                      data: { user_pn_identifier: pnIdentifier }
                    }
                  );
                } catch (notificationError) {
                  console.warn('Failed to send follow notification:', notificationError);
                }
              }
            }
          } catch (targetError) {
            console.warn('Failed to update target user followers:', targetError);
            // Continue even if this fails
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error following:', error);
        return res.status(500).json({
          error: 'Failed to follow',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to follow'
        });
      }
    });

    // POST /api/connections/unfollow - Unfollow a user or feed
    app.post('/api/connections/unfollow', async (req, res) => {
      try {
        const { userPnIdentifier, targetType, targetId } = req.body;
        if (!userPnIdentifier || !targetType || !targetId) {
          return res.status(400).json({ error: 'userPnIdentifier, targetType, and targetId are required' });
        }

        const targetTypeStr = String(targetType);
        const targetIdStr = String(targetId);

        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        // Get following sheet
        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          token,
          metadataFolderId,
          pnIdentifier,
          accountId
        );

        // Normalize targetId if it's a user (not a feed)
        const normalizedTargetId = targetTypeStr === 'user' && targetIdStr
          ? (targetIdStr.startsWith('pn-') ? targetIdStr : `pn-${targetIdStr}`)
          : targetIdStr;

        // Remove from following sheet (use normalized targetId)
        await ConnectionsSheetsService.removeFollowing(
          token,
          followingSheetId,
          targetTypeStr as 'user' | 'feed',
          normalizedTargetId,
          pnIdentifier,
          accountId
        );

        // If unfollowing a user, remove from their followers sheet
        if (targetTypeStr === 'user') {
          try {
            const targetCredentials = await storageCredentialsService.getCredentials(normalizedTargetId);
            
            if (targetCredentials?.credentials) {
              const targetGoogleDriveAccounts = targetCredentials.credentials.googleDriveAccounts || 
                (targetCredentials.credentials.googleDrive ? [targetCredentials.credentials.googleDrive] : []);
              
              if (targetGoogleDriveAccounts.length > 0) {
                const targetAccount = targetGoogleDriveAccounts[0];
                const targetAccountId = (targetAccount as any).backendId || (targetAccount as any).keyPrefix || (targetAccount as any).accountId || (targetAccount as any).id || undefined;
                // Build token object for target
                const targetToken = {
                  access_token: targetAccount.access_token || targetAccount.accessToken,
                  refresh_token: targetAccount.refresh_token || targetAccount.refreshToken,
                  expires_at: targetAccount.expires_at,
                  expires_in: targetAccount.expires_in
                };
                const targetAccessToken = targetToken.access_token; // Keep for backward compatibility
                const _g = await getMetadataFolder(targetToken, normalizedTargetId, targetAccountId);
                if (!_g) return driveNotInitialized(res);
                const targetMetadataFolderId = _g.metadataFolderId;

                // Get followers sheet
                const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
                  targetToken,
                  targetMetadataFolderId,
                  normalizedTargetId,
                  targetAccountId
                );

                // Remove follower (use normalized pnIdentifier)
                await ConnectionsSheetsService.removeFollower(
                  targetToken,
                  followersSheetId,
                  pnIdentifier,
                  normalizedTargetId,
                  targetAccountId
                );
              }
            }
          } catch (targetError) {
            console.warn('Failed to remove from target user followers:', targetError);
            // Continue even if this fails
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error unfollowing:', error);
        return res.status(500).json({
          error: 'Failed to unfollow',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to unfollow'
        });
      }
    });

    // GET /api/connections/followers - Get user's followers (paid feeds only)
    app.get('/api/connections/followers', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ followers: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ followers: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        // Check if followers sheet exists (only for paid feeds)
        try {
          const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
            token,
            metadataFolderId,
            pnIdentifier,
            accountId
          );

          const result = await ConnectionsSheetsService.getFollowers(
            token,
            followersSheetId,
            pnIdentifier,
            accountId
          );

          return res.json({ followers: result.followers, total: result.total });
        } catch (error) {
          // Followers sheet doesn't exist (user doesn't have paid feed)
          return res.json({ followers: [], total: 0 });
        }
      } catch (error: any) {
        console.error('Error getting followers:', error);
        return res.status(500).json({
          error: 'Failed to get followers',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get followers'
        });
      }
    });

    // GET /api/connections/following - Get users/feeds user is following
    app.get('/api/connections/following', async (req, res) => {
      try {
        const userPnIdentifier = typeof req.query.userPnIdentifier === 'string' ? req.query.userPnIdentifier : String(req.query.userPnIdentifier || '');
        const targetType = typeof req.query.targetType === 'string' ? req.query.targetType : undefined;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ following: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ following: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        // Get following sheet
        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          token,
          metadataFolderId,
          pnIdentifier,
          accountId
        );

        const result = await ConnectionsSheetsService.getFollowing(
          token,
          followingSheetId,
          pnIdentifier,
          accountId,
          {
            targetType: (targetType as 'user' | 'feed' | undefined) || undefined
          }
        );

        return res.json({ following: result.following, total: result.total });
      } catch (error: any) {
        console.error('Error getting following:', error);
        return res.status(500).json({
          error: 'Failed to get following',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get following'
        });
      }
    });

    // GET /api/connections/following/feeds - Get followed feeds
    app.get('/api/connections/following/feeds', async (req, res) => {
      try {
        const userPnIdentifier = typeof req.query.userPnIdentifier === 'string' ? req.query.userPnIdentifier : String(req.query.userPnIdentifier || '');
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const pnIdentifier = userPnIdentifier;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ feeds: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ feeds: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          token,
          metadataFolderId,
          pnIdentifier,
          accountId
        );

        const result = await ConnectionsSheetsService.getFollowing(
          token,
          followingSheetId,
          pnIdentifier,
          accountId,
          { targetType: 'feed' }
        );

        return res.json({ feeds: result.following.map(f => f.targetPnIdentifier), total: result.total });
      } catch (error: any) {
        console.error('Error getting followed feeds:', error);
        return res.status(500).json({
          error: 'Failed to get followed feeds',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get followed feeds'
        });
      }
    });

    // GET /api/connections/following/users - Get followed users
    app.get('/api/connections/following/users', async (req, res) => {
      try {
        const userPnIdentifier = typeof req.query.userPnIdentifier === 'string' ? req.query.userPnIdentifier : String(req.query.userPnIdentifier || '');
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const pnIdentifier = userPnIdentifier;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ users: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ users: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          token,
          metadataFolderId,
          pnIdentifier,
          accountId
        );

        const result = await ConnectionsSheetsService.getFollowing(
          token,
          followingSheetId,
          pnIdentifier,
          accountId,
          { targetType: 'user' }
        );

        return res.json({ users: result.following.map(f => f.targetPnIdentifier), total: result.total });
      } catch (error: any) {
        console.error('Error getting followed users:', error);
        return res.status(500).json({
          error: 'Failed to get followed users',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get followed users'
        });
      }
    });

    // GET /api/connections/pending - Get pending requests
    app.get('/api/connections/pending', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsService } = await import('./connectionsService');
        const { requireOwnerDriveContext, DriveIndexError } = await import('./ownerDriveContext');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');

        const pnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        console.log(`[PendingRequests] User: ${pnIdentifier}`);

        let driveCtx;
        try {
          driveCtx = await requireOwnerDriveContext(pnIdentifier);
        } catch (err) {
          if (err instanceof DriveIndexError && err.code === 'DRIVE_NOT_INITIALIZED') {
            return driveNotInitialized(res);
          }
          if (err instanceof Error && err.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: safeClientErrorMessage(err, NODE_ENV === 'production'),
            });
          }
          throw err;
        }

        const connectionsSheetId = driveCtx.sheetId(PN_DRIVE_SHEET_KEYS.CONNECTIONS);
        const pending = await ConnectionsService.getPendingRequests(
          driveCtx.token.access_token!,
          '',
          pnIdentifier,
          driveCtx.accountId,
          connectionsSheetId
        );

        const normalizedPending = {
          sent: pending.sent
            .filter(c => {
              if (!c.userPnIdentifier) {
                console.warn('[PendingRequests] Filtering out connection with undefined userPnIdentifier:', c);
                return false;
              }
              return true;
            })
            .map(c => ({
              ...c,
              userPnIdentifier: c.userPnIdentifier
            })),
          received: pending.received
            .filter(c => {
              if (!c.userPnIdentifier) {
                console.warn('[PendingRequests] Filtering out connection with undefined userPnIdentifier:', c);
                return false;
              }
              return true;
            })
            .map(c => ({
              ...c,
              userPnIdentifier: c.userPnIdentifier
            }))
        };

        return res.json(normalizedPending);
      } catch (error: unknown) {
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
        if (isGoogleSheetsRateLimit(error)) {
          return res.status(503).json({
            error: 'drive_rate_limited',
            message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
          });
        }
        console.error('Error getting pending requests:', error);
        if (
          error instanceof Error &&
          (error.message?.includes('authentication failed') ||
            (error as { response?: { status?: number }; code?: number }).response?.status === 401 ||
            (error as { code?: number }).code === 401)
        ) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.',
          });
        }
        return res.status(500).json({
          error: 'Failed to get pending requests',
          error_description:
            error instanceof Error
              ? safeClientErrorMessage(error, NODE_ENV === 'production')
              : 'Failed to get pending requests',
        });
      }
    });

    // GET /api/connections/:otherUserPnIdentifier/status - Check connection status with another user
    app.get('/api/connections/:otherUserPnIdentifier/status', async (req, res) => {
      try {
        const { otherUserPnIdentifier } = req.params;
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier || !otherUserPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and otherUserPnIdentifier are required' });
        }

        const { requireOwnerDriveContext, DriveIndexError } = await import('./ownerDriveContext');
        const { getConnectionStatusFromIndex } = await import('./messagingConnectionResolver');
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifiers directly (already normalized)
        const normalizedUserPnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        const normalizedOtherUserPnIdentifier = typeof otherUserPnIdentifier === 'string' ? otherUserPnIdentifier : String(otherUserPnIdentifier || '');
        if (!normalizedUserPnIdentifier || !normalizedOtherUserPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and otherUserPnIdentifier are required' });
        }

        const userCredentials = await storageCredentialsService.getCredentials(normalizedUserPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ status: 'not_connected' });
        }

        try {
          const userCtx = await requireOwnerDriveContext(normalizedUserPnIdentifier);
          const status = await getConnectionStatusFromIndex(userCtx, normalizedOtherUserPnIdentifier);
          return res.json(status);
        } catch (error: unknown) {
          if (error instanceof DriveIndexError) {
            return driveNotInitialized(res);
          }
          if (isGoogleSheetsRateLimit(error)) {
            return res.status(503).json({
              error: 'drive_rate_limited',
              message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
              retryable: true,
            });
          }
          throw error;
        }
      } catch (error: any) {
        console.error('Error getting connection status:', error);
        return res.status(500).json({
          error: 'Failed to get connection status',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get connection status'
        });
      }
    });

    // DELETE /api/connections/:connectionId - Remove connection
    app.delete('/api/connections/:connectionId', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { userPnIdentifier } = req.body;
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }

        const { ConnectionsService } = await import('./connectionsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        // Get or create metadata folder
        let metadataFolderId: string;
        try {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          console.error('Error getting/creating metadata folder:', error);
          return res.status(500).json({ error: 'Failed to get or create metadata folder', error_description: safeClientErrorMessage(error, NODE_ENV === 'production') });
        }

        // Get connection to find the other user's pn identifier before removing
        let otherUserPnIdentifier: string | undefined;

        try {
          const connectionsFile = await ConnectionsService.getConnectionsFile(
            userAccessToken,
            metadataFolderId,
            pnIdentifier,
            accountId
          );
          const connection = connectionsFile?.connections.find((c) => c.connectionId === connectionId);
          if (connection) {
            if (!connection.userPnIdentifier) {
              console.error(`[RemoveConnection] Connection ${connectionId} missing userPnIdentifier:`, connection);
              return res.status(500).json({ error: 'Connection missing userPnIdentifier' });
            }
            otherUserPnIdentifier = connection.userPnIdentifier.startsWith('pn-')
              ? connection.userPnIdentifier
              : `pn-${connection.userPnIdentifier}`;
            console.log(
              `[RemoveConnection] Found connection ${connectionId} with other user: ${connection.userPnIdentifier} (normalized: ${otherUserPnIdentifier})`
            );
          } else {
            console.error(`[RemoveConnection] Connection ${connectionId} not found in user's connections`);
          }
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get connection details:`, error.message, error.stack);
        }

        try {
          await ConnectionsService.removeConnection(
            userAccessToken,
            metadataFolderId,
            pnIdentifier,
            connectionId,
            accountId
          );
          console.log(`[RemoveConnection] Removed connection ${connectionId} from user's connections`);
        } catch (error: any) {
          if (error.message === 'Connection not found' || error.message?.includes('not found')) {
            console.warn(`[RemoveConnection] Connection ${connectionId} not found for user (may have been already removed)`);
          } else {
            console.error(`[RemoveConnection] Failed to remove connection from user:`, error.message, error.stack);
            throw error;
          }
        }

        // Also remove connection from other user's connections
        if (!otherUserPnIdentifier) {
          console.error(`[RemoveConnection] Could not determine other user's pn identifier from connection ${connectionId}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but could not determine other user to remove from their list' });
        }

        console.log(`[RemoveConnection] Attempting to remove connection ${connectionId} from other user: ${otherUserPnIdentifier}`);
        
        // Get other user's credentials - early return if not found
        let otherUserCredentials;
        try {
          otherUserCredentials = await storageCredentialsService.getCredentials(otherUserPnIdentifier);
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get other user's credentials:`, error.message);
          return res.json({ success: true, warning: 'Connection removed from your list, but could not access other user\'s credentials' });
        }
        
        if (!otherUserCredentials?.credentials) {
          console.error(`[RemoveConnection] Other user's credentials not found for ${otherUserPnIdentifier}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but other user\'s credentials not found' });
        }

        // Get other user's Google Drive accounts - early return if none
        const otherUserGoogleDriveAccounts = otherUserCredentials.credentials.googleDriveAccounts || 
          (otherUserCredentials.credentials.googleDrive ? [otherUserCredentials.credentials.googleDrive] : []);
        
        if (otherUserGoogleDriveAccounts.length === 0) {
          console.error(`[RemoveConnection] Other user has no Google Drive connected for ${otherUserPnIdentifier}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but other user has no Google Drive connected' });
        }

        // Get other user's account and build token object
        const otherUserAccount = otherUserGoogleDriveAccounts[0];
        const otherUserAccountId = extractAccountId(otherUserAccount);
        
        // Build token object for other user
        const otherUserToken = {
          access_token: otherUserAccount.access_token || otherUserAccount.accessToken,
          refresh_token: otherUserAccount.refresh_token || otherUserAccount.refreshToken,
          expires_at: otherUserAccount.expires_at,
          expires_in: otherUserAccount.expires_in
        };
        const otherUserAccessToken = otherUserToken.access_token; // Keep for backward compatibility

        // Get other user's metadata folder - early return if not found
        let otherUserMetadataFolder;
        try {
          otherUserMetadataFolder = await getMetadataFolder(otherUserToken, otherUserPnIdentifier!, otherUserAccountId);
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get other user's metadata folder:`, error.message);
          return res.json({ success: true, warning: 'Connection removed from your list, but could not access other user\'s metadata folder' });
        }
        
        if (!otherUserMetadataFolder) {
          console.error(`[RemoveConnection] Other user's metadata folder not found for ${otherUserPnIdentifier}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but other user\'s metadata folder not found' });
        }

        // Remove from other user's connections
        try {
          await ConnectionsService.removeConnection(
            otherUserAccessToken,
            otherUserMetadataFolder.metadataFolderId,
            otherUserPnIdentifier!,
            connectionId,
            otherUserAccountId
          );

          console.log(`[RemoveConnection] Successfully removed connection ${connectionId} from both users' connections`);
          return res.json({ success: true });
        } catch (removeError: any) {
          if (removeError.message === 'Connection not found' || removeError.message?.includes('not found')) {
            console.warn(`[RemoveConnection] Connection ${connectionId} not found for other user (may have been already removed)`);
            return res.json({ success: true, warning: 'Connection removed from your list, but connection not found in other user\'s list (may have been already removed)' });
          }
          console.error(`[RemoveConnection] Unexpected error removing from other user:`, removeError.message, removeError.stack);
          throw removeError;
        }
      } catch (error: any) {
        console.error('Error removing connection:', error);
        return res.status(500).json({
          error: 'Failed to remove connection',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to remove connection'
        });
      }
    });
}
