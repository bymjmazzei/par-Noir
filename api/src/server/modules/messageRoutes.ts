/**
 * Message Routes
 * Direct-message conversations, inbox, requests, send, read, and delete endpoints
 */

import express from 'express';
import crypto from 'crypto';
import { safeClientErrorMessage } from '../utils/safeError';
import { messagingLog } from '../utils/messagingLog';
import { hashIdentifier } from '../../utils/logger';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface MessageRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
  driveNotInitialized: (res: express.Response) => express.Response;
  emitRealtime: (pnIdentifier: string, event: string, payload: Record<string, unknown>) => void;
}

/**
 * Setup message routes
 */
export function setupMessageRoutes(app: express.Application, deps: MessageRouteDeps) {
  const { extractAccountId, getMetadataFolder, driveNotInitialized, emitRealtime } = deps;

    // Message endpoints (placeholder - returns empty arrays for now)
    // GET /api/messages/conversations - Get all conversation threads
    app.get('/api/messages/conversations', async (req, res) => {
      try {
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, userPnIdentifier))) return;

        const { MessageSheetsService } = await import('./messageSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ conversations: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ conversations: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        const { readPnDriveIndex, isPnDriveIndexComplete, PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');
        const driveIndex = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);
        if (!isPnDriveIndexComplete(driveIndex)) {
          return res.json({ conversations: [], threads: [] });
        }

        const inboxSheetId = driveIndex.inboxSheetId;
        const messagesFolderId = driveIndex.messagesFolderId;

        try {
          const {
            getCachedInboxConversations,
            setCachedInboxConversations,
          } = await import('./messagingReadCache');

          type InboxCachePayload = {
            conversations: unknown[];
            threads: Array<{ participantPnIdentifier: string; lastMessageAt: string }>;
          };

          const cachedInbox = await getCachedInboxConversations<InboxCachePayload>(pnIdentifier);
          if (cachedInbox) {
            return res.json(cachedInbox);
          }

          const resolveOwnerDriveContext = async (ownerPnIdentifier: string) => {
            const ownerCreds = await storageCredentialsService.getCredentials(ownerPnIdentifier);
            if (!ownerCreds?.credentials) return null;
            const ownerAccounts =
              ownerCreds.credentials.googleDriveAccounts ||
              (ownerCreds.credentials.googleDrive ? [ownerCreds.credentials.googleDrive] : []);
            if (ownerAccounts.length === 0) return null;
            const ownerAccount = ownerAccounts[0];
            const ownerAccountId = extractAccountId(ownerAccount);
            // Peer's Drive for group sheet mtime — may still need server secrets or fail soft
            let ownerAccess =
              (ownerAccount.access_token || ownerAccount.accessToken || '') as string;
            if (!ownerAccess && ownerPnIdentifier === pnIdentifier) {
              ownerAccess = token.access_token;
            }
            if (!ownerAccess) {
              try {
                const { googleDriveProxyService } = await import('./googleDriveProxy');
                ownerAccess = await googleDriveProxyService.getAccessToken(
                  ownerPnIdentifier,
                  ownerAccountId
                );
              } catch {
                return null;
              }
            }
            return {
              token: {
                access_token: ownerAccess,
                refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
                expires_at: ownerAccount.expires_at,
                expires_in: ownerAccount.expires_in,
              },
              accountId: ownerAccountId,
            };
          };

          const inboxConversations = await MessageSheetsService.getInboxThreadsSortedByDrive(
            token,
            messagesFolderId,
            inboxSheetId,
            pnIdentifier,
            accountId,
            resolveOwnerDriveContext
          );

          const { GroupSheetsService } = await import('./groupSheetsService');
          let groupTitleById = new Map<string, string>();
          try {
            const groupsSheetId = driveIndex.sheetIds[PN_DRIVE_SHEET_KEYS.GROUPS];
            const groupRows = await GroupSheetsService.listGroupsForUser(
              token,
              groupsSheetId,
              pnIdentifier,
              accountId
            );
            for (const g of groupRows) {
              if (!groupTitleById.has(g.groupId)) {
                groupTitleById.set(g.groupId, g.title);
              }
            }
          } catch {
            /* optional enrichment */
          }

          const enrichedConversations = inboxConversations.map((conv) => {
              const lastMessage = conv.lastMessagePreview
                ? {
                    messageId: '',
                    fromPnIdentifier: '',
                    toPnIdentifier: conv.participantPnIdentifier,
                    content: conv.lastMessagePreview,
                    timestamp: conv.lastMessageAt,
                    read: false,
                    encrypted: false,
                  }
                : undefined;

              const isGroup = conv.threadType === 'group';
              return {
                threadType: conv.threadType || 'dm',
                otherUserPnIdentifier: conv.participantPnIdentifier,
                participantPnIdentifier: conv.participantPnIdentifier,
                spreadsheetId: conv.spreadsheetId,
                connectionId: conv.connectionId,
                kemCiphertext: conv.kemCiphertext,
                wrappedMessageRootKey: conv.wrappedMessageRootKey,
                lastMessageAt: conv.lastMessageAt,
                lastMessagePreview: conv.lastMessagePreview,
                lastMessage,
                unreadCount: 0,
                ...(isGroup && {
                  groupId: conv.groupId || conv.participantPnIdentifier,
                  ownerPnIdentifier: conv.ownerPnIdentifier || conv.connectionId,
                  groupTitle: groupTitleById.get(conv.groupId || conv.participantPnIdentifier) || 'Group',
                }),
              };
            });

          const threads = enrichedConversations.map((conv) => ({
            participantPnIdentifier: conv.participantPnIdentifier,
            lastMessageAt: conv.lastMessageAt,
          }));

          const payload = { conversations: enrichedConversations, threads };
          await setCachedInboxConversations(pnIdentifier, payload);
          return res.json(payload);
        } catch (inboxError: unknown) {
          const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
          console.warn(
            '[GetConversations] Inbox read failed:',
            inboxError instanceof Error ? inboxError.message : inboxError
          );
          if (isGoogleSheetsRateLimit(inboxError)) {
            return res.status(503).json({
              error: 'drive_rate_limited',
              message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
            });
          }
          const msg = inboxError instanceof Error ? inboxError.message : 'Failed to read inbox';
          if (/access token|authentication failed|invalid_grant|cloud token/i.test(msg)) {
            return res.status(409).json({
              error: 'cloud_token_required',
              error_description: msg
            });
          }
          return res.status(500).json({
            error: 'Failed to get message conversations',
            error_description: msg,
          });
        }
      } catch (error: any) {
        console.error('Error getting message conversations:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        if (error?.code === 429 || error?.response?.status === 429) {
          return res.status(503).json({
            error: 'drive_rate_limited',
            message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
          });
        }
        return res.status(500).json({
          error: 'Failed to get message conversations',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get message conversations'
        });
      }
    });


    app.get('/api/messages/requests', async (req, res) => {
      try {
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, userPnIdentifier))) return;

        const { MessageRequestSheetsService } = await import('./messageRequestSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const pnIdentifier = userPnIdentifier;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ requests: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          return res.json({ requests: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolved.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        const { readPnDriveIndex, isPnDriveIndexComplete, PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');
        const driveIndex = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);
        if (!isPnDriveIndexComplete(driveIndex)) {
          return res.json({ requests: [] });
        }

        const sheetId = driveIndex.sheetIds[PN_DRIVE_SHEET_KEYS.MESSAGE_REQUESTS];
        if (!sheetId) {
          return res.json({ requests: [] });
        }

        const rows = await MessageRequestSheetsService.listRequests(token, sheetId, pnIdentifier, accountId);
        const requests = rows.map(r => ({
          requestId: r.requestId,
          fromPnIdentifier: r.fromPnIdentifier,
          toPnIdentifier: r.toPnIdentifier,
          content: r.content,
          kemCiphertext: r.kemCiphertext,
          cryptoVersion: r.cryptoVersion,
          timestamp: r.timestamp,
          status: r.status
        }));

        return res.json({ requests });
      } catch (error: any) {
        console.error('Error getting message requests:', error);
        if (error.message?.includes('authentication failed') ||
            error?.response?.status === 401 ||
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to get message requests',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get message requests'
        });
      }
    });

    app.get('/api/messages/attachments-folder', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload?.pnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, tokenPayload.pnIdentifier))) return;
        const accountId = req.query.accountId as string | undefined;
        const { extractCloudAccessToken } = await import('./ownerDriveToken');
        const { ensureMessagesAttachmentsFolder } = await import('./messagingMediaService');
        const location = await ensureMessagesAttachmentsFolder(
          tokenPayload.pnIdentifier,
          accountId,
          extractCloudAccessToken(req)
        );
        return res.json({
          folderId: location.folderId ?? location.backendFileId,
          backend: location.backend,
          backendFileId: location.backendFileId,
          ...(location.accountId ? { accountId: location.accountId } : {})
        });
      } catch (error: any) {
        console.error('[AttachmentsFolder] Error:', error?.message || error);
        return res.status(500).json({
          error: 'Failed to resolve attachments folder',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.get('/api/messages/inbox', async (req, res) => {
      try {
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, userPnIdentifier))) return;

        const { MessageSheetsService } = await import('./messageSheetsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ messages: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ messages: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolvedToken = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolvedToken.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
        const driveIndex = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);
        if (!isPnDriveIndexComplete(driveIndex)) {
          return res.json({ messages: [] });
        }

        const inboxSheetId = driveIndex.inboxSheetId;
        const messagesFolderId = driveIndex.messagesFolderId;

        const resolveOwnerDriveContext = async (ownerPnIdentifier: string) => {
          const ownerCreds = await storageCredentialsService.getCredentials(ownerPnIdentifier);
          if (!ownerCreds?.credentials) return null;
          const ownerAccounts =
            ownerCreds.credentials.googleDriveAccounts ||
            (ownerCreds.credentials.googleDrive ? [ownerCreds.credentials.googleDrive] : []);
          if (ownerAccounts.length === 0) return null;
          const ownerAccount = ownerAccounts[0];
          const ownerAccountId = extractAccountId(ownerAccount);
          return {
            token: {
              access_token: ownerAccount.access_token || ownerAccount.accessToken,
              refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
              expires_at: ownerAccount.expires_at,
              expires_in: ownerAccount.expires_in,
            },
            accountId: ownerAccountId,
          };
        };

        const inboxConversations = await MessageSheetsService.getInboxThreadsSortedByDrive(
          token,
          messagesFolderId,
          inboxSheetId,
          pnIdentifier,
          accountId,
          resolveOwnerDriveContext
        );

        const allMessages = inboxConversations
          .filter(conversation => {
            if (!conversation.participantPnIdentifier) {
              console.warn(`[Inbox] Conversation missing participantPnIdentifier, skipping`);
              return false;
            }
            if (!conversation.lastMessageAt) {
              return false;
            }
            return true;
          })
          .map(conversation => {
            return {
              messageId: '',
              fromPnIdentifier: '',
              toPnIdentifier: conversation.participantPnIdentifier,
              content: conversation.lastMessagePreview || '',
              timestamp: conversation.lastMessageAt || new Date().toISOString(),
              read: false,
              encrypted: false
            };
          });

        // Sort by timestamp descending (most recent first)
        allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return res.json({ messages: allMessages });
      } catch (error: any) {
        console.error('Error getting inbox messages:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to get inbox messages',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get inbox messages'
        });
      }
    });

    // GET & POST /api/messages/conversation - Get messages in a specific conversation
    // POST with body used when passing cached credentials (avoids URL length / encoding issues)
    const conversationHandler = async (req: express.Request, res: express.Response) => {
      const src = req.method === 'POST' ? (req.body as Record<string, unknown>) : req.query as Record<string, unknown>;
      messagingLog.debug('[GetConversation] Endpoint called', { 
        userPnIdentifier: src.userPnIdentifier, 
        participantPnIdentifier: src.participantPnIdentifier,
        hasConnectionId: !!src.connectionId,
        hasSpreadsheetId: !!src.spreadsheetId,
        method: req.method
      });
      try {
        const requestStart = Date.now();
        const userPnIdentifier = src.userPnIdentifier as string;
        const participantPnIdentifier = src.participantPnIdentifier as string;
        const limit = src.limit != null ? parseInt(String(src.limit), 10) : 50;
        const offset = src.offset != null ? parseInt(String(src.offset), 10) : 0;
        const connectionId = src.connectionId as string | undefined;
        const spreadsheetId = src.spreadsheetId as string | undefined;
        messagingLog.debug('[GetConversation] Request received', {
          hasConnectionId: !!connectionId,
          hasSpreadsheetId: !!spreadsheetId,
          method: req.method
        });

        if (!userPnIdentifier || !participantPnIdentifier) {
          messagingLog.error('[GetConversation] Missing required parameters');
          return res.status(400).json({ error: 'userPnIdentifier and participantPnIdentifier are required' });
        }

        const msgCap = req.method === 'POST' ? DEVICE_CAPABILITIES.messagesSend : DEVICE_CAPABILITIES.messagesRead;
        if (!(await gateOwnerRoute(req, res, msgCap, userPnIdentifier))) return;

        const { MessageSheetsService } = await import('./messageSheetsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const credentialsStart = Date.now();
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        messagingLog.debug(`[GetConversation] getCredentials took ${Date.now() - credentialsStart}ms`);
        if (!userCredentials?.credentials) {
          return res.json({ messages: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ messages: [] });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolvedToken = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolvedToken.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        // Normalize participantPnIdentifier to ensure consistent format
        const normalizedParticipantPnIdentifier = participantPnIdentifier.startsWith('pn-') 
          ? participantPnIdentifier 
          : `pn-${participantPnIdentifier}`;

        let finalConnectionId: string | undefined;
        let conversationSheetId: string | undefined;

        if (connectionId && spreadsheetId) {
          finalConnectionId = connectionId;
          conversationSheetId = spreadsheetId;
        } else {
          messagingLog.debug('[GetConversation] Looking up connection (index path)');

          const { readPnDriveIndex, isPnDriveIndexComplete, patchPnDriveIndex, PN_DRIVE_SHEET_KEYS } =
            await import('./pnDriveIndex');
          const driveIndex = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);
          if (!isPnDriveIndexComplete(driveIndex)) {
            return res.json({ messages: [], total: 0 });
          }

          const inboxSheetId = driveIndex.inboxSheetId;
          const messagesFolderId = driveIndex.messagesFolderId;

          try {
            const inboxEntry = await MessageSheetsService.getInboxConversationByParticipant(
              token,
              inboxSheetId,
              normalizedParticipantPnIdentifier,
              pnIdentifier,
              accountId,
              50
            );

            if (inboxEntry?.connectionId && inboxEntry?.spreadsheetId) {
              finalConnectionId = inboxEntry.connectionId;
              conversationSheetId = inboxEntry.spreadsheetId;
            }
          } catch (inboxError: unknown) {
            messagingLog.warn('[GetConversation] Failed to read from inbox', {
              message: inboxError instanceof Error ? inboxError.message : String(inboxError),
            });
          }

          if (!finalConnectionId || !conversationSheetId) {
            const { requireOwnerDriveContext } = await import('./ownerDriveContext');
            const { resolveDmConnectionFromIndex } = await import('./messagingConnectionResolver');
            const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
            const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');

            const { extractCloudAccessToken } = await import('./cloudAccessToken');
            const userCtx = await requireOwnerDriveContext(pnIdentifier, accountId, {
              accessToken: extractCloudAccessToken(req),
            });
            const resolved = await resolveDmConnectionFromIndex(userCtx, normalizedParticipantPnIdentifier);

            if (!resolved?.connectionId || resolved.status !== 'connected') {
              return res.status(403).json({
                error: 'Connection not found. Users must be connected to view messages.',
                error_description: `Connection not found. Status: ${resolved?.status || 'not_connected'}`,
              });
            }

            if (!resolved.kemCiphertext) {
              const connectionsSpreadsheetId = driveIndex.sheetIds[PN_DRIVE_SHEET_KEYS.CONNECTIONS];
              const connection = await ConnectionsSheetsService.getConnectionById(
                token,
                connectionsSpreadsheetId,
                resolved.connectionId,
                pnIdentifier,
                accountId
              );
              if (!connection?.kemCiphertext) {
                return res.status(403).json({
                  error: 'Connection missing KEM session. Re-accept the connection with messaging unlocked.',
                  error_description: 'No kemCiphertext on connection',
                });
              }
            }

            finalConnectionId = resolved.connectionId;
            conversationSheetId =
              driveIndex.conversationSheets[normalizedParticipantPnIdentifier] ??
              resolved.conversationSpreadsheetId;

            if (!conversationSheetId) {
              conversationSheetId = await MessageSheetsService.getConversationSheet(
                token,
                messagesFolderId,
                normalizedParticipantPnIdentifier,
                pnIdentifier,
                accountId
              );
              patchPnDriveIndex(pnIdentifier, {
                conversationSheets: { [normalizedParticipantPnIdentifier]: conversationSheetId },
              }).catch((err: unknown) => {
                messagingLog.warn('[GetConversation] Failed to patch conversation sheet index', {
                  message: err instanceof Error ? err.message : String(err),
                });
              });
            }
          }
        }

        if (!finalConnectionId || !conversationSheetId) {
          messagingLog.error('[GetConversation] Missing required connection data', {
            hasConnectionId: !!finalConnectionId,
            hasConversationSheetId: !!conversationSheetId
          });
          return res.status(500).json({
            error: 'Failed to get conversation data',
            error_description: 'Failed to get connection or conversation sheet data'
          });
        }

        // Get messages from conversation sheet (with decryption)
        // Default to last 10 messages for initial load
        const messageLimit = limit || 10;
        const messageOffset = offset || 0;
        const fetchStart = Date.now();
        messagingLog.debug('[GetConversation] Fetching messages from sheet', { limit: messageLimit, offset: messageOffset });

        const {
          getCachedConversationMessages,
          setCachedConversationMessages,
        } = await import('./messagingReadCache');

        type ConversationCachePayload = { messages: unknown[]; total: number };
        const cachedConversation = await getCachedConversationMessages<ConversationCachePayload>(
          pnIdentifier,
          normalizedParticipantPnIdentifier,
          messageLimit,
          messageOffset
        );

        let result: { messages: Array<{ toPnIdentifier?: string }>; total: number };
        if (cachedConversation) {
          result = cachedConversation as typeof result;
        } else {
          result = await MessageSheetsService.getMessages(
            token,
            conversationSheetId,
            finalConnectionId,
            '',
            pnIdentifier,
            accountId,
            { 
              limit: messageLimit, 
              offset: messageOffset,
              includeTotal: false,
              relayOnly: true,
              peerPnIdentifier: normalizedParticipantPnIdentifier,
            }
          );
          await setCachedConversationMessages(
            pnIdentifier,
            normalizedParticipantPnIdentifier,
            messageLimit,
            messageOffset,
            { messages: result.messages, total: result.total }
          );
        }
        messagingLog.debug(`[GetConversation] getMessages took ${Date.now() - fetchStart}ms`);

        // Set toPnIdentifier for all messages (use normalized)
        result.messages.forEach(msg => {
          msg.toPnIdentifier = normalizedParticipantPnIdentifier;
        });

        messagingLog.info(`[GetConversation] Returning ${result.messages.length} messages`, {
          durationMs: Date.now() - requestStart,
        });
        return res.json({ messages: result.messages, total: result.total });
      } catch (error: any) {
        messagingLog.error('[GetConversation] ERROR', { message: error?.message, name: error?.name });
        messagingLog.error('[GetConversation] ERROR stack', { stack: error?.stack });
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
        if (isGoogleSheetsRateLimit(error)) {
          return res.status(503).json({
            error: 'drive_rate_limited',
            message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
          });
        }
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to get thread messages',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get thread messages'
        });
      }
    };
    app.get('/api/messages/conversation', conversationHandler);
    app.post('/api/messages/conversation', conversationHandler);

    app.post('/api/messages/send', async (req, res) => {
        messagingLog.info('[SendMessage] Endpoint called', {
        hasEncryptedContent: !!req.body?.encryptedContent,
        hasConnectionId: !!req.body?.connectionId,
        hasRouteKey: !!(req.body?.routeKey || req.body?.mailboxRouteKey)
      });
      try {
        const {
          fromPnIdentifier,
          toPnIdentifier,
          content,
          encryptedContent,
          cryptoVersion,
          mediaFileId,
          mediaMimeType,
          mediaBackend,
          isConnectionRequest,
          mediaEnvelopesByPn,
          routeKey: bodyRouteKey,
          mailboxRouteKey
        } = req.body;
        const isE2E = cryptoVersion === 2 && !!encryptedContent;
        if (!fromPnIdentifier || !toPnIdentifier) {
          return res.status(400).json({ error: 'fromPnIdentifier and toPnIdentifier are required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, fromPnIdentifier))) return;
        if (!isE2E) {
          return res.status(400).json({
            error: 'encryptedContent with cryptoVersion 2 is required (client-side E2E only)'
          });
        }

        const {
          isDeviceCloudCustodyEnabled,
          enqueueSocialMailboxJob,
          isMailboxRouteKey,
          legacyRouteKeyForIdentity,
          sanitizeMailboxPayload
        } = await import('./socialMailboxService');

        // Throughway fan-out only. Sender outbox (client/cloud) is the durable commit.
        if (isDeviceCloudCustodyEnabled()) {
          const connectionIdFromBody =
            typeof req.body?.connectionId === 'string' ? req.body.connectionId.trim() : '';
          if (!isConnectionRequest && !connectionIdFromBody) {
            return res.status(400).json({
              error: 'connectionId required',
              message: 'Clients must supply connectionId for throughway delivery.'
            });
          }
          const explicitRoute =
            (isMailboxRouteKey(bodyRouteKey) && String(bodyRouteKey).trim()) ||
            (isMailboxRouteKey(mailboxRouteKey) && String(mailboxRouteKey).trim()) ||
            '';
          const routeKey = explicitRoute || legacyRouteKeyForIdentity(toPnIdentifier);

          const clientMessageId =
            typeof req.body?.messageId === 'string' ? req.body.messageId.trim() : '';
          const messageId =
            clientMessageId ||
            `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const timestamp =
            (typeof req.body?.timestamp === 'string' && req.body.timestamp) ||
            new Date().toISOString();
          const threadId = [fromPnIdentifier, toPnIdentifier].sort().join('_');
          const connectionId = connectionIdFromBody || `conn_pending_${messageId}`;

          // Durable throughway payload: ciphertext + envelope ids only (no clear from/to graph).
          const messagePayload = sanitizeMailboxPayload({
            messageId,
            encryptedContent,
            cryptoVersion: 2,
            timestamp,
            read: false,
            mediaFileId: mediaFileId || undefined,
            mediaMimeType: mediaMimeType || undefined,
            mediaBackend: mediaBackend || undefined,
            mediaEnvelopesByPn:
              mediaEnvelopesByPn && typeof mediaEnvelopesByPn === 'object'
                ? mediaEnvelopesByPn
                : undefined,
            connectionId,
            threadId,
            isConnectionRequest: !!isConnectionRequest,
            role: 'recipient'
          });

          await enqueueSocialMailboxJob({
            routeKey,
            jobType: 'message_append',
            payload: messagePayload
          });
          if (mediaFileId) {
            await enqueueSocialMailboxJob({
              routeKey,
              jobType: 'message_attachment',
              payload: sanitizeMailboxPayload({
                messageId,
                mediaFileId,
                mediaMimeType,
                mediaBackend,
                mediaEnvelopesByPn,
                connectionId
              })
            });
          }
          await enqueueSocialMailboxJob({
            routeKey,
            jobType: 'notification_row',
            payload: sanitizeMailboxPayload({
              type: 'new_message',
              messageId,
              threadId,
              connectionId
            })
          });

          try {
            const { PushService } = await import('./pushService');
            PushService.send(toPnIdentifier, {
              title: 'New message',
              body: 'You have a new message',
              data: {
                message_id: messageId,
                mailbox: '1'
              }
            }).catch(() => undefined);
          } catch {
            /* optional */
          }

          emitRealtime(fromPnIdentifier, 'new_message', {
            threadId,
            messageId,
            throughway: true
          });
          emitRealtime(toPnIdentifier, 'new_message', {
            threadId,
            messageId,
            throughway: true
          });
          emitRealtime(toPnIdentifier, 'mailbox_pending', {
            jobType: 'message_append',
            messageId
          });

          messagingLog.info('[SendMessage] Throughway fan-out (sender outbox is SoT)', {
            messageId,
            routeKey: hashIdentifier(routeKey)
          });

          return res.json({
            success: true,
            delivery: 'throughway',
            message: {
              messageId,
              fromPnIdentifier,
              toPnIdentifier,
              encryptedContent,
              cryptoVersion: 2 as const,
              mediaFileId,
              mediaMimeType,
              timestamp,
              read: false,
              encrypted: true
            }
          });
        }

        return res.status(503).json({
          error: 'device_cloud_custody_required',
          message:
            'Messaging requires device cloud custody (sender outbox SoT). Set DEVICE_CLOUD_CUSTODY=1.'
        });


      } catch (error: any) {
        const { fromPnIdentifier: reqFromPnIdentifier, toPnIdentifier: reqToPnIdentifier } = req.body || {};
        messagingLog.error('[SendMessage] Error sending message', {
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
          name: error?.name,
          code: error?.code
        });
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
        if (isGoogleSheetsRateLimit(error)) {
          return res.status(503).json({
            error: 'drive_rate_limited',
            message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
            retryable: true,
          });
        }
        return res.status(500).json({
          error: 'Failed to send message',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to send message',
          details: error?.stack ? 'Check server logs for details' : undefined
        });
      }
    });

    app.post('/api/messages/requests', async (req, res) => {
      try {
        const { fromPnIdentifier, toPnIdentifier, content, encryptedContent, kemCiphertext, cryptoVersion } = req.body;
        if (!fromPnIdentifier || !toPnIdentifier) {
          return res.status(400).json({ error: 'fromPnIdentifier and toPnIdentifier are required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, fromPnIdentifier))) return;

        const storedContent = encryptedContent || content;
        if (!storedContent) {
          return res.status(400).json({ error: 'encryptedContent (crypto v2) is required' });
        }
        if (cryptoVersion !== 2 && !encryptedContent) {
          return res.status(400).json({
            error: 'Plaintext message requests are not allowed. Send encryptedContent with cryptoVersion 2.'
          });
        }
        if (cryptoVersion === 2 && !kemCiphertext) {
          return res.status(400).json({ error: 'kemCiphertext is required for cryptoVersion 2' });
        }

        const { MessageRequestSheetsService } = await import('./messageRequestSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const recipientCredentials = await storageCredentialsService.getCredentials(toPnIdentifier);
        if (!recipientCredentials?.credentials) {
          return res.status(404).json({ error: 'Recipient credentials not found' });
        }

        const recipientGoogleDriveAccounts = recipientCredentials.credentials.googleDriveAccounts ||
          (recipientCredentials.credentials.googleDrive ? [recipientCredentials.credentials.googleDrive] : []);
        if (recipientGoogleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Recipient has no Google Drive connected' });
        }

        const recipientAccount = recipientGoogleDriveAccounts[0];
        const recipientAccountId = extractAccountId(recipientAccount);
        const recipientToken = {
          access_token: recipientAccount.access_token || recipientAccount.accessToken,
          refresh_token: recipientAccount.refresh_token || recipientAccount.refreshToken,
          expires_at: recipientAccount.expires_at,
          expires_in: recipientAccount.expires_in
        };

        const recipientMetadata = await getMetadataFolder(recipientToken, toPnIdentifier, recipientAccountId);
        if (!recipientMetadata) {
          return driveNotInitialized(res);
        }

        const spreadsheetId = await MessageRequestSheetsService.getOrCreateSpreadsheet(
          recipientToken,
          recipientMetadata.metadataFolderId,
          toPnIdentifier,
          recipientAccountId
        );

        const requestId = `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        const timestamp = new Date().toISOString();

        await MessageRequestSheetsService.appendRequest(
          recipientToken,
          spreadsheetId,
          {
            requestId,
            fromPn: fromPnIdentifier,
            toPn: toPnIdentifier,
            content: storedContent,
            kemCiphertext,
            cryptoVersion: cryptoVersion === 2 ? 2 : undefined
          },
          toPnIdentifier,
          recipientAccountId
        );

        return res.json({
          success: true,
          request: {
            requestId,
            fromPnIdentifier,
            toPnIdentifier,
            content: '[Encrypted message request]',
            timestamp,
            status: 'pending' as const,
            cryptoVersion: cryptoVersion === 2 ? 2 : undefined
          }
        });
      } catch (error: any) {
        console.error('Error sending message request:', error);
        if (error.message?.includes('authentication failed') ||
            error?.response?.status === 401 ||
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to send message request',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to send message request'
        });
      }
    });

    app.post('/api/messages/requests/:requestId/respond', async (req, res) => {
      try {
        const { requestId } = req.params;
        const { userPnIdentifier, accept } = req.body;
        if (!requestId || !userPnIdentifier || typeof accept !== 'boolean') {
          return res.status(400).json({ error: 'requestId, userPnIdentifier, and accept are required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, userPnIdentifier))) return;

        const { MessageRequestSheetsService } = await import('./messageRequestSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const pnIdentifier = userPnIdentifier;
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
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolvedToken = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolvedToken.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        const metadataFolder = await getMetadataFolder(token, pnIdentifier, accountId);
        if (!metadataFolder) {
          return driveNotInitialized(res);
        }

        const sheetId = await MessageRequestSheetsService.findRequestsSpreadsheetId(
          token,
          metadataFolder.metadataFolderId,
          pnIdentifier,
          accountId
        );
        if (!sheetId) {
          return res.status(404).json({ error: 'Request not found' });
        }

        const status = accept ? 'accepted' : 'declined';
        try {
          await MessageRequestSheetsService.setRequestStatus(
            token,
            sheetId,
            requestId,
            status,
            pnIdentifier,
            accountId
          );
        } catch (e: any) {
          if (e?.message === 'Request not found') {
            return res.status(404).json({ error: 'Request not found' });
          }
          throw e;
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error responding to message request:', error);
        if (error.message?.includes('authentication failed') ||
            error?.response?.status === 401 ||
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to respond to message request',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to respond to message request'
        });
      }
    });

    app.post('/api/messages/:messageId/read', async (req, res) => {
      try {
        const { messageId } = req.params;
        const { userPnIdentifier, participantPnIdentifier, spreadsheetId: bodySpreadsheetId } = req.body;
        if (!messageId || !userPnIdentifier) {
          return res.status(400).json({ error: 'messageId and userPnIdentifier are required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, userPnIdentifier))) return;

        const { MessageSheetsService } = await import('./messageSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const pnIdentifier = userPnIdentifier;

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
        
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolvedToken = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolvedToken.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        if (!participantPnIdentifier) {
          return res.status(400).json({ error: 'participantPnIdentifier is required to mark message as read' });
        }

        const normalizedParticipantPnIdentifier = participantPnIdentifier.startsWith('pn-')
          ? participantPnIdentifier
          : `pn-${participantPnIdentifier}`;

        let conversationSheetId: string | undefined =
          typeof bodySpreadsheetId === 'string' && bodySpreadsheetId.trim()
            ? bodySpreadsheetId.trim()
            : undefined;

        const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
        const driveIndex = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);

        if (!conversationSheetId && isPnDriveIndexComplete(driveIndex)) {
          conversationSheetId = driveIndex.conversationSheets?.[normalizedParticipantPnIdentifier];
        }

        if (!conversationSheetId && isPnDriveIndexComplete(driveIndex)) {
          try {
            const inboxEntry = await MessageSheetsService.getInboxConversationByParticipant(
              token,
              driveIndex.inboxSheetId,
              normalizedParticipantPnIdentifier,
              pnIdentifier,
              accountId,
              50
            );
            conversationSheetId = inboxEntry?.spreadsheetId;
          } catch {
            /* fall through */
          }
        }

        if (!conversationSheetId) {
          return res.status(404).json({ error: 'Conversation sheet not found' });
        }

        try {
          await MessageSheetsService.markAsRead(
            token,
            conversationSheetId,
            messageId,
            pnIdentifier,
            accountId
          );
        } catch (readError: unknown) {
          const msg = readError instanceof Error ? readError.message : String(readError);
          if (msg.includes('Message not found')) {
            return res.status(404).json({ error: 'Message not found' });
          }
          throw readError;
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error marking message as read:', error);
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
        if (isGoogleSheetsRateLimit(error)) {
          return res.status(503).json({
            error: 'drive_rate_limited',
            message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
          });
        }
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to mark message as read',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to mark message as read'
        });
      }
    });

    app.delete('/api/messages/:messageId', async (req, res) => {
      try {
        const { messageId } = req.params;
        const { userPnIdentifier } = req.body;
        if (!messageId || !userPnIdentifier) {
          return res.status(400).json({ error: 'messageId and userPnIdentifier are required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, userPnIdentifier))) return;

        const { MessageSheetsService } = await import('./messageSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const pnIdentifier = userPnIdentifier;
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
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolvedToken = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolvedToken.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        const pnFolderName = `par Noir - ${pnIdentifier}`;
        const folderQuery = `name='${pnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const foldersResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
          { headers: { 'Authorization': `Bearer ${token.access_token}` } }
        );

        if (!foldersResponse.ok) {
          return res.status(500).json({ error: 'Failed to find user folder' });
        }

        const foldersData = await foldersResponse.json() as { files?: Array<{ id: string }> };
        const pnFolder = foldersData.files?.[0];
        if (!pnFolder) {
          return res.status(500).json({ error: 'User folder not found' });
        }

        const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
          token,
          pnFolder.id,
          pnIdentifier,
          accountId
        );

        const conversations = await MessageSheetsService.getConversations(
          token,
          messagesFolderId,
          pnIdentifier,
          accountId
        );

        let deleted = false;
        let deletedMediaFileId: string | undefined;
        for (const conv of conversations) {
          try {
            const result = await MessageSheetsService.deleteMessageFromConversation(
              token,
              conv.spreadsheetId,
              messageId,
              pnIdentifier,
              accountId
            );
            deleted = true;
            deletedMediaFileId = result.mediaFileId;
            break;
          } catch (e: any) {
            if (e?.message !== 'Message not found') {
              throw e;
            }
          }
        }

        if (!deleted) {
          return res.status(404).json({ error: 'Message not found' });
        }

        if (deletedMediaFileId) {
          try {
            const { googleDriveProxyService } = await import('./googleDriveProxy');
            await googleDriveProxyService.deleteFile(pnIdentifier, deletedMediaFileId, accountId);
          } catch (delErr) {
            console.warn('[delete message] attachment delete skipped:', delErr);
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error deleting message:', error);
        if (error.message?.includes('authentication failed') ||
            error?.response?.status === 401 ||
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to delete message',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to delete message'
        });
      }
    });

    // DELETE /api/messages/conversation/:participantPnIdentifier - Delete conversation
    app.delete('/api/messages/conversation/:participantPnIdentifier', async (req, res) => {
      try {
        const { participantPnIdentifier } = req.params;
        const userPnIdentifier = req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier || !participantPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and participantPnIdentifier are required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, userPnIdentifier))) return;

        const { MessageSheetsService } = await import('./messageSheetsService');
        const { ConnectionsService } = await import('./connectionsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
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
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let token;
        try {
          const resolvedToken = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          token = resolvedToken.token;
        } catch (error) {
          if (respondDriveTokenError(res, error)) return;
          throw error;
        }

        const { readPnDriveIndex, isPnDriveIndexComplete, loadPnDriveIndex, persistPnDriveIndex } =
          await import('./pnDriveIndex');
        const driveIndex = readPnDriveIndex(userCredentials.credentials as Record<string, unknown>);
        if (!isPnDriveIndexComplete(driveIndex)) {
          return driveNotInitialized(res);
        }
        const messagesFolderId = driveIndex.messagesFolderId;
        const inboxSheetId = driveIndex.inboxSheetId;
        const metadataFolderId = driveIndex.metadataFolderId;

        const normalizedParticipantPnIdentifier = participantPnIdentifier.startsWith('pn-')
          ? participantPnIdentifier
          : `pn-${participantPnIdentifier}`;

        await MessageSheetsService.deleteConversation(
          token,
          messagesFolderId,
          normalizedParticipantPnIdentifier,
          pnIdentifier,
          accountId
        );

        if (driveIndex.conversationSheets[normalizedParticipantPnIdentifier]) {
          const idx = await loadPnDriveIndex(pnIdentifier);
          if (idx) {
            const next = { ...idx, conversationSheets: { ...idx.conversationSheets } };
            delete next.conversationSheets[normalizedParticipantPnIdentifier];
            await persistPnDriveIndex(
              pnIdentifier,
              userCredentials.credentials as Record<string, unknown>,
              next
            ).catch((err: unknown) => {
              console.warn(
                '[DeleteConversation] Failed to clear conversation sheet index:',
                err instanceof Error ? err.message : err
              );
            });
          }
        }

        try {
          await MessageSheetsService.removeInboxEntry(
            token,
            inboxSheetId,
            normalizedParticipantPnIdentifier,
            pnIdentifier,
            accountId
          );
          console.log('[DeleteConversation] Removed from inbox');
        } catch (inboxError: any) {
          // Log but don't fail - inbox removal is non-critical
          console.warn('[DeleteConversation] Failed to remove from inbox:', inboxError?.message);
        }

        // Get connection ID to remove from connections sheet
        // Wrap in try-catch to ensure conversation deletion succeeds even if connection removal fails
        let connectionId: string | undefined;
        try {
          const connectionsFile = await ConnectionsService.getConnectionsFile(token.access_token, metadataFolderId, pnIdentifier);
          if (connectionsFile) {
            // Normalize when searching (handles legacy data)
            const connection = connectionsFile.connections.find(c => {
              if (!c.userPnIdentifier) {
                console.warn('[DeleteConversation] Connection missing userPnIdentifier:', c);
                return false;
              }
              // Use pn identifier directly (already normalized)
              return c.userPnIdentifier === normalizedParticipantPnIdentifier;
            });
            
            if (connection) {
              connectionId = connection.connectionId;
              await ConnectionsService.removeConnection(
                token.access_token,
                metadataFolderId,
                pnIdentifier,
                connection.connectionId,
                accountId
              );
              console.log(`[DeleteConversation] Removed connection ${connection.connectionId} from user's connections`);
            } else {
              console.warn(`[DeleteConversation] Connection not found for ${participantPnIdentifier}, conversation sheet deleted anyway`);
            }
          } else {
            console.warn(`[DeleteConversation] Connections file not found, conversation sheet deleted anyway`);
          }
        } catch (connectionError: any) {
          // Log error but don't fail the deletion - conversation sheet is already deleted
          console.error(`[DeleteConversation] Failed to remove connection from user's connections sheet:`, {
            participantPnIdentifier,
            error: connectionError?.message,
            status: connectionError?.response?.status
          });
          console.warn(`[DeleteConversation] Conversation sheet deleted, but connection removal failed. This is non-critical.`);
        }

        // Also remove connection from other user's connections sheet
        if (connectionId) {
          try {
            // Use normalized participantPnIdentifier
            const participantCredentials = await storageCredentialsService.getCredentials(normalizedParticipantPnIdentifier);
            
            if (participantCredentials?.credentials) {
              const participantGoogleDriveAccounts = participantCredentials.credentials.googleDriveAccounts || 
                (participantCredentials.credentials.googleDrive ? [participantCredentials.credentials.googleDrive] : []);
              
              if (participantGoogleDriveAccounts.length > 0) {
                const participantAccount = participantGoogleDriveAccounts[0];
                const participantAccountId = (participantAccount as any).backendId || (participantAccount as any).keyPrefix || (participantAccount as any).accountId || (participantAccount as any).id || undefined;
                // Build token object for participant
                const participantToken = {
                  access_token: participantAccount.access_token || participantAccount.accessToken,
                  refresh_token: participantAccount.refresh_token || participantAccount.refreshToken,
                  expires_at: participantAccount.expires_at,
                  expires_in: participantAccount.expires_in
                };
                
                try {
                  const { requireOwnerDriveContext, DriveIndexError } = await import('./ownerDriveContext');
                  let participantMetadataFolderId: string | undefined;
                  try {
                    const participantCtx = await requireOwnerDriveContext(
                      normalizedParticipantPnIdentifier,
                      participantAccountId
                    );
                    participantMetadataFolderId = participantCtx.index.metadataFolderId;
                  } catch (ctxError: unknown) {
                    if (ctxError instanceof DriveIndexError) {
                      console.warn(`[DeleteConversation] Other user drive index incomplete, skipping connection removal`);
                    } else {
                      throw ctxError;
                    }
                  }
                  if (participantMetadataFolderId) {
                    await ConnectionsService.removeConnection(
                      participantToken.access_token,
                      participantMetadataFolderId,
                      normalizedParticipantPnIdentifier,
                      connectionId,
                      participantAccountId
                    );
                    console.log(`[DeleteConversation] Removed connection ${connectionId} from other user's connections`);
                  }
                } catch (otherUserError: any) {
                  console.warn(`[DeleteConversation] Failed to remove connection from other user's connections sheet:`, {
                    participantPnIdentifier,
                    error: otherUserError?.message,
                    status: otherUserError?.response?.status
                  });
                  // Non-critical - connection removed from user's sheet, conversation deleted
                }
              } else {
                console.warn(`[DeleteConversation] Other user has no Google Drive connected, connection removed from user's sheet only`);
              }
            } else {
              console.warn(`[DeleteConversation] Other user's credentials not found, connection removed from user's sheet only`);
            }
          } catch (otherUserError: any) {
            console.warn(`[DeleteConversation] Failed to remove connection from other user's connections sheet:`, {
              participantPnIdentifier,
              error: otherUserError?.message
            });
            // Non-critical - connection removed from user's sheet, conversation deleted
          }
        }

        const { invalidateMessagingCachesForUsers } = await import('./messagingReadCache');
        await invalidateMessagingCachesForUsers(
          [pnIdentifier, participantPnIdentifier],
          [
            { pn: pnIdentifier, other: participantPnIdentifier },
            { pn: participantPnIdentifier, other: pnIdentifier },
          ]
        ).catch(() => undefined);

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error deleting conversation:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to delete conversation',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to delete conversation'
        });
      }
    });
}
