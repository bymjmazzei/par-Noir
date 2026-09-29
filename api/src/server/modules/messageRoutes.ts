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
import { gateFirstPartyOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import type { parseChannelListFilter } from './messagingChannel';
import { normalizeChannelClientId as normalizeChannelClientIdSync } from './messagingChannel';

const NODE_ENV = process.env.NODE_ENV || 'development';

type ChannelListFilter = ReturnType<typeof parseChannelListFilter>;

function filterConversationsByChannel<
  T extends {
    conversations: Array<{ threadType?: string; channelClientId?: string }>;
    threads: Array<{ channelClientId?: string }>;
  }
>(payload: T, filter: ChannelListFilter): T {
  if (filter.mode === 'all') return payload;
  const channel = filter.channelClientId;
  const conversations = payload.conversations.filter((c) => {
    if (c.threadType === 'group') {
      // Groups stay on the platform viewport / aggregator, not L5 channel embeds.
      return channel === 'platform';
    }
    return normalizeChannelClientIdSync(c.channelClientId) === channel;
  });
  const threads = payload.threads.filter((t) =>
    normalizeChannelClientIdSync(t.channelClientId) === channel
  );
  return { ...payload, conversations, threads };
}

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

type OwnerDriveToken = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
};

/**
 * Inbox ordering reads a group thread's mtime from the sheet, which lives on the
 * group OWNER's Drive. Under custody that token is on the owner's device, so the
 * server can only ever reach the caller's own Drive. Two earlier copies of this
 * loaded the peer's credentials row and built a token from it; one substituted
 * the caller's token when the owner was the caller, the other handed
 * access_token: undefined straight into a Sheets client.
 *
 * Ordering is not worth a cross-user read. Group threads simply fall back to
 * their inbox row's own timestamp.
 */
function ownDriveOnlyContext(
  callerPn: string,
  callerToken: OwnerDriveToken,
  callerAccountId: string | undefined
) {
  return async (ownerPnIdentifier: string) => {
    if (ownerPnIdentifier !== callerPn) return null;
    return { token: callerToken, accountId: callerAccountId };
  };
}

/**
 * Setup message routes
 */
