/**
 * Group messaging API client.
 */

import { API_ENDPOINT } from '../config/api';
import {
  generateChatKey,
  generateGroupId,
  wrapChatKeyForMember,
  wrapChatKeyForOwner,
  unwrapChatKeyForOwner,
  unwrapGroupChatKey,
  encryptGroupMessage,
  decryptGroupMessage
} from './groupCryptoClient';
import { getMessageThreads, type MessageThread } from './messageService';
import type { DmSessionRecovery } from './dmCryptoClient';
import { isDmIdentityReady, getDmIdentity } from './dmIdentitySession';
import type { Message } from './messageService';
import { ownerFetch } from './ownerApiFetch';
import { PNOAuthService } from './pnOAuthService';
import {
  createOutboxRecord,
  groupMessageSendFanout,
  promoteOutboxRecord,
  upsertLocalOutboxRecord,
  requireOnlineCloudForSend,
  type OutboxRecord
} from '@par-noir/device-cloud-credentials';

const groupChatKeys = new Map<string, string>();

export function getGroupChatKeyCache(): Map<string, string> {
  return groupChatKeys;
}

export type GroupAccessRole = 'readWrite' | 'readOnly';

export interface GroupRecord {
  groupId: string;
  ownerPnIdentifier: string;
  title: string;
  createdAt: string;
  memberPnIdentifier: string;
  accessRole: GroupAccessRole;
  wrappedChatKey: string;
  conversationSpreadsheetId?: string;
}

export interface CreateGroupMemberInput {
  memberPnIdentifier: string;
  accessRole?: GroupAccessRole;
}

export async function listGroups(userPnIdentifier: string): Promise<GroupRecord[]> {
  const { listDeviceGroups } = await import('@par-noir/device-cloud-credentials');
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(userPnIdentifier);
  const sheetId = drive.index.sheetIds.groups;
  if (!sheetId) return [];
  const rows = await listDeviceGroups(drive.accessToken, sheetId);
  return rows.map((row) => ({
    ...row,
    accessRole: row.accessRole === 'readOnly' ? 'readOnly' : 'readWrite',
  }));
}

/** Full group roster (all members) — required for send fanout; listGroups alone is insufficient. */
export async function listGroupRoster(
  userPnIdentifier: string,
  groupId: string
): Promise<Array<{ memberPnIdentifier: string; accessRole: GroupAccessRole }>> {
  const groups = await listGroups(userPnIdentifier);
  return groups
    .filter((row) => row.groupId === groupId)
    .map((row) => ({
      memberPnIdentifier: row.memberPnIdentifier,
      accessRole: row.accessRole,
    }));
}

