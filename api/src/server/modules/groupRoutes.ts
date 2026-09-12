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
        const { GroupSheetsService } = await import('./groupSheetsService');
        const { requireOwnerDriveContextFromReq, DriveIndexError } = await import('./ownerDriveToken');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');

        let ctx;
        try {
          ctx = await requireOwnerDriveContextFromReq(req, userPnIdentifier);
        } catch (error: unknown) {
          if (error instanceof DriveIndexError) {
            return res.json({ groups: [] });
          }
          throw error;
        }

        const groups = await GroupSheetsService.listGroupsForUser(
          ctx.token,
          ctx.sheetId(PN_DRIVE_SHEET_KEYS.GROUPS),
          ctx.pnIdentifier,
          ctx.accountId
        );
        return res.json({ groups });
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

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { ConnectionsService } = await import('./connectionsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

        const ownerCreds = await storageCredentialsService.getCredentials(ownerPnIdentifier);
        if (!ownerCreds?.credentials) {
          return res.status(404).json({ error: 'Owner credentials not found' });
        }
        const accounts =
          ownerCreds.credentials.googleDriveAccounts ||
          (ownerCreds.credentials.googleDrive ? [ownerCreds.credentials.googleDrive] : []);
        if (accounts.length === 0) {
          return res.status(404).json({ error: 'Owner has no Google Drive connected' });
        }
        const account = accounts[0];
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, ownerPnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
        const metadataFolder = await getMetadataFolder(token, ownerPnIdentifier, accountId);
        if (!metadataFolder?.metadataFolderId) {
          return res.status(404).json({ error: 'Owner metadata folder not found' });
        }

        for (const m of members) {
          if (m.memberPnIdentifier === ownerPnIdentifier) continue;
          const connected = await ConnectionsService.areConnected(
            token.access_token,
            metadataFolder.metadataFolderId,
            ownerPnIdentifier,
            m.memberPnIdentifier
          );
          if (!connected) {
            return res.status(403).json({
              error: `Not connected to ${m.memberPnIdentifier}`,
              requiresConnection: true
            });
          }
        }

        const createdAt = new Date().toISOString();
        const sheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          token,
          metadataFolder.metadataFolderId,
          ownerPnIdentifier,
          accountId
        );
        const memberInputs = members.map((m) => ({
          memberPnIdentifier: m.memberPnIdentifier,
          accessRole: (m.accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as 'readWrite' | 'readOnly',
          wrappedChatKey: m.wrappedChatKey
        }));
        await GroupSheetsService.appendGroupMembers(
          token,
          sheetId,
          groupId,
          ownerPnIdentifier,
          title,
          createdAt,
          memberInputs,
          ownerPnIdentifier,
          accountId
        );

        const { MessageSheetsService } = await import('./messageSheetsService');
        const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
          token,
          metadataFolder.pnFolderId!,
          ownerPnIdentifier,
          accountId
        );
        const ownerConvId = await MessageSheetsService.getOrCreateGroupConversationSheet(
          token,
          messagesFolderId,
          groupId,
          ownerPnIdentifier,
          accountId
        );
        await GroupSheetsService.updateConversationSpreadsheetId(
          token,
          sheetId,
          groupId,
          ownerPnIdentifier,
          ownerConvId,
          ownerPnIdentifier,
          accountId
        );

        // Dual silo: each member creates their own conversation sheet on apply.
        const { enqueueSocialJob } = await import('./socialRail');
        await Promise.all(
          members
            .filter((m) => m.memberPnIdentifier !== ownerPnIdentifier)
            .map((m) =>
              enqueueSocialJob({
                jobType: 'group_inbox_update',
                peerPn: m.memberPnIdentifier,
                requestId: `create:${groupId}:${m.memberPnIdentifier}`,
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

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { ConnectionsService } = await import('./connectionsService');
        const { MessageSheetsService } = await import('./messageSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

        const ownerCreds = await storageCredentialsService.getCredentials(ownerPnIdentifier);
        if (!ownerCreds?.credentials) {
          return res.status(404).json({ error: 'Owner credentials not found' });
        }
        const accounts =
          ownerCreds.credentials.googleDriveAccounts ||
          (ownerCreds.credentials.googleDrive ? [ownerCreds.credentials.googleDrive] : []);
        if (accounts.length === 0) {
          return res.status(404).json({ error: 'Owner has no Google Drive connected' });
        }
        const account = accounts[0];
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, ownerPnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
        const metadataFolder = await getMetadataFolder(token, ownerPnIdentifier, accountId);
        if (!metadataFolder?.metadataFolderId) {
          return res.status(404).json({ error: 'Owner metadata folder not found' });
        }

        const connected = await ConnectionsService.areConnected(
          token.access_token,
          metadataFolder.metadataFolderId,
          ownerPnIdentifier,
          memberPnIdentifier
        );
        if (!connected) {
          return res.status(403).json({ error: 'Owner must be connected to the new member', requiresConnection: true });
        }

        const sheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          token,
          metadataFolder.metadataFolderId,
          ownerPnIdentifier,
          accountId
        );
        const ownerRows = await GroupSheetsService.listGroupsForUser(
          token,
          sheetId,
          ownerPnIdentifier,
          accountId
        );
        const groupMeta = ownerRows.find((r) => r.groupId === groupId);
        if (!groupMeta) {
          return res.status(404).json({ error: 'Group not found' });
        }
        const title = groupMeta.title;
        const createdAt = groupMeta.createdAt;
        const role = accessRole === 'readOnly' ? 'readOnly' : 'readWrite';

        await GroupSheetsService.appendSingleMember(
          token,
          sheetId,
          groupId,
          ownerPnIdentifier,
          title,
          createdAt,
          { memberPnIdentifier, accessRole: role, wrappedChatKey },
          ownerPnIdentifier,
          accountId
        );

        const ownerConvSheetId = await GroupSheetsService.getCanonicalGroupConversationSpreadsheetId(
          token,
          sheetId,
          groupId,
          ownerPnIdentifier,
          accountId
        );
        if (!ownerConvSheetId) {
          return res.status(404).json({ error: 'Group conversation not found on owner Drive' });
        }

        const { enqueueSocialJob } = await import('./socialRail');
        const delivered = await enqueueSocialJob({
          jobType: 'group_inbox_update',
          peerPn: memberPnIdentifier,
          requestId: `member:${groupId}:${memberPnIdentifier}`,
          sealed: { ownerPnIdentifier },
          extra: {
            groupId,
            title,
            createdAt,
            accessRole: role,
            wrappedChatKey,
            preview: `Added to group: ${title}`
          }
        });

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

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

        const ownerCreds = await storageCredentialsService.getCredentials(ownerPnIdentifier);
        if (!ownerCreds?.credentials) {
          return res.status(404).json({ error: 'Owner credentials not found' });
        }
        const accounts =
          ownerCreds.credentials.googleDriveAccounts ||
          (ownerCreds.credentials.googleDrive ? [ownerCreds.credentials.googleDrive] : []);
        if (accounts.length === 0) {
          return res.status(404).json({ error: 'No Google Drive connected' });
        }
        const account = accounts[0];
        let accountId = account ? extractAccountId(account) : undefined;
        let token;
        try {
          const resolved = await resolveOwnerDriveToken(req, ownerPnIdentifier, { account, accountId });
          token = resolved.token;
          accountId = resolved.accountId ?? accountId;
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
        const metadataFolder = await getMetadataFolder(token, ownerPnIdentifier, accountId);
        if (!metadataFolder?.metadataFolderId) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }
        const sheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          token,
          metadataFolder.metadataFolderId,
          ownerPnIdentifier,
          accountId
        );
        const okOwner = await GroupSheetsService.rotateGroupMemberKeys(
          token,
          sheetId,
          groupId,
          memberPn,
          keyRotation.map((k) => ({
            memberPnIdentifier: k.memberPnIdentifier,
            wrappedChatKey: k.wrappedChatKey,
            accessRole: (k.accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as 'readWrite' | 'readOnly'
          })),
          ownerPnIdentifier,
          accountId
        );
        if (!okOwner) {
          return res.status(404).json({ error: 'Group member not found' });
        }

        // The removed member drops their own group row, and each remaining
        // member rewraps their own chat key. Both used to run against their
        // Drives from here.
        const { enqueueSocialJob } = await import('./socialRail');
        await enqueueSocialJob({
          jobType: 'group_inbox_update',
          peerPn: memberPn,
          requestId: `remove:${groupId}:${memberPn}`,
          extra: { groupId, removed: true }
        });

        await Promise.all(
          keyRotation
            .filter((rot) => rot.memberPnIdentifier !== ownerPnIdentifier)
            .map((rot) =>
              enqueueSocialJob({
                jobType: 'group_inbox_update',
                peerPn: rot.memberPnIdentifier,
                requestId: `rotate:${groupId}:${rot.memberPnIdentifier}:${Date.now()}`,
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

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { requireOwnerDriveContextFromReq, DriveIndexError } = await import('./ownerDriveToken');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');
        const { enqueueSocialJob } = await import('./socialRail');
        const { isDeviceCloudCustodyEnabled } = await import('./socialMailboxService');

        if (!isDeviceCloudCustodyEnabled()) {
          return res.status(503).json({
            error: 'device_cloud_custody_required',
            message: 'Group messaging requires device cloud custody.'
          });
        }

        let ctx;
        try {
          ctx = await requireOwnerDriveContextFromReq(req, senderPn);
        } catch (error: unknown) {
          if (error instanceof DriveIndexError) {
            return res.status(404).json({ error: 'Drive not initialized' });
          }
          throw error;
        }

        const groups = await GroupSheetsService.listGroupsForUser(
          ctx.token,
          ctx.sheetId(PN_DRIVE_SHEET_KEYS.GROUPS),
          ctx.pnIdentifier,
          ctx.accountId
        );
        const myRows = groups.filter((g) => g.groupId === groupId);
        const myRow = myRows.find((g) => g.memberPnIdentifier === senderPn) || myRows[0];
        if (!myRow) {
          return res.status(403).json({ error: 'Not a member of this group' });
        }
        if (myRow.accessRole === 'readOnly') {
          return res.status(403).json({ error: 'Read-only members cannot send' });
        }

        const messageId =
          (typeof bodyMessageId === 'string' && bodyMessageId.trim()) ||
          `gmsg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const timestamp =
          (typeof bodyTimestamp === 'string' && bodyTimestamp) || new Date().toISOString();

        const memberPns = [
          ...new Set(myRows.map((r) => r.memberPnIdentifier).filter(Boolean))
        ];

        const peers = memberPns.filter((pn) => pn !== senderPn);
        if (peers.length === 0 && Array.isArray(req.body?.recipientPnIdentifiers)) {
          for (const pn of req.body.recipientPnIdentifiers) {
            if (typeof pn === 'string' && pn && pn !== senderPn) peers.push(pn);
          }
        }
        await Promise.all(
          peers.map(async (peerPn) => {
            await enqueueSocialJob({
              jobType: 'group_message_append',
              peerPn,
              requestId: `gmsg:${messageId}:${peerPn}`,
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
          })
        );

        emitRealtime(senderPn, 'new_message', { groupId, messageId, throughway: true });
        for (const peerPn of peers) {
          emitRealtime(peerPn, 'mailbox_pending', { jobType: 'group_message_append', messageId });
        }

        return res.json({
          success: true,
          delivery: 'throughway',
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

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { MessageSheetsService } = await import('./messageSheetsService');
        const { requireOwnerDriveContextFromReq, DriveIndexError } = await import('./ownerDriveToken');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');

        let ctx;
        try {
          ctx = await requireOwnerDriveContextFromReq(req, userPnIdentifier);
        } catch (error: unknown) {
          if (error instanceof DriveIndexError) {
            return res.json({ messages: [], total: 0 });
          }
          throw error;
        }

        const groups = await GroupSheetsService.listGroupsForUser(
          ctx.token,
          ctx.sheetId(PN_DRIVE_SHEET_KEYS.GROUPS),
          ctx.pnIdentifier,
          ctx.accountId
        );
        const myRow = groups.find(
          (g) => g.groupId === groupId && g.memberPnIdentifier === userPnIdentifier
        ) || groups.find((g) => g.groupId === groupId);
        if (!myRow) {
          return res.status(403).json({ error: 'Not a member of this group' });
        }

        let convSheetId =
          (typeof req.query.spreadsheetId === 'string' && req.query.spreadsheetId) ||
          myRow.conversationSpreadsheetId;
        if (!convSheetId) {
          const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
            ctx.token,
            ctx.index.pnFolderId,
            ctx.pnIdentifier,
            ctx.accountId
          );
          convSheetId = await MessageSheetsService.getOrCreateGroupConversationSheet(
            ctx.token,
            messagesFolderId,
            groupId,
            ctx.pnIdentifier,
            ctx.accountId
          );
          await GroupSheetsService.updateConversationSpreadsheetId(
            ctx.token,
            ctx.sheetId(PN_DRIVE_SHEET_KEYS.GROUPS),
            groupId,
            userPnIdentifier,
            convSheetId,
            ctx.pnIdentifier,
            ctx.accountId
          );
        }

        const result = await MessageSheetsService.getMessages(
          ctx.token,
          convSheetId,
          '',
          '',
          ctx.pnIdentifier,
          ctx.accountId,
          {
            limit,
            offset,
            includeTotal: true,
            relayOnly: true
          }
        );
        return res.json({ messages: result.messages, total: result.total, spreadsheetId: convSheetId });
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

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { MessageSheetsService } = await import('./messageSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');

        const pnIdentifier = String(userPnIdentifier);
        const credentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!credentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }
        const accounts =
          credentials.credentials.googleDriveAccounts ||
          (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);
        const account = accounts.length > 0 ? accounts[0] : null;
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
        const metadataFolder = await getMetadataFolder(token, pnIdentifier, accountId);
        if (!metadataFolder?.metadataFolderId) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }
        const groupsSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          token,
          metadataFolder.metadataFolderId,
          pnIdentifier,
          accountId
        );

        if (jobType === 'group_message_append') {
          // Dual silo: every member appends into their own conversation sheet.
          const ownRow = await GroupSheetsService.getMemberRow(
            token,
            groupsSheetId,
            String(groupId),
            pnIdentifier,
            pnIdentifier,
            accountId
          );
          if (!ownRow) {
            return res.status(403).json({ error: 'Not a member of this group' });
          }

          let convSheetId = ownRow.conversationSpreadsheetId;
          if (!convSheetId) {
            const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
              token,
              metadataFolder.pnFolderId!,
              pnIdentifier,
              accountId
            );
            convSheetId = await MessageSheetsService.getOrCreateGroupConversationSheet(
              token,
              messagesFolderId,
              String(groupId),
              pnIdentifier,
              accountId
            );
            await GroupSheetsService.updateConversationSpreadsheetId(
              token,
              groupsSheetId,
              String(groupId),
              pnIdentifier,
              convSheetId,
              pnIdentifier,
              accountId
            );
          }

          const {
            messageId,
            timestamp,
            encryptedContent,
            fromPnIdentifier,
            mediaFileId,
            mediaBackend,
            mediaMimeType,
            role: messageRole
          } = req.body;
          if (typeof encryptedContent !== 'string' || !encryptedContent) {
            return res.status(400).json({ error: 'encryptedContent is required' });
          }
          if (typeof messageId !== 'string' || !messageId.trim()) {
            return res.status(400).json({ error: 'messageId is required' });
          }

          const role = String(messageRole || 'recipient');
          const fromPn =
            typeof fromPnIdentifier === 'string' && fromPnIdentifier
              ? String(fromPnIdentifier)
              : role === 'sender'
                ? pnIdentifier
                : '';

          await MessageSheetsService.appendMessage(
            token,
            convSheetId,
            {
              messageId: String(messageId).trim(),
              fromPnIdentifier: fromPn,
              toPnIdentifier: String(groupId),
              content: '',
              timestamp: String(timestamp || new Date().toISOString()),
              read: role === 'sender',
              encryptedContent,
              cryptoVersion: 2 as const,
              ...(mediaFileId
                ? {
                    mediaFileId,
                    mediaBackend,
                    ...(mediaMimeType ? { mediaMimeType } : {})
                  }
                : {})
            },
            '',
            '',
            pnIdentifier,
            accountId
          );

          const { invalidateGroupFileMtime } = await import('./messagingReadCache');
          await invalidateGroupFileMtime(pnIdentifier, convSheetId);
          return res.json({ success: true, spreadsheetId: convSheetId });
        }

        // group_inbox_update: the member maintains its own group row and inbox.
        const { removed, keyRotation, ownerPnIdentifier, title, createdAt, accessRole, wrappedChatKey, preview } = req.body;

        if (removed) {
          await GroupSheetsService.removeGroupMember(
            token,
            groupsSheetId,
            String(groupId),
            pnIdentifier,
            pnIdentifier,
            accountId
          );
          return res.json({ success: true });
        }

        if (Array.isArray(keyRotation)) {
          await GroupSheetsService.rotateGroupMemberKeys(
            token,
            groupsSheetId,
            String(groupId),
            pnIdentifier,
            keyRotation.map((k: any) => ({
              memberPnIdentifier: String(k.memberPnIdentifier),
              wrappedChatKey: String(k.wrappedChatKey),
              accessRole: (k.accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as 'readWrite' | 'readOnly'
            })),
            pnIdentifier,
            accountId
          );
          return res.json({ success: true });
        }

        if (title && !ownerPnIdentifier) {
          await GroupSheetsService.updateGroupTitle(
            token,
            groupsSheetId,
            String(groupId),
            String(title),
            pnIdentifier,
            accountId
          );
          return res.json({ success: true });
        }

        if (ownerPnIdentifier) {
          const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
            token,
            metadataFolder.pnFolderId!,
            pnIdentifier,
            accountId
          );
          const ownConvId = await MessageSheetsService.getOrCreateGroupConversationSheet(
            token,
            messagesFolderId,
            String(groupId),
            pnIdentifier,
            accountId
          );
          const roster = Array.isArray(req.body?.members)
            ? (req.body.members as Array<{
                memberPnIdentifier?: string;
                wrappedChatKey?: string;
                accessRole?: string;
              }>)
            : [
                {
                  memberPnIdentifier: pnIdentifier,
                  wrappedChatKey: String(wrappedChatKey || ''),
                  accessRole: accessRole === 'readOnly' ? 'readOnly' : 'readWrite'
                }
              ];
          const memberInputs = roster
            .filter((m) => m.memberPnIdentifier)
            .map((m) => ({
              memberPnIdentifier: String(m.memberPnIdentifier),
              wrappedChatKey: String(m.wrappedChatKey || ''),
              accessRole: (m.accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as
                | 'readWrite'
                | 'readOnly'
            }));
          if (!memberInputs.some((m) => m.memberPnIdentifier === pnIdentifier)) {
            memberInputs.push({
              memberPnIdentifier: pnIdentifier,
              wrappedChatKey: String(wrappedChatKey || ''),
              accessRole: (accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as
                | 'readWrite'
                | 'readOnly'
            });
          }
          await GroupSheetsService.appendGroupMembers(
            token,
            groupsSheetId,
            String(groupId),
            String(ownerPnIdentifier),
            String(title || ''),
            String(createdAt || new Date().toISOString()),
            memberInputs,
            pnIdentifier,
            accountId
          );
          await GroupSheetsService.updateConversationSpreadsheetId(
            token,
            groupsSheetId,
            String(groupId),
            pnIdentifier,
            ownConvId,
            pnIdentifier,
            accountId
          );
          const inboxSheetId = await MessageSheetsService.getOrCreateInboxSheet(
            token,
            messagesFolderId,
            pnIdentifier,
            accountId
          );
          await MessageSheetsService.updateGroupInboxEntry(
            token,
            inboxSheetId,
            String(groupId),
            ownConvId,
            String(ownerPnIdentifier),
            new Date().toISOString(),
            pnIdentifier,
            accountId,
            String(preview || '')
          );
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error applying inbound group job:', error);
        return res.status(500).json({
          error: 'Failed to apply inbound group job',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });
}