export function setupMessageRoutes(app: express.Application, deps: MessageRouteDeps) {
  const { extractAccountId, getMetadataFolder, driveNotInitialized, emitRealtime } = deps;

    // Message endpoints (placeholder - returns empty arrays for now)
    // GET /api/messages/conversations - Get all conversation threads

    const deviceRead = async (_req: express.Request, res: express.Response) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    };
    app.get('/api/messages/conversations', deviceRead);
    app.get('/api/messages/requests', deviceRead);
    app.get('/api/messages/attachments-folder', deviceRead);
    app.get('/api/messages/inbox', deviceRead);
    app.post('/api/messages/conversation', deviceRead);

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
        if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, fromPnIdentifier))) return;
        if (!isE2E) {
          return res.status(400).json({
            error: 'encryptedContent with cryptoVersion 2 is required (client-side E2E only)'
          });
        }

        const {
          isDeviceCloudCustodyEnabled,
          enqueueSocialMailboxJob,
          getMailboxRouteKeyForOwner,
          isMailboxRouteKey,
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
          const routeKey =
            explicitRoute || (await getMailboxRouteKeyForOwner(toPnIdentifier)) || '';
          if (!routeKey) {
            return res.status(400).json({
              error: 'routeKey required',
              message:
                'Recipient has no claimed opaque mailbox route. They must unlock once to claim an inbox route.'
            });
          }

          const clientMessageId =
            typeof req.body?.messageId === 'string' ? req.body.messageId.trim() : '';
          const messageId =
            clientMessageId ||
            `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const timestamp =
            (typeof req.body?.timestamp === 'string' && req.body.timestamp) ||
            new Date().toISOString();
          const connectionId = connectionIdFromBody || `conn_pending_${messageId}`;

          // Durable throughway payload: ciphertext + connectionId. No clear from/to pair.
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
            channelClientId: normalizeChannelClientIdSync(
              typeof req.body?.channelClientId === 'string' ? req.body.channelClientId : undefined
            ),
            isConnectionRequest: !!isConnectionRequest,
            role: 'recipient'
          }, { recipientPn: toPnIdentifier });

          await enqueueSocialMailboxJob({
            routeKey,
            jobType: 'message_append',
            recipientPn: toPnIdentifier,
            payload: messagePayload
          });
          if (mediaFileId) {
            await enqueueSocialMailboxJob({
              routeKey,
              jobType: 'message_attachment',
              recipientPn: toPnIdentifier,
              payload: sanitizeMailboxPayload({
                messageId,
                mediaFileId,
                mediaMimeType,
                mediaBackend,
                mediaEnvelopesByPn,
                connectionId
              }, { recipientPn: toPnIdentifier })
            });
          }
          // Notifications UI uses /api/notifications Sheets + push/new_message realtime —
          // do not enqueue notification_row (browser never applied it; backlog starved chat).

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

          const realtimeChannel =
            typeof messagePayload.channelClientId === 'string'
              ? messagePayload.channelClientId
              : undefined;
          emitRealtime(fromPnIdentifier, 'new_message', {
            messageId,
            throughway: true,
            encryptedContent,
            cryptoVersion: 2,
            connectionId,
            timestamp,
            ...(realtimeChannel ? { channelClientId: realtimeChannel } : {})
          });
          emitRealtime(toPnIdentifier, 'new_message', {
            messageId,
            throughway: true,
            encryptedContent,
            cryptoVersion: 2,
            connectionId,
            timestamp,
            ...(realtimeChannel ? { channelClientId: realtimeChannel } : {})
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

    app.post('/api/messages/requests', deviceRead);
    app.post('/api/messages/requests/:requestId/respond', deviceRead);
    app.post('/api/messages/:messageId/read', deviceRead);
    app.delete('/api/messages/:messageId', deviceRead);
    app.delete('/api/messages/conversation/:participantPnIdentifier', deviceRead);

    // POST /api/messages/apply-inbound
    //
    // Receiving half of the DM rail. Browser drains message_append from its
    // opaque mailbox and posts ciphertext here so the write lands in the
    // caller's own Drive with the forwarded cloud token. Peer identity is
    // resolved from connectionId (durable payload has no clear from/to).
    app.post('/api/messages/apply-inbound', async (req, res) => {
      try {
        const {
          userPnIdentifier,
          jobType,
          connectionId: bodyConnectionId,
          messageId,
          encryptedContent,
          timestamp,
          role,
          mediaFileId,
          mediaMimeType,
          mediaBackend,
          channelClientId: bodyChannel
        } = req.body || {};

        if (!userPnIdentifier || !jobType) {
          return res.status(400).json({ error: 'userPnIdentifier and jobType are required' });
        }
        if (String(jobType) !== 'message_append') {
          return res.status(400).json({ error: 'Unsupported jobType' });
        }
        const connectionId =
          typeof bodyConnectionId === 'string' ? bodyConnectionId.trim() : '';
        if (!connectionId) {
          return res.status(400).json({ error: 'connectionId is required' });
        }
        if (typeof messageId !== 'string' || !messageId.trim()) {
          return res.status(400).json({ error: 'messageId is required' });
        }
        if (typeof encryptedContent !== 'string' || !encryptedContent) {
          return res.status(400).json({
            error: 'encryptedContent with cryptoVersion 2 is required'
          });
        }

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted) {
          respondCloudOnDevice(res);
          return;
        }
        const { invalidateMessagingCachesForUsers } = await import('./messagingReadCache');
        await invalidateMessagingCachesForUsers([String(userPnIdentifier)]).catch(() => undefined);
        return res.json({
          success: true,
          spreadsheetId: submitted.spreadsheetId,
          connectionId,
          peerPnIdentifier: submitted.peerPnIdentifier,
          encryptedContent,
        });

      } catch (error: any) {
        messagingLog.error('[ApplyInbound] message_append failed', {
          message: error?.message
        });
        if (
          error?.message?.includes('authentication failed') ||
          error?.response?.status === 401 ||
          error?.code === 401
        ) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to apply inbound message',
          error_description:
            safeClientErrorMessage(error, NODE_ENV === 'production') ||
            'Failed to apply inbound message'
        });
      }
    });
}
