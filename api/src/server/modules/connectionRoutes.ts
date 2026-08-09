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

/**
 * Payload sealed by the sender to the recipient's published ML-KEM key. The
 * server never opens it; it only checks the shape before forwarding.
 */
export interface SocialEnvelopeShape {
  kemCiphertext: string;
  ciphertext: string;
}

function isSocialEnvelopeShape(value: unknown): value is SocialEnvelopeShape {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.kemCiphertext === 'string' && typeof v.ciphertext === 'string';
}

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
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let requesterAccountId = (requesterAccount as any).backendId || (requesterAccount as any).keyPrefix || (requesterAccount as any).accountId || (requesterAccount as any).id || undefined;
        console.log(`[ConnectionRequest] Requester account structure:`, {
          backendId: (requesterAccount as any).backendId,
          keyPrefix: (requesterAccount as any).keyPrefix,
          accountId: (requesterAccount as any).accountId,
          id: (requesterAccount as any).id,
          usingAccountId: requesterAccountId
        });

        let requesterToken;
        try {
          const resolved = await resolveOwnerDriveToken(req, requesterPnIdentifier, {
            account: requesterAccount,
            accountId: requesterAccountId
          });
          requesterToken = resolved.token;
          requesterAccountId = resolved.accountId ?? requesterAccountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
        const requesterAccessToken = requesterToken.access_token;

        // Get or create requester's metadata folder
        let requesterMetadataFolderId: string;
        try {
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

        safeLogger.info('[ConnectionRequest] recipient resolved', { category: 'connections' });

        // The recipient's half of this used to be written here with the
        // recipient's Drive token. Under custody that token lives on their
        // device and they are not present during this call, so their row is
        // handed over as a mailbox job their own device applies.
        const connectionId = ConnectionsService.generateConnectionId(
          requesterPnIdentifier,
          recipientPnIdentifier
        );
        const now = new Date().toISOString();
        const routeKeyForRequest =
          (typeof requesterMailboxRouteKey === 'string' && requesterMailboxRouteKey.trim()) ||
          (typeof mailboxRouteKey === 'string' && mailboxRouteKey.trim()) ||
          undefined;

        try {
          await ConnectionsService.upsertOwnConnectionRow(
            requesterToken,
            requesterMetadataFolderId,
            requesterPnIdentifier,
            {
              connectionId,
              userPnIdentifier: recipientPnIdentifier,
              status: 'pending_sent',
              createdAt: now
            },
            requesterAccountId
          );
        } catch (connectionError: any) {
          console.error('[ConnectionRequest] Failed to write requester row:', connectionError);
          return res.status(500).json({
            error: 'Failed to send connection request',
            error_description: connectionError.message || 'Failed to create connection in Google Drive'
          });
        }

        const connection = {
          connectionId,
          userPnIdentifier: recipientPnIdentifier,
          status: 'pending_sent' as const,
          createdAt: now
        };

        // sanitizeMailboxPayload strips every clear pn field from durable rows,
        // so who this is from rides sealed to the recipient's published ML-KEM
        // key. The client seals it; the server only forwards.
        const { enqueueSocialJob } = await import('./socialRail');
        const delivered = await enqueueSocialJob({
          jobType: 'connection_request',
          peerPn: recipientPnIdentifier,
          requestId: connectionId,
          envelope: isSocialEnvelopeShape(req.body?.recipientEnvelope)
            ? req.body.recipientEnvelope
            : undefined,
          ...(typeof req.body?.envelopeContext === 'string'
            ? { envelopeContext: req.body.envelopeContext }
            : {}),
          extra: { createdAt: now, connectionId }
        });

        const { ActivityLedgerService } = await import('./activityLedgerService');
        try {
          await ActivityLedgerService.recordActivity(
            requesterAccessToken,
            requesterMetadataFolderId,
            requesterCredentials.identityId,
            'connection_request',
            {
              targetType: 'user',
              targetPnIdentifier: recipientPnIdentifier,
              metadata: { connectionId }
            }
          );
        } catch (error: any) {
          safeLogger.warn('[ConnectionRequest] Activity ledger write failed', {
            category: 'connections',
            message: error?.message
          });
        }

        return res.json({
          success: true,
          connection,
          delivered
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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

        // The requester's row, their notification, and their side of the
        // conversation used to be written here with the requester's Drive
        // token. Custody keeps that token on their device, so their half is
        // handed over as a mailbox job their own device applies on next unlock.
        const acceptorRouteKey =
          (typeof acceptorMailboxRouteKey === 'string' && acceptorMailboxRouteKey.trim()) ||
          (typeof mailboxRouteKey === 'string' && mailboxRouteKey.trim()) ||
          undefined;

        const { enqueueSocialJob } = await import('./socialRail');
        const delivered = await enqueueSocialJob({
          jobType: 'connection_accept',
          peerPn: otherUserPnIdentifier,
          requestId: connectionId,
          sealed: { peerPnIdentifier: pnIdentifier },
          // kemCiphertext is already public key-exchange material: it is what
          // the requester needs to derive the shared root, and it is useless
          // without their ML-KEM secret.
          extra: {
            kemCiphertext,
            ...(acceptorRouteKey ? { acceptorMailboxRouteKey: acceptorRouteKey } : {})
          }
        });

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
          
          // The requester's display name used to come from reading their
          // profile on their Drive. That is a peer read the server cannot make
          // under custody, and it only decorates a system message, so the short
          // identifier stands in.

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

          // The requester's messages folder, conversation sheet, system
          // message, and inbox row all used to be written here with their Drive
          // token. Their device now does that itself when it applies the
          // connection_accept job, so this side writes only the acceptor.
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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

        // Read the peer off the row before deleting it, so the requester can be
        // told to clear their pending_sent entry. Rejecting used to leave their
        // side pending forever.
        let rejectedPeerPn: string | undefined;
        let rejectedPeerRouteKey: string | undefined;
        try {
          const connectionsFile = await ConnectionsService.getConnectionsFile(
            userAccessToken,
            metadataFolderId,
            pnIdentifier,
            accountId
          );
          const row = connectionsFile?.connections.find((c) => c.connectionId === connectionId);
          if (row?.userPnIdentifier) {
            rejectedPeerPn = row.userPnIdentifier.startsWith('pn-')
              ? row.userPnIdentifier
              : `pn-${row.userPnIdentifier}`;
            rejectedPeerRouteKey = row.peerMailboxRouteKey;
          }
        } catch {
          /* row already gone */
        }

        await ConnectionsService.removeConnection(
          userAccessToken,
          metadataFolderId,
          userPnIdentifier,
          connectionId,
          accountId
        );

        if (rejectedPeerPn) {
          const { enqueueSocialJob } = await import('./socialRail');
          await enqueueSocialJob({
            jobType: 'connection_reject',
            peerPn: rejectedPeerPn,
            requestId: `reject:${connectionId}`,
            sealed: { peerPnIdentifier: pnIdentifier },
            extra: { connectionId }
          });
        }

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
        const { requireOwnerDriveContextFromReq, DriveIndexError, respondDriveTokenError } = await import('./ownerDriveToken');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');

        const pnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        console.log(`[GetConnections] User: ${pnIdentifier}`);

        let driveCtx;
        try {
          driveCtx = await requireOwnerDriveContextFromReq(req, pnIdentifier);
        } catch (err) {
          if (respondDriveTokenError(res, err)) return;
          if (
            err instanceof DriveIndexError &&
            err.code === 'DRIVE_NOT_INITIALIZED'
          ) {
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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

        // The target's followers row used to be written here with their Drive
        // token. Their device applies it from the mailbox instead.
        if (targetTypeStr === 'user') {
          const { enqueueSocialJob } = await import('./socialRail');
          await enqueueSocialJob({
            jobType: 'follower_add',
            peerPn: String(normalizedTargetId),
            requestId: `follow:${pnIdentifier}:${normalizedTargetId}`,
            sealed: { peerPnIdentifier: pnIdentifier },
            extra: { followedAt: new Date().toISOString() }
          });
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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

        // Same as follow: the target's own device removes its followers row.
        if (targetTypeStr === 'user') {
          const { enqueueSocialJob } = await import('./socialRail');
          await enqueueSocialJob({
            jobType: 'follower_remove',
            peerPn: String(normalizedTargetId),
            requestId: `unfollow:${pnIdentifier}:${normalizedTargetId}:${Date.now()}`,
            sealed: { peerPnIdentifier: pnIdentifier }
          });
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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
        const { requireOwnerDriveContextFromReq, DriveIndexError, respondDriveTokenError } = await import('./ownerDriveToken');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');

        const pnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        console.log(`[PendingRequests] User: ${pnIdentifier}`);

        let driveCtx;
        try {
          driveCtx = await requireOwnerDriveContextFromReq(req, pnIdentifier);
        } catch (err) {
          if (respondDriveTokenError(res, err)) return;
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

        const { requireOwnerDriveContextFromReq, DriveIndexError } = await import('./ownerDriveToken');
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
          const userCtx = await requireOwnerDriveContextFromReq(req, normalizedUserPnIdentifier);
          const status = await getConnectionStatusFromIndex(userCtx, normalizedOtherUserPnIdentifier);
          return res.json(status);
        } catch (error: unknown) {
          if (error instanceof DriveIndexError) {
            // Soft-fail status checks when cloud token has not arrived yet (client will retry).
            if (error.code === 'CLOUD_TOKEN_REQUIRED') {
              return res.json({ status: 'not_connected', pendingCloudToken: true });
            }
            return driveNotInitialized(res);
          }
          if (isGoogleSheetsRateLimit(error)) {
            return res.status(503).json({
              error: 'drive_rate_limited',
              message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
              retryable: true,
            });
          }
          const msg = error instanceof Error ? error.message : String(error || '');
          // Soft-fail unlock races / stale forwarded tokens — UI treats as not connected.
          if (
            /access token|authentication failed|invalid_grant|cloud.?token|unauthorized|401|403/i.test(
              msg
            )
          ) {
            return res.json({ status: 'not_connected', pendingCloudToken: true });
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
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

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
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
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
        let peerMailboxRouteKey: string | undefined;

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
            peerMailboxRouteKey = connection.peerMailboxRouteKey;
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

        // The peer's row used to be deleted here with their Drive token.
        // Their device removes it when it applies the connection_delete job.
        if (!otherUserPnIdentifier) {
          return res.json({
            success: true,
            warning: 'Connection removed from your list, but the peer could not be determined'
          });
        }

        const { enqueueSocialJob } = await import('./socialRail');
        const delivered = await enqueueSocialJob({
          jobType: 'connection_delete',
          peerPn: otherUserPnIdentifier,
          requestId: `delete:${connectionId}`,
          sealed: { peerPnIdentifier: pnIdentifier },
          extra: { connectionId }
        });

        return res.json({ success: true, delivered });
      } catch (error: any) {
        console.error('Error removing connection:', error);
        return res.status(500).json({
          error: 'Failed to remove connection',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to remove connection'
        });
      }
    });

    // POST /api/connections/apply-inbound
    //
    // The receiving half of the rail. A device pulls a social job from its own
    // mailbox, opens the sealed envelope locally, and posts the plaintext here
    // so the write lands in ITS OWN cloud with ITS OWN forwarded token. The
    // server never opened the envelope and never held the token.
    app.post('/api/connections/apply-inbound', async (req, res) => {
      try {
        const { userPnIdentifier, jobType, peerPnIdentifier } = req.body || {};
        if (!userPnIdentifier || !jobType) {
          return res.status(400).json({ error: 'userPnIdentifier and jobType are required' });
        }

        const APPLICABLE = [
          'connection_request',
          'connection_accept',
          'connection_reject',
          'connection_delete',
          'follower_add',
          'follower_remove'
        ];
        if (!APPLICABLE.includes(String(jobType))) {
          return res.status(400).json({ error: 'Unsupported jobType' });
        }
        if (!peerPnIdentifier) {
          return res.status(400).json({ error: 'peerPnIdentifier is required' });
        }

        const { ConnectionsService } = await import('./connectionsService');
        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

        const pnIdentifier = String(userPnIdentifier);
        const peerPn = String(peerPnIdentifier).startsWith('pn-')
          ? String(peerPnIdentifier)
          : `pn-${peerPnIdentifier}`;

        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }
        const googleDriveAccounts =
          userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        let accountId = account ? extractAccountId(account) : undefined;

        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }

        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        switch (String(jobType)) {
          case 'connection_request': {
            const { connectionId, peerMlKemPublicKey, peerMailboxRouteKey, createdAt } = req.body;
            if (!connectionId) {
              return res.status(400).json({ error: 'connectionId is required' });
            }
            await ConnectionsService.upsertOwnConnectionRow(
              token,
              metadataFolderId,
              pnIdentifier,
              {
                connectionId: String(connectionId),
                userPnIdentifier: peerPn,
                status: 'pending_received',
                createdAt: typeof createdAt === 'string' ? createdAt : new Date().toISOString(),
                ...(peerMlKemPublicKey ? { peerMlKemPublicKey: String(peerMlKemPublicKey) } : {}),
                ...(peerMailboxRouteKey
                  ? { peerMailboxRouteKey: String(peerMailboxRouteKey) }
                  : {})
              },
              accountId
            );
            break;
          }

          case 'connection_accept': {
            const { connectionId, kemCiphertext, peerMailboxRouteKey } = req.body;
            if (!connectionId) {
              return res.status(400).json({ error: 'connectionId is required' });
            }
            await ConnectionsService.updateOtherUserConnectionStatus(
              token.access_token,
              metadataFolderId,
              pnIdentifier,
              String(connectionId),
              'accepted',
              peerPn,
              typeof kemCiphertext === 'string' ? kemCiphertext : undefined,
              accountId,
              typeof peerMailboxRouteKey === 'string' ? peerMailboxRouteKey : undefined
            );
            break;
          }

          case 'connection_reject':
          case 'connection_delete': {
            const { connectionId } = req.body;
            if (!connectionId) {
              return res.status(400).json({ error: 'connectionId is required' });
            }
            try {
              await ConnectionsService.removeConnection(
                token.access_token,
                metadataFolderId,
                pnIdentifier,
                String(connectionId),
                accountId
              );
            } catch (error: any) {
              if (!error?.message?.includes('not found')) throw error;
            }
            break;
          }

          case 'follower_add': {
            const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
              token,
              metadataFolderId,
              pnIdentifier,
              accountId
            );
            await ConnectionsSheetsService.addFollower(
              token,
              followersSheetId,
              {
                followerPnIdentifier: peerPn,
                followedAt:
                  typeof req.body.followedAt === 'string'
                    ? req.body.followedAt
                    : new Date().toISOString()
              },
              pnIdentifier,
              accountId
            );
            break;
          }

          case 'follower_remove': {
            const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
              token,
              metadataFolderId,
              pnIdentifier,
              accountId
            );
            await ConnectionsSheetsService.removeFollower(
              token,
              followersSheetId,
              peerPn,
              pnIdentifier,
              accountId
            );
            break;
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        safeLogger.error('[ApplyInbound] Failed to apply social job', {
          category: 'connections',
          message: error?.message
        });
        return res.status(500).json({
          error: 'Failed to apply inbound job',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Apply failed'
        });
      }
    });
}