export async function createGroup(
  ownerPnIdentifier: string,
  title: string,
  memberInputs: CreateGroupMemberInput[]
): Promise<{ groupId: string; title: string }> {
  if (!isDmIdentityReady()) {
    throw new Error('Messaging keys unavailable. Lock and unlock your pN again to send messages.');
  }

  const groupId = generateGroupId();
  const chatKey = generateChatKey();
  const threads = await getMessageThreads(ownerPnIdentifier);
  const threadByParticipant = new Map(
    threads.filter((t) => t.participantPnIdentifier).map((t) => [t.participantPnIdentifier!, t])
  );

  const members: Array<{
    memberPnIdentifier: string;
    wrappedChatKey: string;
    accessRole: GroupAccessRole;
  }> = [];

  const allPn = new Set<string>([ownerPnIdentifier, ...memberInputs.map((m) => m.memberPnIdentifier)]);

  const ownerChatKeyCache = getGroupChatKeyCache();
  ownerChatKeyCache.set(groupId, chatKey);

  for (const pn of allPn) {
    if (pn === ownerPnIdentifier) {
      const { mlKemSecretKey } = getDmIdentity();
      const wrappedOwner = await wrapChatKeyForOwner(chatKey, mlKemSecretKey, groupId);
      members.push({
        memberPnIdentifier: ownerPnIdentifier,
        wrappedChatKey: wrappedOwner,
        accessRole: 'readWrite'
      });
      continue;
    }
    const thread = threadByParticipant.get(pn);
    if (!thread?.connectionId) {
      throw new Error(`No encrypted session with ${pn}. Connect first.`);
    }
    const wrapped = await wrapChatKeyForMember(
      chatKey,
      ownerPnIdentifier,
      thread.connectionId,
      dmSessionFromThread(thread),
      groupId
    );
    const input = memberInputs.find((m) => m.memberPnIdentifier === pn);
    members.push({
      memberPnIdentifier: pn,
      wrappedChatKey: wrapped,
      accessRole: input?.accessRole || 'readWrite'
    });
  }

  const { appendDeviceGroupRow } = await import('@par-noir/device-cloud-credentials');
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(ownerPnIdentifier);
  const sheetId = drive.index.sheetIds.groups;
  if (!sheetId) throw new Error('cloud_on_device');
  const createdAt = new Date().toISOString();
  for (const member of members) {
    await appendDeviceGroupRow(drive.accessToken, sheetId, {
      groupId,
      ownerPnIdentifier,
      title,
      createdAt,
      memberPnIdentifier: member.memberPnIdentifier,
      accessRole: member.accessRole,
      wrappedChatKey: member.wrappedChatKey,
    });
  }
  const res = await ownerFetch(
    'POST',
    '/api/groups',
    {
      ownerPnIdentifier,
      title,
      groupId,
      members,
      deviceCloudResult: { spreadsheetId: sheetId },
    },
    { pnIdentifier: ownerPnIdentifier }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to create group');
  }

  return { groupId, title };
}

export async function updateMemberAccessRole(
  ownerPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  accessRole: GroupAccessRole
): Promise<void> {
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(ownerPnIdentifier);
  const sheetId = drive.index.sheetIds.groups;
  if (!sheetId) throw new Error('cloud_on_device');
  const res = await ownerFetch(
    'PATCH',
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberPnIdentifier)}`,
    { ownerPnIdentifier, accessRole, deviceCloudResult: { spreadsheetId: sheetId } },
    { pnIdentifier: ownerPnIdentifier }
  );
  if (!res.ok) {
    throw new Error('Failed to update member role');
  }
}

export async function updateGroupTitle(
  ownerPnIdentifier: string,
  groupId: string,
  title: string
): Promise<void> {
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(ownerPnIdentifier);
  const sheetId = drive.index.sheetIds.groups;
  if (!sheetId) throw new Error('cloud_on_device');
  const res = await ownerFetch(
    'PATCH',
    `/api/groups/${encodeURIComponent(groupId)}`,
    { ownerPnIdentifier, title, deviceCloudResult: { spreadsheetId: sheetId } },
    { pnIdentifier: ownerPnIdentifier }
  );
  if (!res.ok) {
    throw new Error('Failed to update group title');
  }
}

export async function removeGroupMember(
  ownerPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string
): Promise<void> {
  const groups = await listGroups(ownerPnIdentifier);
  const groupRows = groups.filter((g) => g.groupId === groupId);
  const remaining = groupRows.filter((g) => g.memberPnIdentifier !== memberPnIdentifier);
  if (remaining.length === 0) {
    throw new Error('Group not found');
  }

  const newChatKey = generateChatKey();
  getGroupChatKeyCache().set(groupId, newChatKey);
  const threads = await getMessageThreads(ownerPnIdentifier);
  const threadByParticipant = new Map(
    threads.filter((t) => t.participantPnIdentifier).map((t) => [t.participantPnIdentifier!, t])
  );

  const { mlKemSecretKey } = getDmIdentity();
  const keyRotation: Array<{ memberPnIdentifier: string; wrappedChatKey: string; accessRole: GroupAccessRole }> = [];

  for (const row of remaining) {
    if (row.memberPnIdentifier === ownerPnIdentifier) {
      keyRotation.push({
        memberPnIdentifier: ownerPnIdentifier,
        wrappedChatKey: await wrapChatKeyForOwner(newChatKey, mlKemSecretKey, groupId),
        accessRole: row.accessRole
      });
      continue;
    }
    const thread = threadByParticipant.get(row.memberPnIdentifier);
    if (!thread?.connectionId) {
      throw new Error(`No encrypted session with ${row.memberPnIdentifier}`);
    }
    keyRotation.push({
      memberPnIdentifier: row.memberPnIdentifier,
      wrappedChatKey: await wrapChatKeyForMember(
        newChatKey,
        ownerPnIdentifier,
        thread.connectionId,
        dmSessionFromThread(thread),
        groupId
      ),
      accessRole: row.accessRole
    });
  }

  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(ownerPnIdentifier);
  const sheetId = drive.index.sheetIds.groups;
  if (!sheetId) throw new Error('cloud_on_device');
  const res = await ownerFetch(
    'DELETE',
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberPnIdentifier)}`,
    { ownerPnIdentifier, keyRotation, deviceCloudResult: { spreadsheetId: sheetId } },
    { pnIdentifier: ownerPnIdentifier }
  );
  if (!res.ok) {
    throw new Error('Failed to remove group member');
  }
}

