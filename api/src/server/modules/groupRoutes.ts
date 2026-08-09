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

        // Each member keeps their own copy of the group row, so the rename
        // fans out over the rail rather than through their Drive credentials.
        const { enqueueSocialJob } = await import('./socialRail');
        await Promise.all(
          members
            .filter((m) => m.memberPnIdentifier !== ownerPnIdentifier)
            .map((m) =>
              enqueueSocialJob({
                jobType: 'group_inbox_update',
                peerPn: m.memberPnIdentifier,
                requestId: `title:${groupId}:${title.trim()}`,
                extra: { groupId, title: title.trim() }
              })
            )
        );
        return res.json({ success: true, title: title.trim() });
      } catch (error: any) {
        console.error('Error updating group title:', error);
        return res.status(500).json({
          error: 'Failed to update group',
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

        // The owner records where the member's conversation points; everything
        // on the member's side — their group row, their messages folder, their
        // inbox entry — is theirs to write, so it goes over the rail.
        await GroupSheetsService.updateConversationSpreadsheetId(
          token,
          sheetId,
          groupId,
          memberPnIdentifier,
          ownerConvSheetId,
          ownerPnIdentifier,
          accountId
        );

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
            conversationSpreadsheetId: ownerConvSheetId,
            preview: `Added to group: ${title}`
          }
        });

        return res.json({ success: true, delivered });
        return res.json({ success: true });
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
          // Only the group owner holds the canonical conversation, so only the
          // owner can apply an append.
          const ownRow = await GroupSheetsService.getMemberRow(
            token,
            groupsSheetId,
            String(groupId),
            pnIdentifier,
            pnIdentifier,
            accountId
          );
          if (!ownRow || ownRow.ownerPnIdentifier !== pnIdentifier) {
            return res.status(403).json({ error: 'Not the owner of this group' });
          }

          let convSheetId = await GroupSheetsService.getCanonicalGroupConversationSpreadsheetId(
            token,
            groupsSheetId,
            String(groupId),
            pnIdentifier,
            accountId
          );
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
          }

          const { messageId, timestamp, encryptedContent, fromPnIdentifier, mediaFileId, mediaBackend, mediaMimeType } = req.body;
          await MessageSheetsService.appendMessage(
            token,
            convSheetId,
            {
              messageId: String(messageId),
              fromPnIdentifier: String(fromPnIdentifier || ''),
              toPnIdentifier: String(groupId),
              content: '',
              timestamp: String(timestamp || new Date().toISOString()),
              read: false,
              encryptedContent,
              cryptoVersion: 2 as const,
              ...(mediaFileId ? { mediaFileId, mediaBackend, ...(mediaMimeType ? { mediaMimeType } : {}) } : {})
            },
            '',
            '',
            pnIdentifier,
            accountId
          );

          const { invalidateGroupFileMtime } = await import('./messagingReadCache');
          await invalidateGroupFileMtime(pnIdentifier, convSheetId);
          return res.json({ success: true });
        }

        // group_inbox_update: the member maintains its own group row and inbox.
        const { removed, keyRotation, ownerPnIdentifier, title, createdAt, accessRole, wrappedChatKey, conversationSpreadsheetId, preview } = req.body;

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

        if (ownerPnIdentifier && conversationSpreadsheetId) {
          await GroupSheetsService.appendSingleMember(
            token,
            groupsSheetId,
            String(groupId),
            String(ownerPnIdentifier),
            String(title || ''),
            String(createdAt || new Date().toISOString()),
            {
              memberPnIdentifier: pnIdentifier,
              accessRole: (accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as 'readWrite' | 'readOnly',
              wrappedChatKey: String(wrappedChatKey || '')
            },
            pnIdentifier,
            accountId
          );
          await GroupSheetsService.updateConversationSpreadsheetId(
            token,
            groupsSheetId,
            String(groupId),
            pnIdentifier,
            String(conversationSpreadsheetId),
            pnIdentifier,
            accountId
          );
          const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
            token,
            metadataFolder.pnFolderId!,
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
            String(conversationSpreadsheetId),
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
