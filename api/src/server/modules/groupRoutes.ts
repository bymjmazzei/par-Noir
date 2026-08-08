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
        const { requireOwnerDriveContext, DriveIndexError } = await import('./ownerDriveContext');
        const { PN_DRIVE_SHEET_KEYS } = await import('./pnDriveIndex');
        const { isGoogleSheetsRateLimit } = await import('./googleSheetsRateLimit');

        let ctx;
        try {
          const { extractCloudAccessToken } = await import('./cloudAccessToken');
          ctx = await requireOwnerDriveContext(userPnIdentifier, undefined, {
            accessToken: extractCloudAccessToken(req),
          });
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
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
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

        for (const m of members) {
          if (m.memberPnIdentifier === ownerPnIdentifier) continue;
          const memberCreds = await storageCredentialsService.getCredentials(m.memberPnIdentifier);
          if (!memberCreds?.credentials) continue;
          const mAccounts =
            memberCreds.credentials.googleDriveAccounts ||
            (memberCreds.credentials.googleDrive ? [memberCreds.credentials.googleDrive] : []);
          if (mAccounts.length === 0) continue;
          const mAccount = mAccounts[0];
          const mAccountId = extractAccountId(mAccount);
          const mToken = {
            access_token: mAccount.access_token || mAccount.accessToken,
            refresh_token: mAccount.refresh_token || mAccount.refreshToken,
            expires_at: mAccount.expires_at,
            expires_in: mAccount.expires_in
          };
          const mMeta = await getMetadataFolder(mToken, m.memberPnIdentifier, mAccountId);
          if (!mMeta?.metadataFolderId) continue;
          const mSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
            mToken,
            mMeta.metadataFolderId,
            m.memberPnIdentifier,
            mAccountId
          );
          await GroupSheetsService.appendGroupMembers(
            mToken,
            mSheetId,
            groupId,
            ownerPnIdentifier,
            title,
            createdAt,
            [
              {
                memberPnIdentifier: m.memberPnIdentifier,
                accessRole: (m.accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as 'readWrite' | 'readOnly',
                wrappedChatKey: m.wrappedChatKey
              }
            ],
            m.memberPnIdentifier,
            mAccountId
          );
        }

        const { MessageSheetsService } = await import('./messageSheetsService');
        const uniqueMemberPns = [...new Set(members.map((m) => m.memberPnIdentifier))];
        const preview = `New group: ${title}`;

        const ownerMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
          token,
          metadataFolder.pnFolderId!,
          ownerPnIdentifier,
          accountId
        );
        const ownerInboxSheetId = await MessageSheetsService.getOrCreateInboxSheet(
          token,
          ownerMessagesFolderId,
          ownerPnIdentifier,
          accountId
        );
        const ownerConvSheetId = await MessageSheetsService.getOrCreateGroupConversationSheet(
          token,
          ownerMessagesFolderId,
          groupId,
          ownerPnIdentifier,
          accountId
        );

        const provisionMemberInbox = async (memberPn: string): Promise<void> => {
          const creds =
            memberPn === ownerPnIdentifier
              ? ownerCreds
              : await storageCredentialsService.getCredentials(memberPn);
          if (!creds?.credentials) {
            throw new Error(`No credentials for ${memberPn}`);
          }
          const mAccounts =
            creds.credentials.googleDriveAccounts ||
            (creds.credentials.googleDrive ? [creds.credentials.googleDrive] : []);
          if (mAccounts.length === 0) {
            throw new Error(`No Drive for ${memberPn}`);
          }
          const mAccount = mAccounts[0];
          const mAccountId = extractAccountId(mAccount);
          const mToken = {
            access_token: mAccount.access_token || mAccount.accessToken,
            refresh_token: mAccount.refresh_token || mAccount.refreshToken,
            expires_at: mAccount.expires_at,
            expires_in: mAccount.expires_in
          };
          const mMeta = await getMetadataFolder(mToken, memberPn, mAccountId);
          if (!mMeta?.metadataFolderId) {
            throw new Error(`Metadata folder missing for ${memberPn}`);
          }
          const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
            mToken,
            mMeta.pnFolderId!,
            memberPn,
            mAccountId
          );
          const inboxSheetId = await MessageSheetsService.getOrCreateInboxSheet(
            mToken,
            messagesFolderId,
            memberPn,
            mAccountId
          );
          await MessageSheetsService.updateGroupInboxEntry(
            mToken,
            inboxSheetId,
            groupId,
            ownerConvSheetId,
            ownerPnIdentifier,
            createdAt,
            memberPn,
            mAccountId,
            preview
          );
          const memberGroupSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
            mToken,
            mMeta.metadataFolderId,
            memberPn,
            mAccountId
          );
          await GroupSheetsService.updateConversationSpreadsheetId(
            mToken,
            memberGroupSheetId,
            groupId,
            memberPn,
            ownerConvSheetId,
            memberPn,
            mAccountId
          );
        };

        await MessageSheetsService.updateGroupInboxEntry(
          token,
          ownerInboxSheetId,
          groupId,
          ownerConvSheetId,
          ownerPnIdentifier,
          createdAt,
          ownerPnIdentifier,
          accountId,
          preview
        );

        await Promise.all(uniqueMemberPns.map((memberPn) => provisionMemberInbox(memberPn)));

        await Promise.all(
          uniqueMemberPns.map(async (memberPn) => {
            await GroupSheetsService.updateConversationSpreadsheetId(
              token,
              sheetId,
              groupId,
              memberPn,
              ownerConvSheetId,
              ownerPnIdentifier,
              accountId
            );
          })
        );

        return res.json({ success: true, groupId, title, createdAt });
      } catch (error: any) {
        console.error('Error creating group:', error);
        return res.status(500).json({
          error: 'Failed to create group',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.patch('/api/groups/:groupId/members/:memberPn', async (req, res) => {
      try {
        const { groupId, memberPn } = req.params;
        const { ownerPnIdentifier, accessRole } = req.body as {
          ownerPnIdentifier?: string;
          accessRole?: 'readWrite' | 'readOnly';
        };
        if (!ownerPnIdentifier || !accessRole) {
          return res.status(400).json({ error: 'ownerPnIdentifier and accessRole are required' });
        }
        const { GroupSheetsService } = await import('./groupSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const credentials = await storageCredentialsService.getCredentials(ownerPnIdentifier);
        if (!credentials?.credentials) {
          return res.status(404).json({ error: 'Owner credentials not found' });
        }
        const accounts =
          credentials.credentials.googleDriveAccounts ||
          (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);
        if (accounts.length === 0) {
          return res.status(404).json({ error: 'No Google Drive connected' });
        }
        const account = accounts[0];
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
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
        const ok = await GroupSheetsService.updateMemberAccessRole(
          token,
          sheetId,
          groupId,
          memberPn,
          accessRole === 'readOnly' ? 'readOnly' : 'readWrite',
          ownerPnIdentifier,
          accountId
        );
        if (!ok) {
          return res.status(404).json({ error: 'Group member not found' });
        }
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error updating group member:', error);
        return res.status(500).json({
          error: 'Failed to update group member',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    const groupMessagesHandler = async (req: express.Request, res: express.Response) => {
      const { groupId } = req.params;
      const src = req.method === 'POST' ? (req.body as Record<string, unknown>) : (req.query as Record<string, unknown>);
      try {
        const userPnIdentifier = src.userPnIdentifier as string;
        const spreadsheetId = src.spreadsheetId as string | undefined;
        const limit = src.limit != null ? parseInt(String(src.limit), 10) : 50;
        const offset = src.offset != null ? parseInt(String(src.offset), 10) : 0;

        if (!userPnIdentifier || !groupId) {
          return res.status(400).json({ error: 'userPnIdentifier and groupId are required' });
        }

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { MessageSheetsService } = await import('./messageSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const userCreds = await storageCredentialsService.getCredentials(userPnIdentifier);
        if (!userCreds?.credentials) {
          return res.json({ messages: [], total: 0 });
        }
        const accounts =
          userCreds.credentials.googleDriveAccounts ||
          (userCreds.credentials.googleDrive ? [userCreds.credentials.googleDrive] : []);
        if (accounts.length === 0) {
          return res.json({ messages: [], total: 0 });
        }
        const account = accounts[0];
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const metadataFolder = await getMetadataFolder(token, userPnIdentifier, accountId);
        if (!metadataFolder?.metadataFolderId) {
          return res.json({ messages: [], total: 0 });
        }
        const groupsSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          token,
          metadataFolder.metadataFolderId,
          userPnIdentifier,
          accountId
        );
        const selfRow = await GroupSheetsService.getMemberRow(
          token,
          groupsSheetId,
          groupId,
          userPnIdentifier,
          userPnIdentifier,
          accountId
        );
        if (!selfRow) {
          return res.status(403).json({ error: 'Not a member of this group' });
        }

        const ownerPn = selfRow.ownerPnIdentifier;
        const ownerCreds = await storageCredentialsService.getCredentials(ownerPn);
        if (!ownerCreds?.credentials) {
          return res.status(404).json({ error: 'Group owner credentials not found' });
        }
        const ownerAccounts =
          ownerCreds.credentials.googleDriveAccounts ||
          (ownerCreds.credentials.googleDrive ? [ownerCreds.credentials.googleDrive] : []);
        if (ownerAccounts.length === 0) {
          return res.status(404).json({ error: 'Owner has no Google Drive connected' });
        }
        const ownerAccount = ownerAccounts[0];
        const ownerAccountId = extractAccountId(ownerAccount);
        const ownerToken = {
          access_token: ownerAccount.access_token || ownerAccount.accessToken,
          refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
          expires_at: ownerAccount.expires_at,
          expires_in: ownerAccount.expires_in
        };
        const ownerMeta = await getMetadataFolder(ownerToken, ownerPn, ownerAccountId);
        if (!ownerMeta?.metadataFolderId) {
          return res.json({ messages: [], total: 0 });
        }
        const ownerGroupsSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          ownerToken,
          ownerMeta.metadataFolderId,
          ownerPn,
          ownerAccountId
        );

        let convSheetId =
          spreadsheetId ||
          (await GroupSheetsService.getCanonicalGroupConversationSpreadsheetId(
            ownerToken,
            ownerGroupsSheetId,
            groupId,
            ownerPn,
            ownerAccountId
          )) ||
          selfRow.conversationSpreadsheetId;
        if (!convSheetId) {
          const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
          const groupIndex = readPnDriveIndex(userCreds.credentials as Record<string, unknown>);
          if (isPnDriveIndexComplete(groupIndex)) {
            const entries = await MessageSheetsService.getInboxEntries(
              token,
              groupIndex.inboxSheetId,
              userPnIdentifier,
              accountId
            );
            const groupEntry = entries.find((e) => e.threadType === 'group' && e.groupId === groupId);
            convSheetId = groupEntry?.spreadsheetId;
          }
        }
        if (!convSheetId) {
          return res.json({ messages: [], total: 0 });
        }

        const result = await MessageSheetsService.getMessages(
          ownerToken,
          convSheetId,
          '',
          '',
          ownerPn,
          ownerAccountId,
          { limit, offset, includeTotal: true, relayOnly: true }
        );
        return res.json({ messages: result.messages, total: result.total });
      } catch (error: any) {
        console.error('Error loading group messages:', error);
        return res.status(500).json({
          error: 'Failed to load group messages',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    };

    app.get('/api/groups/:groupId/messages', groupMessagesHandler);
    app.post('/api/groups/:groupId/messages', async (req, res) => {
      try {
        const { groupId } = req.params;
        const { fromPnIdentifier, encryptedContent, cryptoVersion, userPnIdentifier, mediaFileId, mediaMimeType, mediaBackend, mediaEnvelopesByPn } = req.body as {
          fromPnIdentifier?: string;
          encryptedContent?: string;
          cryptoVersion?: number;
          userPnIdentifier?: string;
          mediaFileId?: string;
          mediaMimeType?: string;
          mediaBackend?: string;
          mediaEnvelopesByPn?: Record<string, string>;
        };
        const senderPn = fromPnIdentifier || userPnIdentifier;
        if (!senderPn || !groupId) {
          return res.status(400).json({ error: 'fromPnIdentifier and groupId are required' });
        }
        if (cryptoVersion !== 2 || !encryptedContent) {
          return res.status(400).json({
            error: 'encryptedContent with cryptoVersion 2 is required (client-side E2E only)'
          });
        }

        const { GroupSheetsService } = await import('./groupSheetsService');
        const { MessageSheetsService } = await import('./messageSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const senderCreds = await storageCredentialsService.getCredentials(senderPn);
        if (!senderCreds?.credentials) {
          return res.status(404).json({ error: 'Sender credentials not found' });
        }
        const senderAccounts =
          senderCreds.credentials.googleDriveAccounts ||
          (senderCreds.credentials.googleDrive ? [senderCreds.credentials.googleDrive] : []);
        if (senderAccounts.length === 0) {
          return res.status(404).json({ error: 'Sender has no Google Drive connected' });
        }
        const senderAccount = senderAccounts[0];
        const senderAccountId = extractAccountId(senderAccount);
        const senderToken = {
          access_token: senderAccount.access_token || senderAccount.accessToken,
          refresh_token: senderAccount.refresh_token || senderAccount.refreshToken,
          expires_at: senderAccount.expires_at,
          expires_in: senderAccount.expires_in
        };
        const senderMeta = await getMetadataFolder(senderToken, senderPn, senderAccountId);
        if (!senderMeta?.metadataFolderId) {
          return res.status(404).json({ error: 'Sender metadata folder not found' });
        }
        const senderGroupsSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          senderToken,
          senderMeta.metadataFolderId,
          senderPn,
          senderAccountId
        );
        const senderRow = await GroupSheetsService.getMemberRow(
          senderToken,
          senderGroupsSheetId,
          groupId,
          senderPn,
          senderPn,
          senderAccountId
        );
        if (!senderRow) {
          return res.status(403).json({ error: 'Not a member of this group' });
        }
        if (senderRow.accessRole === 'readOnly') {
          return res.status(403).json({ error: 'Read-only members cannot send messages' });
        }

        const ownerPn = senderRow.ownerPnIdentifier;
        const ownerCreds = await storageCredentialsService.getCredentials(ownerPn);
        if (!ownerCreds?.credentials) {
          return res.status(404).json({ error: 'Group owner credentials not found' });
        }
        const ownerAccounts =
          ownerCreds.credentials.googleDriveAccounts ||
          (ownerCreds.credentials.googleDrive ? [ownerCreds.credentials.googleDrive] : []);
        if (ownerAccounts.length === 0) {
          return res.status(404).json({ error: 'Owner has no Google Drive connected' });
        }
        const ownerAccount = ownerAccounts[0];
        const ownerAccountId = extractAccountId(ownerAccount);
        const ownerToken = {
          access_token: ownerAccount.access_token || ownerAccount.accessToken,
          refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
          expires_at: ownerAccount.expires_at,
          expires_in: ownerAccount.expires_in
        };
        const ownerMeta = await getMetadataFolder(ownerToken, ownerPn, ownerAccountId);
        if (!ownerMeta?.metadataFolderId) {
          return res.status(404).json({ error: 'Owner metadata folder not found' });
        }
        const ownerGroupsSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
          ownerToken,
          ownerMeta.metadataFolderId,
          ownerPn,
          ownerAccountId
        );
        const members = await GroupSheetsService.getGroupMembers(
          ownerToken,
          ownerGroupsSheetId,
          groupId,
          ownerPn,
          ownerAccountId
        );

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();

        let ownerMediaRef: import('./messagingMediaService').MediaAttachmentRef | undefined;
        if (mediaFileId) {
          const { dualWriteAttachmentToRecipients } = await import('./messagingMediaService');
          const recipientPns = members.map((m) => m.memberPnIdentifier).filter((pn) => pn !== senderPn);
          // Also ensure owner silo has a copy when sender is not owner
          const copyTargets = [...new Set([...recipientPns, ownerPn].filter((pn) => pn !== senderPn))];
          const mediaRefByPn = await dualWriteAttachmentToRecipients(
            senderPn,
            mediaFileId,
            copyTargets,
            senderAccountId,
            {
              envelopeByPn:
                mediaEnvelopesByPn && typeof mediaEnvelopesByPn === 'object'
                  ? mediaEnvelopesByPn
                  : undefined,
              jitterMs: 1500,
              ...(mediaBackend
                ? { senderMediaBackend: mediaBackend as import('@par-noir/user-owned-storage').StorageProviderId }
                : {})
            }
          );
          ownerMediaRef = mediaRefByPn[ownerPn] ?? {
            backend: (mediaBackend as import('@par-noir/user-owned-storage').StorageProviderId) || 'google_drive',
            backendFileId: mediaFileId,
            accountId: senderAccountId
          };
        }

        const messagePayload = {
          messageId,
          fromPnIdentifier: senderPn,
          toPnIdentifier: groupId,
          content: '',
          timestamp,
          read: false,
          encryptedContent,
          cryptoVersion: 2 as const,
          ...(ownerMediaRef
            ? {
                mediaFileId: ownerMediaRef.backendFileId,
                mediaBackend: ownerMediaRef.backend,
                ...(mediaMimeType ? { mediaMimeType } : {})
              }
            : {})
        };

        let ownerConvSheetId = await GroupSheetsService.getCanonicalGroupConversationSpreadsheetId(
          ownerToken,
          ownerGroupsSheetId,
          groupId,
          ownerPn,
          ownerAccountId
        );
        if (!ownerConvSheetId) {
          const ownerMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
            ownerToken,
            ownerMeta.pnFolderId!,
            ownerPn,
            ownerAccountId
          );
          ownerConvSheetId = await MessageSheetsService.getOrCreateGroupConversationSheet(
            ownerToken,
            ownerMessagesFolderId,
            groupId,
            ownerPn,
            ownerAccountId
          );
        }

        await MessageSheetsService.appendMessage(
          ownerToken,
          ownerConvSheetId,
          messagePayload,
          '',
          '',
          ownerPn,
          ownerAccountId
        );

        const { invalidateGroupFileMtime, invalidateMessagingCachesForUsers } = await import(
          './messagingReadCache'
        );
        await invalidateGroupFileMtime(ownerPn, ownerConvSheetId);
        await invalidateMessagingCachesForUsers(members.map((m) => m.memberPnIdentifier));

        for (const member of members) {
          emitRealtime(member.memberPnIdentifier, 'new_message', {
            threadId: groupId,
            messageId,
          });
        }

        await Promise.all(
          members
            .filter((m) => m.memberPnIdentifier !== senderPn)
            .map(async (member) => {
              try {
                const memberCreds = await storageCredentialsService.getCredentials(member.memberPnIdentifier);
                if (!memberCreds?.credentials) return;
                const mAccounts =
                  memberCreds.credentials.googleDriveAccounts ||
                  (memberCreds.credentials.googleDrive ? [memberCreds.credentials.googleDrive] : []);
                if (mAccounts.length === 0) return;
                const mAccount = mAccounts[0];
                const mAccountId = extractAccountId(mAccount);
                const mToken = {
                  access_token: mAccount.access_token || mAccount.accessToken,
                  refresh_token: mAccount.refresh_token || mAccount.refreshToken,
                  expires_at: mAccount.expires_at,
                  expires_in: mAccount.expires_in
                };
                const mMeta = await getMetadataFolder(mToken, member.memberPnIdentifier, mAccountId);
                if (!mMeta?.metadataFolderId) return;
                const { NotificationService } = await import('./notificationService');
                await NotificationService.notifyNewMessage(
                  mToken.access_token,
                  mMeta.metadataFolderId,
                  messageId,
                  senderPn,
                  member.memberPnIdentifier,
                  groupId
                );
              } catch (notifyErr: unknown) {
                console.warn('[GroupMessage] push notify failed:', (notifyErr as Error)?.message);
              }
            })
        );

        return res.json({ success: true, messageId, timestamp });
      } catch (error: any) {
        console.error('Error sending group message:', error);
        return res.status(500).json({
          error: 'Failed to send group message',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.patch('/api/groups/:groupId', async (req, res) => {
      try {
        const { groupId } = req.params;
        const { ownerPnIdentifier, title } = req.body as { ownerPnIdentifier?: string; title?: string };
        if (!ownerPnIdentifier || !title?.trim()) {
          return res.status(400).json({ error: 'ownerPnIdentifier and title are required' });
        }
        const { GroupSheetsService } = await import('./groupSheetsService');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const credentials = await storageCredentialsService.getCredentials(ownerPnIdentifier);
        if (!credentials?.credentials) {
          return res.status(404).json({ error: 'Owner credentials not found' });
        }
        const accounts =
          credentials.credentials.googleDriveAccounts ||
          (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);
        if (accounts.length === 0) {
          return res.status(404).json({ error: 'No Google Drive connected' });
        }
        const account = accounts[0];
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
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
        await GroupSheetsService.updateGroupTitle(
          token,
          sheetId,
          groupId,
          title.trim(),
          ownerPnIdentifier,
          accountId
        );
        const members = await GroupSheetsService.getGroupMembers(
          token,
          sheetId,
          groupId,
          ownerPnIdentifier,
          accountId
        );
        for (const m of members) {
          if (m.memberPnIdentifier === ownerPnIdentifier) continue;
          const memberCreds = await storageCredentialsService.getCredentials(m.memberPnIdentifier);
          if (!memberCreds?.credentials) continue;
          const mAccounts =
            memberCreds.credentials.googleDriveAccounts ||
            (memberCreds.credentials.googleDrive ? [memberCreds.credentials.googleDrive] : []);
          if (mAccounts.length === 0) continue;
          const mAccount = mAccounts[0];
          const mAccountId = extractAccountId(mAccount);
          const mToken = {
            access_token: mAccount.access_token || mAccount.accessToken,
            refresh_token: mAccount.refresh_token || mAccount.refreshToken,
            expires_at: mAccount.expires_at,
            expires_in: mAccount.expires_in
          };
          const mMeta = await getMetadataFolder(mToken, m.memberPnIdentifier, mAccountId);
          if (!mMeta?.metadataFolderId) continue;
          const mSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
            mToken,
            mMeta.metadataFolderId,
            m.memberPnIdentifier,
            mAccountId
          );
          await GroupSheetsService.updateGroupTitle(
            mToken,
            mSheetId,
            groupId,
            title.trim(),
            m.memberPnIdentifier,
            mAccountId
          );
        }
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
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
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

        const memberCreds = await storageCredentialsService.getCredentials(memberPnIdentifier);
        if (memberCreds?.credentials) {
          const mAccounts =
            memberCreds.credentials.googleDriveAccounts ||
            (memberCreds.credentials.googleDrive ? [memberCreds.credentials.googleDrive] : []);
          if (mAccounts.length > 0) {
            const mAccount = mAccounts[0];
            const mAccountId = extractAccountId(mAccount);
            const mToken = {
              access_token: mAccount.access_token || mAccount.accessToken,
              refresh_token: mAccount.refresh_token || mAccount.refreshToken,
              expires_at: mAccount.expires_at,
              expires_in: mAccount.expires_in
            };
            const mMeta = await getMetadataFolder(mToken, memberPnIdentifier, mAccountId);
            if (mMeta?.metadataFolderId) {
              const mSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
                mToken,
                mMeta.metadataFolderId,
                memberPnIdentifier,
                mAccountId
              );
              await GroupSheetsService.appendSingleMember(
                mToken,
                mSheetId,
                groupId,
                ownerPnIdentifier,
                title,
                createdAt,
                { memberPnIdentifier, accessRole: role, wrappedChatKey },
                memberPnIdentifier,
                mAccountId
              );
            }
          }
        }

        const preview = `Added to group: ${title}`;
        const memberPn = memberPnIdentifier;
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

        const creds = memberCreds;
        if (creds?.credentials && metadataFolder.pnFolderId) {
          const mAccounts =
            creds.credentials.googleDriveAccounts ||
            (creds.credentials.googleDrive ? [creds.credentials.googleDrive] : []);
          const mAccount = mAccounts[0];
          const mAccountId = extractAccountId(mAccount);
          const mToken = {
            access_token: mAccount.access_token || mAccount.accessToken,
            refresh_token: mAccount.refresh_token || mAccount.refreshToken,
            expires_at: mAccount.expires_at,
            expires_in: mAccount.expires_in
          };
          const mMeta = await getMetadataFolder(mToken, memberPn, mAccountId);
          if (mMeta?.pnFolderId) {
            const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
              mToken,
              mMeta.pnFolderId,
              memberPn,
              mAccountId
            );
            const inboxSheetId = await MessageSheetsService.getOrCreateInboxSheet(
              mToken,
              messagesFolderId,
              memberPn,
              mAccountId
            );
            await MessageSheetsService.updateGroupInboxEntry(
              mToken,
              inboxSheetId,
              groupId,
              ownerConvSheetId,
              ownerPnIdentifier,
              new Date().toISOString(),
              memberPn,
              mAccountId,
              preview
            );
            const mGroupsSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
              mToken,
              mMeta.metadataFolderId!,
              memberPn,
              mAccountId
            );
            await GroupSheetsService.updateConversationSpreadsheetId(
              mToken,
              mGroupsSheetId,
              groupId,
              memberPn,
              ownerConvSheetId,
              memberPn,
              mAccountId
            );
            await GroupSheetsService.updateConversationSpreadsheetId(
              token,
              sheetId,
              groupId,
              memberPn,
              ownerConvSheetId,
              ownerPnIdentifier,
              accountId
            );
          }
        }

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
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
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
        const memberCreds = await storageCredentialsService.getCredentials(memberPn);
        if (memberCreds?.credentials) {
          const mAccounts =
            memberCreds.credentials.googleDriveAccounts ||
            (memberCreds.credentials.googleDrive ? [memberCreds.credentials.googleDrive] : []);
          if (mAccounts.length > 0) {
            const mAccount = mAccounts[0];
            const mAccountId = extractAccountId(mAccount);
            const mToken = {
              access_token: mAccount.access_token || mAccount.accessToken,
              refresh_token: mAccount.refresh_token || mAccount.refreshToken,
              expires_at: mAccount.expires_at,
              expires_in: mAccount.expires_in
            };
            const mMeta = await getMetadataFolder(mToken, memberPn, mAccountId);
            if (mMeta?.metadataFolderId) {
              const mSheetId = await GroupSheetsService.getOrCreateGroupsSheet(
                mToken,
                mMeta.metadataFolderId,
                memberPn,
                mAccountId
              );
              await GroupSheetsService.removeGroupMember(
                mToken,
                mSheetId,
                groupId,
                memberPn,
                memberPn,
                mAccountId
              );
            }
          }
        }
        if (!okOwner) {
          return res.status(404).json({ error: 'Group member not found' });
        }

        for (const rot of keyRotation) {
          const remainingPn = rot.memberPnIdentifier;
          if (remainingPn === ownerPnIdentifier) continue;
          const memberCredsRot = await storageCredentialsService.getCredentials(remainingPn);
          if (!memberCredsRot?.credentials) continue;
          const mAccountsRot =
            memberCredsRot.credentials.googleDriveAccounts ||
            (memberCredsRot.credentials.googleDrive ? [memberCredsRot.credentials.googleDrive] : []);
          if (mAccountsRot.length === 0) continue;
          const mAccountRot = mAccountsRot[0];
          const mAccountIdRot = extractAccountId(mAccountRot);
          const mTokenRot = {
            access_token: mAccountRot.access_token || mAccountRot.accessToken,
            refresh_token: mAccountRot.refresh_token || mAccountRot.refreshToken,
            expires_at: mAccountRot.expires_at,
            expires_in: mAccountRot.expires_in
          };
          const mMetaRot = await getMetadataFolder(mTokenRot, remainingPn, mAccountIdRot);
          if (!mMetaRot?.metadataFolderId) continue;
          const mSheetIdRot = await GroupSheetsService.getOrCreateGroupsSheet(
            mTokenRot,
            mMetaRot.metadataFolderId,
            remainingPn,
            mAccountIdRot
          );
          await GroupSheetsService.rotateGroupMemberKeys(
            mTokenRot,
            mSheetIdRot,
            groupId,
            memberPn,
            keyRotation.map((k) => ({
              memberPnIdentifier: k.memberPnIdentifier,
              wrappedChatKey: k.wrappedChatKey,
              accessRole: (k.accessRole === 'readOnly' ? 'readOnly' : 'readWrite') as 'readWrite' | 'readOnly'
            })),
            remainingPn,
            mAccountIdRot
          );
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error removing group member:', error);
        return res.status(500).json({
          error: 'Failed to remove group member',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });
}