function dmSessionFromThread(thread: MessageThread | undefined): DmSessionRecovery | undefined {
  if (!thread) return undefined;
  return {
    kemCiphertext: thread.kemCiphertext,
    wrappedMessageRootKey: thread.wrappedMessageRootKey,
  };
}

async function getDmThreadToOwner(
  userPn: string,
  ownerPn: string
): Promise<DmSessionRecovery & { connectionId?: string }> {
  const threads = await getMessageThreads(userPn);
  const t = threads.find((x) => x.participantPnIdentifier === ownerPn);
  return {
    connectionId: t?.connectionId,
    kemCiphertext: t?.kemCiphertext,
    wrappedMessageRootKey: t?.wrappedMessageRootKey,
  };
}

export async function getGroupChatKey(
  userPn: string,
  record: GroupRecord
): Promise<string> {
  let { groupId, ownerPnIdentifier, wrappedChatKey, memberPnIdentifier } = record;
  if (!wrappedChatKey) {
    const groups = await listGroups(userPn);
    const row = groups.find(
      (g) => g.groupId === groupId && g.memberPnIdentifier === userPn
    );
    if (!row?.wrappedChatKey) {
      throw new Error('Group chat key missing. Re-open the group after unlocking.');
    }
    wrappedChatKey = row.wrappedChatKey;
    ownerPnIdentifier = row.ownerPnIdentifier || ownerPnIdentifier;
    memberPnIdentifier = row.memberPnIdentifier || memberPnIdentifier || userPn;
  }
  if (memberPnIdentifier === ownerPnIdentifier || userPn === ownerPnIdentifier) {
    const cached = getGroupChatKeyCache().get(groupId);
    if (cached) return cached;
    const { mlKemSecretKey } = getDmIdentity();
    return unwrapChatKeyForOwner(wrappedChatKey, mlKemSecretKey, groupId);
  }
  const { connectionId, kemCiphertext, wrappedMessageRootKey } = await getDmThreadToOwner(
    userPn,
    ownerPnIdentifier
  );
  if (!connectionId) {
    throw new Error('No encrypted session with group owner. Connect first.');
  }
  return unwrapGroupChatKey(
    wrappedChatKey,
    ownerPnIdentifier,
    connectionId,
    { kemCiphertext, wrappedMessageRootKey },
    groupId
  );
}

