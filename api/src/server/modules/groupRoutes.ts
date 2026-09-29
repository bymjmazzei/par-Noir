/**
 * Group Routes
 * Group creation, membership management, and group messaging endpoints
 */

import express from 'express';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface GroupRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
  emitRealtime: (pnIdentifier: string, event: string, payload: Record<string, unknown>) => void;
}

/**
 * Setup group routes
 */
export function setupGroupRoutes(app: express.Application, deps: GroupRouteDeps) {
  const { extractAccountId, getMetadataFolder, emitRealtime } = deps;

    app.get('/api/groups', async (req, res) => {
      try {
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Error listing groups:', error);
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');
        if (isGoogleSheetsRateLimit(error)) {
          return res.status(503).json({
            error: 'drive_rate_limited',
            message: 'Google Drive is temporarily busy. Please wait a moment and try again.',
            retryable: true,
          });
        }
        return res.status(500).json({
          error: 'Failed to list groups',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.post('/api/groups', async (req, res) => {
      try {
        const { ownerPnIdentifier, title, groupId, members } = req.body as {
          ownerPnIdentifier?: string;
          title?: string;
          groupId?: string;
          members?: Array<{
            memberPnIdentifier: string;
            wrappedChatKey: string;
            accessRole?: 'readWrite' | 'readOnly';
          }>;
        };
        if (!ownerPnIdentifier || !title || !groupId || !Array.isArray(members) || members.length === 0) {
          return res.status(400).json({
            error: 'ownerPnIdentifier, title, groupId, and members are required'
          });
        }
        if (members.length > 15) {
          return res.status(400).json({ error: 'Maximum 15 group members' });
        }

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted?.spreadsheetId) {
          respondCloudOnDevice(res);
          return;
        }
        const createdAt = new Date().toISOString();
        const { enqueueSocialJob } = await import('./socialRail');
        const { mailboxRequestId } = await import('./socialMailboxService');
        await Promise.all(
          members
            .filter((m) => m.memberPnIdentifier !== ownerPnIdentifier)
            .map((m) =>
              enqueueSocialJob({
                jobType: 'group_inbox_update',
                peerPn: m.memberPnIdentifier,
                requestId: mailboxRequestId(['create', groupId, m.memberPnIdentifier]),
                sealed: {
                  ownerPnIdentifier,
                  members: members.map((m) => ({
                    memberPnIdentifier: m.memberPnIdentifier,
                    wrappedChatKey: m.wrappedChatKey,
                    accessRole: m.accessRole === 'readOnly' ? 'readOnly' : 'readWrite'
                  }))
                },
                extra: {
                  groupId,
                  title: title.trim(),
                  createdAt,
                  accessRole: m.accessRole === 'readOnly' ? 'readOnly' : 'readWrite',
                  wrappedChatKey: m.wrappedChatKey,
                  preview: `Added to group: ${title.trim()}`
                }
              })
            )
        );
        return res.json({ success: true, groupId, title: title.trim() });
      } catch (error: any) {
        console.error('Error creating group:', error);
        return res.status(500).json({
          error: 'Failed to create group',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.post('/api/groups/:groupId/members', async (req, res) => {
      try {
        const { groupId } = req.params;
        const { ownerPnIdentifier, memberPnIdentifier, wrappedChatKey, accessRole } = req.body as {
          ownerPnIdentifier?: string;
          memberPnIdentifier?: string;
          wrappedChatKey?: string;
          accessRole?: 'readWrite' | 'readOnly';
        };
        if (!ownerPnIdentifier || !memberPnIdentifier || !wrappedChatKey) {
          return res.status(400).json({
            error: 'ownerPnIdentifier, memberPnIdentifier, and wrappedChatKey are required'
          });
        }

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted?.spreadsheetId) {
          respondCloudOnDevice(res);
          return;
        }
        const title = String((req.body as { title?: string })?.title || '');
        const createdAt = new Date().toISOString();
        const role = accessRole === 'readOnly' ? 'readOnly' : 'readWrite';
        const sealedMembers = [
          {
            memberPnIdentifier,
            wrappedChatKey,
            accessRole: role
          }
        ];
        const { enqueueSocialJob } = await import('./socialRail');
        const { mailboxRequestId } = await import('./socialMailboxService');
        const delivered = await enqueueSocialJob({
          jobType: 'group_inbox_update',
          peerPn: memberPnIdentifier,
          requestId: mailboxRequestId(['member', groupId, memberPnIdentifier]),
          sealed: { ownerPnIdentifier, members: sealedMembers },
          extra: {
            groupId,
            title,
            createdAt,
            accessRole: role,
            wrappedChatKey,
            preview: `Added to group: ${title}`
          }
        });

        // Existing members need the new row for fanout.
        await Promise.all(
          sealedMembers
            .filter((m) => m.memberPnIdentifier !== ownerPnIdentifier && m.memberPnIdentifier !== memberPnIdentifier)
            .map((m) =>
              enqueueSocialJob({
                jobType: 'group_inbox_update',
                peerPn: m.memberPnIdentifier,
                requestId: mailboxRequestId(['roster', groupId, memberPnIdentifier, m.memberPnIdentifier]),
                sealed: { ownerPnIdentifier, members: sealedMembers },
                extra: {
                  groupId,
                  title,
                  createdAt,
                  accessRole: m.accessRole,
                  wrappedChatKey: m.wrappedChatKey,
                  preview: `Member added: ${title}`
                }
              })
            )
        );

        return res.json({ success: true, delivered });
      } catch (error: any) {
        console.error('Error adding group member:', error);
        return res.status(500).json({
          error: 'Failed to add group member',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.delete('/api/groups/:groupId/members/:memberPn', async (req, res) => {
      try {
        const { groupId, memberPn } = req.params;
        const ownerPnIdentifier = (req.body?.ownerPnIdentifier || req.query.ownerPnIdentifier) as string;
        const keyRotation = req.body?.keyRotation as Array<{
          memberPnIdentifier: string;
          wrappedChatKey: string;
          accessRole: string;
        }> | undefined;
        if (!ownerPnIdentifier) {
          return res.status(400).json({ error: 'ownerPnIdentifier is required' });
        }
        if (!keyRotation || !Array.isArray(keyRotation) || keyRotation.length === 0) {
          return res.status(400).json({
            error: 'keyRotation is required (new wrapped keys for remaining members)'
          });
        }
        if (memberPn === ownerPnIdentifier) {
          return res.status(400).json({ error: 'Owner cannot be removed from the group' });
        }

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted?.spreadsheetId) {
          respondCloudOnDevice(res);
          return;
        }
        const { enqueueSocialJob } = await import('./socialRail');
        const { mailboxRequestId } = await import('./socialMailboxService');
        await enqueueSocialJob({
          jobType: 'group_inbox_update',
          peerPn: memberPn,
          requestId: mailboxRequestId(['remove', groupId, memberPn]),
          extra: { groupId, removed: true }
        });

        await Promise.all(
          keyRotation
            .filter((rot) => rot.memberPnIdentifier !== ownerPnIdentifier)
            .map((rot) =>
              enqueueSocialJob({
                jobType: 'group_inbox_update',
                peerPn: rot.memberPnIdentifier,
                requestId: mailboxRequestId(['rotate', groupId, rot.memberPnIdentifier, String(Date.now())]),
                sealed: {
                  keyRotation: keyRotation.map((k) => ({
                    memberPnIdentifier: k.memberPnIdentifier,
                    wrappedChatKey: k.wrappedChatKey,
                    accessRole: k.accessRole === 'readOnly' ? 'readOnly' : 'readWrite'
                  }))
                },
                extra: { groupId }
              })
            )
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error removing group member:', error);
        return res.status(500).json({
          error: 'Failed to remove group member',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // POST /api/groups/:groupId/messages — throughway fan-out only (own sheet via apply).
    app.post('/api/groups/:groupId/messages', async (req, res) => {
      try {
        const { groupId } = req.params;
        const {
          fromPnIdentifier,
          userPnIdentifier,
          encryptedContent,
          cryptoVersion,
          messageId: bodyMessageId,
          timestamp: bodyTimestamp,
          mediaFileId,
          mediaMimeType,
          mediaBackend,
          mediaEnvelopesByPn
        } = req.body || {};
        const senderPn = String(fromPnIdentifier || userPnIdentifier || '');
        if (!senderPn || !groupId) {
          return res.status(400).json({ error: 'fromPnIdentifier and groupId are required' });
        }
        if (cryptoVersion !== 2 || typeof encryptedContent !== 'string' || !encryptedContent) {
          return res.status(400).json({
            error: 'encryptedContent with cryptoVersion 2 is required'
          });
        }

        const { enqueueSocialJob } = await import('./socialRail');
        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted?.spreadsheetId) {
          respondCloudOnDevice(res);
          return;
        }
        const messageId =
          (typeof bodyMessageId === 'string' && bodyMessageId.trim()) ||
          `gmsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const timestamp =
          (typeof bodyTimestamp === 'string' && bodyTimestamp) || new Date().toISOString();
        const peers: string[] = [];
        if (Array.isArray(req.body?.recipientPnIdentifiers)) {
          for (const pn of req.body.recipientPnIdentifiers) {
            if (typeof pn === 'string' && pn && pn !== senderPn) peers.push(pn);
          }
        }
        if (peers.length === 0) {
          return res.status(400).json({
            error: 'no_group_peers',
            message:
              'Group roster has no other members to deliver to. Re-open the group or re-add members so the local roster is complete.'
          });
        }
        const delivered = await Promise.all(
          peers.map(async (peerPn) => {
            const ok = await enqueueSocialJob({
              jobType: 'group_message_append',
              peerPn,
              requestId: messageId,
              sealed: {
                fromPnIdentifier: senderPn,
                encryptedContent,
                mediaFileId,
                mediaMimeType,
                mediaBackend,
                mediaEnvelopesByPn
              },
              extra: {
                groupId,
                messageId,
                timestamp,
                cryptoVersion: 2,
                role: 'recipient'
              }
            });
            return ok;
          })
        );
        const deliveredCount = delivered.filter(Boolean).length;
        if (deliveredCount === 0) {
          return res.status(502).json({
            error: 'group_fanout_failed',
            message:
              'Could not enqueue the group message to any peer mailbox. Peers may need to unlock messaging once to claim a route.'
          });
        }

        emitRealtime(senderPn, 'new_message', {
          groupId,
          messageId,
          throughway: true,
          encryptedContent,
          cryptoVersion: 2,
          timestamp
        });
        for (const peerPn of peers) {
          emitRealtime(peerPn, 'new_message', {
            groupId,
            messageId,
            throughway: true,
            encryptedContent,
            cryptoVersion: 2,
            timestamp
          });
          emitRealtime(peerPn, 'mailbox_pending', { jobType: 'group_message_append', messageId });
        }

        return res.json({
          success: true,
          delivery: 'throughway',
          deliveredPeers: deliveredCount,
          peerCount: peers.length,
          message: {
            messageId,
            fromPnIdentifier: senderPn,
            toPnIdentifier: groupId,
            encryptedContent,
            cryptoVersion: 2,
            timestamp,
            read: true,
            encrypted: true,
            mediaFileId,
            mediaMimeType,
            mediaBackend
          }
        });
      } catch (error: any) {
        console.error('Error sending group message:', error);
        return res.status(500).json({
          error: 'Failed to send group message',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // GET /api/groups/:groupId/roster — full member list for fanout (caller must be a member).
    app.get('/api/groups/:groupId/roster', async (req, res) => {
      try {
        const { groupId } = req.params;
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier || !groupId) {
          return res.status(400).json({ error: 'userPnIdentifier and groupId are required' });
        }
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Error listing group roster:', error);
        return res.status(500).json({
          error: 'Failed to list group roster',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // GET /api/groups/:groupId/messages — read caller's own dual-silo conversation sheet.
    app.get('/api/groups/:groupId/messages', async (req, res) => {
      try {
        const { groupId } = req.params;
        const userPnIdentifier = req.query.userPnIdentifier as string;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
        const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
        if (!userPnIdentifier || !groupId) {
          return res.status(400).json({ error: 'userPnIdentifier and groupId are required' });
        }

        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Error loading group messages:', error);
        return res.status(500).json({
          error: 'Failed to load group messages',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // POST /api/groups/apply-inbound
    //
    // Receiving half of the rail for group jobs. The member's or owner's own
    // device posts here after pulling the job from its mailbox, so the write
    // lands in its own cloud with its own forwarded token.
    app.post('/api/groups/apply-inbound', async (req, res) => {
      try {
        const { userPnIdentifier, jobType, groupId } = req.body || {};
        if (!userPnIdentifier || !jobType || !groupId) {
          return res.status(400).json({ error: 'userPnIdentifier, jobType and groupId are required' });
        }
        if (jobType !== 'group_message_append' && jobType !== 'group_inbox_update') {
          return res.status(400).json({ error: 'Unsupported jobType' });
        }

        const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
        const submitted = readDeviceCloudResult(req.body);
        if (!submitted) {
          respondCloudOnDevice(res);
          return;
        }
        return res.json({ success: true, jobType, groupId, ...submitted });

      } catch (error: any) {
        console.error('Error applying inbound group job:', error);
        return res.status(500).json({
          error: 'Failed to apply inbound group job',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });
}
