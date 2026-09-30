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
        const { requesterPnIdentifier, recipientPnIdentifier, requesterMlKemPublicKey } = req.body;
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

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted) {
          respondCloudOnDevice(res);
          return;
        }

        const { ConnectionsService } = await import('./connectionsService');
        safeLogger.info('[ConnectionRequest] start', { category: 'connections' });
        const connectionId =
          typeof submitted.connectionId === 'string' && submitted.connectionId
            ? submitted.connectionId
            : ConnectionsService.generateConnectionId(requesterPnIdentifier, recipientPnIdentifier);
        const now = new Date().toISOString();

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

        if (!delivered) {
          // Requester row already written; peer cannot receive until they claim a
          // mailbox route (unlock messaging/dashboard once). Do not pretend success.
          safeLogger.warn('[ConnectionRequest] peer mailbox not ready; request not delivered', {
            category: 'connections'
          });
          return res.status(409).json({
            success: false,
            connection,
            delivered: false,
            error: 'peer_mailbox_unavailable',
            error_description:
              'Connection saved on your side, but their inbox is not ready yet. Ask them to unlock messaging once, then try Connect again.'
          });
        }

        return res.json({
          success: true,
          connection,
          delivered: true,
          spreadsheetId: submitted.spreadsheetId,
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
        const { userPnIdentifier, kemCiphertext, wrappedMessageRootKey, kemAlgId, acceptorMailboxRouteKey, mailboxRouteKey, channelClientId: bodyChannelClientId } = req.body;
        const { normalizeChannelClientId } = await import('./messagingChannel');
        const channelClientId = normalizeChannelClientId(
          typeof bodyChannelClientId === 'string' ? bodyChannelClientId : undefined
        );
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }
        if (!kemCiphertext || !wrappedMessageRootKey || kemAlgId !== 'ML-KEM-768') {
          return res.status(400).json({
            error: 'kemCiphertext, wrappedMessageRootKey, and kemAlgId (ML-KEM-768) are required'
          });
        }

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        const otherUserPnIdentifier = String(
          submitted?.peerPnIdentifier || req.body?.peerPnIdentifier || ''
        );
        if (!submitted?.spreadsheetId || !otherUserPnIdentifier) {
          respondCloudOnDevice(res);
          return;
        }
        const acceptorRouteKey =
          (typeof acceptorMailboxRouteKey === 'string' && acceptorMailboxRouteKey.trim()) ||
          (typeof mailboxRouteKey === 'string' && mailboxRouteKey.trim()) ||
          '';
        if (!acceptorRouteKey) {
          return res.status(400).json({
            success: false,
            delivered: false,
            error: 'acceptor_mailbox_route_required',
            error_description:
              'Accept needs your mailbox route so the requester can message you. Unlock messaging once and try Accept again.'
          });
        }
        const { enqueueSocialJob } = await import('./socialRail');
        const delivered = await enqueueSocialJob({
          jobType: 'connection_accept',
          peerPn: otherUserPnIdentifier,
          requestId: String(connectionId),
          sealed: { peerPnIdentifier: String(userPnIdentifier) },
          extra: {
            connectionId,
            kemCiphertext,
            wrappedMessageRootKey,
            channelClientId,
            peerMailboxRouteKey: acceptorRouteKey,
            acceptorMailboxRouteKey: acceptorRouteKey,
            conversationSpreadsheetId:
              typeof req.body?.conversationSpreadsheetId === 'string'
                ? req.body.conversationSpreadsheetId
                : undefined
          }
        });
        if (!delivered) {
          return res.status(409).json({
            success: false,
            delivered: false,
            error: 'peer_mailbox_unavailable',
            error_description:
              'Accepted on your side, but their inbox is not ready yet. Ask them to unlock messaging once, then try Accept again.'
          });
        }
        return res.json({ success: true, delivered: true, spreadsheetId: submitted.spreadsheetId });
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
        const { userPnIdentifier, peerPnIdentifier } = req.body || {};
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }
        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        const peer = String(submitted?.peerPnIdentifier || peerPnIdentifier || '');
        if (!submitted?.spreadsheetId || !peer) {
          respondCloudOnDevice(res);
          return;
        }
        const { enqueueSocialJob } = await import('./socialRail');
        await enqueueSocialJob({
          jobType: 'connection_reject',
          peerPn: peer,
          requestId: `reject:${connectionId}`,
          sealed: { peerPnIdentifier: String(userPnIdentifier) },
          extra: { connectionId }
        });
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error rejecting connection request:', error);
        return res.status(500).json({
          error: 'Failed to reject connection request',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to reject connection request'
        });
      }
    });

    app.get('/api/connections', async (_req, res) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    });

    app.post('/api/connections/follow', async (req, res) => {
      try {
        const { userPnIdentifier, peerPnIdentifier } = req.body || {};
        if (!userPnIdentifier || !peerPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and peerPnIdentifier are required' });
        }
        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted?.spreadsheetId) {
          respondCloudOnDevice(res);
          return;
        }
        const { enqueueSocialJob } = await import('./socialRail');
        await enqueueSocialJob({
          jobType: 'follower_add',
          peerPn: String(peerPnIdentifier),
          requestId: `follow:${peerPnIdentifier}`,
          sealed: { peerPnIdentifier: String(userPnIdentifier) },
          extra: { connectionId: `follow:${peerPnIdentifier}` }
        });
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: 'Failed to follow', error_description: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    app.post('/api/connections/unfollow', async (req, res) => {
      try {
        const { userPnIdentifier, peerPnIdentifier } = req.body || {};
        if (!userPnIdentifier || !peerPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and peerPnIdentifier are required' });
        }
        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted?.spreadsheetId) {
          respondCloudOnDevice(res);
          return;
        }
        const { enqueueSocialJob } = await import('./socialRail');
        await enqueueSocialJob({
          jobType: 'follower_remove',
          peerPn: String(peerPnIdentifier),
          requestId: `unfollow:${peerPnIdentifier}`,
          extra: { connectionId: `unfollow:${peerPnIdentifier}` }
        });
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: 'Failed to unfollow', error_description: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    app.get('/api/connections/followers', async (_req, res) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    });

    app.get('/api/connections/following', async (_req, res) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    });

    app.get('/api/connections/following/feeds', async (_req, res) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    });

    app.get('/api/connections/following/users', async (_req, res) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    });

    app.get('/api/connections/pending', async (_req, res) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    });

    app.get('/api/connections/:otherUserPnIdentifier/status', async (_req, res) => {
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    });

    app.delete('/api/connections/:connectionId', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { userPnIdentifier, peerPnIdentifier } = req.body || {};
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }
        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        const peer = String(submitted?.peerPnIdentifier || peerPnIdentifier || '');
        if (!submitted?.spreadsheetId || !peer) {
          respondCloudOnDevice(res);
          return;
        }
        const { enqueueSocialJob } = await import('./socialRail');
        const delivered = await enqueueSocialJob({
          jobType: 'connection_delete',
          peerPn: peer,
          requestId: `delete:${connectionId}`,
          extra: { connectionId }
        });
        return res.json({ success: true, delivered });
      } catch (error: any) {
        return res.status(500).json({ error: 'Failed to delete connection', error_description: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

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

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted) {
          respondCloudOnDevice(res);
          return;
        }
        return res.json({ success: true, jobType, peerPnIdentifier, ...submitted });

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