export async function getGroupMessages(
  userPn: string,
  groupId: string,
  record: GroupRecord,
  spreadsheetId?: string,
  limit = 50,
  offset = 0
): Promise<{ messages: Message[]; total: number }> {
  const sheet = spreadsheetId || record.conversationSpreadsheetId;
  const { listDeviceMessages } = await import('@par-noir/device-cloud-credentials');
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(userPn);
  const rows = sheet ? await listDeviceMessages(drive.accessToken, sheet) : [];
  const data = { messages: rows, total: rows.length };
  void limit;
  void offset;
  void groupId;
  const chatKey = await getGroupChatKey(userPn, record);
  const messages: Message[] = await Promise.all(
    (data.messages || []).map(async (row) => {
      const message = row as Message & { encryptedContent?: string };
      const enc = message.encryptedContent || message.content || '';
      let content = '';
      if (enc) {
        try {
          content = await decryptGroupMessage(enc, chatKey);
        } catch {
          content = '[Unable to decrypt message]';
        }
      }
      return { ...message, content, encrypted: true, toPnIdentifier: message.toPnIdentifier || '' };
    })
  );
  return { messages, total: data.total || 0 };
}

export async function sendGroupMessage(
  userPn: string,
  groupId: string,
  record: GroupRecord,
  plaintext: string,
  mediaFileId?: string,
  mediaMimeType?: string,
  mediaEnvelopesByPn?: Record<string, string>,
  mediaBackend?: string
): Promise<void> {
  if (!isDmIdentityReady()) {
    throw new Error('Messaging keys unavailable. Lock and unlock your pN again to send messages.');
  }
  requireOnlineCloudForSend(userPn);
  if (record.accessRole === 'readOnly') {
    throw new Error('You have read-only access in this group');
  }
  const chatKey = await getGroupChatKey(userPn, record);
  const encryptedContent = await encryptGroupMessage(plaintext, chatKey);
  const messageId = `gmsg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const { rememberOutboundMessageId } = await import('./outboundMessageIds');
  rememberOutboundMessageId(messageId);
  const timestamp = new Date().toISOString();

  const roster = await listGroupRoster(userPn, groupId);
  const recipientPnIdentifiers = [
    ...new Set(
      roster
        .map((m) => m.memberPnIdentifier)
        .filter((pn) => pn && pn !== userPn)
    )
  ];
  if (recipientPnIdentifiers.length === 0) {
    throw new Error('Group has no other members to message');
  }

  const routeKeys: string[] = [];
  try {
    const { getConnections } = await import('./connectionService');
    const connections = await getConnections(userPn);
    for (const pn of recipientPnIdentifiers) {
      const row = connections.find((c) => c.userPnIdentifier === pn);
      if (row?.peerMailboxRouteKey && /^[a-f0-9]{64}$/i.test(row.peerMailboxRouteKey)) {
        routeKeys.push(row.peerMailboxRouteKey.trim());
      }
    }
  } catch {
    /* server resolves claimed routes via enqueueSocialJob */
  }

  const identity = getDmIdentity();
  const sealSession = {
    sessionId: userPn,
    pnName: identity.pnName || 'browser-outbox',
    passcode: identity.mlKemSecretKey
  };
  const payload = {
    messageId,
    groupId,
    fromPnIdentifier: userPn,
    encryptedContent,
    cryptoVersion: 2 as const,
    timestamp,
    read: true,
    role: 'sender',
    ...(mediaFileId
      ? {
          mediaFileId,
          ...(mediaMimeType ? { mediaMimeType } : {}),
          ...(mediaBackend ? { mediaBackend } : {}),
          ...(mediaEnvelopesByPn ? { mediaEnvelopesByPn } : {})
        }
      : {})
  };
  const outbox: OutboxRecord = createOutboxRecord({
    outboxId: messageId,
    kind: 'group_message_append',
    payload,
    fanout: groupMessageSendFanout(routeKeys),
    status: 'pending'
  });
  await upsertLocalOutboxRecord(userPn, sealSession, outbox);

  const { appendDeviceMessage } = await import('@par-noir/device-cloud-credentials');
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(userPn);
  const conversationSheet = record.conversationSpreadsheetId;
  if (conversationSheet) {
    await appendDeviceMessage(drive.accessToken, conversationSheet, {
      fromPnIdentifier: userPn,
      content: encryptedContent,
      encryptedContent,
      timestamp,
      messageId,
      read: true,
      cryptoVersion: 2,
    });
  }
  const receiptSheet = conversationSheet || drive.index.sheetIds.groups;
  if (!receiptSheet) throw new Error('cloud_on_device');
  const res = await ownerFetch(
    'POST',
    `/api/groups/${encodeURIComponent(groupId)}/messages`,
    {
      fromPnIdentifier: userPn,
      userPnIdentifier: userPn,
      encryptedContent,
      cryptoVersion: 2,
      messageId,
      timestamp,
      recipientPnIdentifiers,
      deviceCloudResult: { spreadsheetId: receiptSheet },
      ...(mediaFileId
        ? {
            mediaFileId,
            ...(mediaMimeType ? { mediaMimeType } : {}),
            ...(mediaBackend ? { mediaBackend } : {}),
            ...(mediaEnvelopesByPn ? { mediaEnvelopesByPn } : {})
          }
        : {})
    },
    { pnIdentifier: userPn }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to send group message');
  }

  const enqueued: OutboxRecord = {
    ...outbox,
    status: 'enqueued',
    updatedAt: new Date().toISOString()
  };
  await upsertLocalOutboxRecord(userPn, sealSession, enqueued);

  const session = PNOAuthService.loadSession();
  if (!session?.accessToken) {
    throw new Error('Not authenticated');
  }
  requireOnlineCloudForSend(userPn);
  await promoteOutboxRecord(
    {
      apiBaseUrl: API_ENDPOINT,
      authToken: session.accessToken,
      identityId: userPn,
      session: sealSession
    },
    enqueued
  );
}

export async function addGroupMember(
  ownerPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  accessRole: GroupAccessRole = 'readWrite'
): Promise<void> {
  if (!isDmIdentityReady()) {
    throw new Error('Messaging keys unavailable. Lock and unlock your pN again to send messages.');
  }
  const groups = await listGroups(ownerPnIdentifier);
  const groupRow = groups.find((g) => g.groupId === groupId && g.ownerPnIdentifier === ownerPnIdentifier);
  if (!groupRow) {
    throw new Error('Group not found');
  }
  const chatKey = await getGroupChatKey(ownerPnIdentifier, groupRow);
  const threads = await getMessageThreads(ownerPnIdentifier);
  const thread = threads.find((t) => t.participantPnIdentifier === memberPnIdentifier);
  if (!thread?.connectionId) {
    throw new Error(`No encrypted session with ${memberPnIdentifier}`);
  }
  const wrappedChatKey = await wrapChatKeyForMember(
    chatKey,
    ownerPnIdentifier,
    thread.connectionId,
    dmSessionFromThread(thread),
    groupId
  );
  const { appendDeviceGroupRow } = await import('@par-noir/device-cloud-credentials');
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(ownerPnIdentifier);
  const sheetId = drive.index.sheetIds.groups;
  if (!sheetId) throw new Error('cloud_on_device');
  await appendDeviceGroupRow(drive.accessToken, sheetId, {
    groupId,
    ownerPnIdentifier,
    title: groupRow.title,
    createdAt: groupRow.createdAt,
    memberPnIdentifier,
    accessRole,
    wrappedChatKey,
    conversationSpreadsheetId: groupRow.conversationSpreadsheetId,
  });
  const res = await ownerFetch(
    'POST',
    `/api/groups/${encodeURIComponent(groupId)}/members`,
    {
      ownerPnIdentifier,
      memberPnIdentifier,
      wrappedChatKey,
      accessRole,
      deviceCloudResult: { spreadsheetId: sheetId },
    },
    { pnIdentifier: ownerPnIdentifier }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to add group member');
  }
}

/** Pick one row per groupId for the current user. */
export function groupRecordsForUser(groups: GroupRecord[], userPn: string): Map<string, GroupRecord> {
  const map = new Map<string, GroupRecord>();
  for (const g of groups) {
    if (g.memberPnIdentifier !== userPn) continue;
    const existing = map.get(g.groupId);
    if (!existing || g.createdAt > existing.createdAt) {
      map.set(g.groupId, g);
    }
  }
  return map;
}
