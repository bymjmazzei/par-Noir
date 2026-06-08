/**
 * Group messaging API client.
 */

import { PNOAuthService } from './pnOAuthService';
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
import { getMessageThreads } from './messageService';
import { isDmIdentityReady, getDmIdentity } from './dmIdentitySession';
import type { Message } from './messageService';

const groupChatKeys = new Map<string, string>();

export function getGroupChatKeyCache(): Map<string, string> {
  return groupChatKeys;
}

function getAuthHeaders(): HeadersInit {
  const session = PNOAuthService.loadSession();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  return headers;
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
  const params = new URLSearchParams({ userPnIdentifier });
  const res = await fetch(`${API_ENDPOINT}/api/groups?${params}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    throw new Error('Failed to load groups');
  }
  const data = await res.json();
  return data.groups || [];
}

export async function createGroup(
  ownerPnIdentifier: string,
  title: string,
  memberInputs: CreateGroupMemberInput[]
): Promise<{ groupId: string; title: string }> {
  if (!isDmIdentityReady()) {
    throw new Error('Unlock messaging with your passcode before creating a group');
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
      thread.kemCiphertext,
      groupId
    );
    const input = memberInputs.find((m) => m.memberPnIdentifier === pn);
    members.push({
      memberPnIdentifier: pn,
      wrappedChatKey: wrapped,
      accessRole: input?.accessRole || 'readWrite'
    });
  }

  const res = await fetch(`${API_ENDPOINT}/api/groups`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      ownerPnIdentifier,
      title,
      groupId,
      members
    })
  });

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
  const res = await fetch(
    `${API_ENDPOINT}/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberPnIdentifier)}`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ownerPnIdentifier, accessRole })
    }
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
  const res = await fetch(`${API_ENDPOINT}/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ownerPnIdentifier, title })
  });
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
        thread.kemCiphertext,
        groupId
      ),
      accessRole: row.accessRole
    });
  }

  const res = await fetch(
    `${API_ENDPOINT}/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberPnIdentifier)}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ownerPnIdentifier, keyRotation })
    }
  );
  if (!res.ok) {
    throw new Error('Failed to remove group member');
  }
}

async function getDmThreadToOwner(
  userPn: string,
  ownerPn: string
): Promise<{ connectionId?: string; kemCiphertext?: string }> {
  const threads = await getMessageThreads(userPn);
  const t = threads.find((x) => x.participantPnIdentifier === ownerPn);
  return { connectionId: t?.connectionId, kemCiphertext: t?.kemCiphertext };
}

export async function getGroupChatKey(
  userPn: string,
  record: GroupRecord
): Promise<string> {
  const { groupId, ownerPnIdentifier, wrappedChatKey, memberPnIdentifier } = record;
  if (memberPnIdentifier === ownerPnIdentifier) {
    const cached = getGroupChatKeyCache().get(groupId);
    if (cached) return cached;
    const { mlKemSecretKey } = getDmIdentity();
    return unwrapChatKeyForOwner(wrappedChatKey, mlKemSecretKey, groupId);
  }
  const { connectionId, kemCiphertext } = await getDmThreadToOwner(userPn, ownerPnIdentifier);
  if (!connectionId) {
    throw new Error('No encrypted session with group owner. Connect first.');
  }
  return unwrapGroupChatKey(wrappedChatKey, ownerPnIdentifier, connectionId, kemCiphertext, groupId);
}

export async function getGroupMessages(
  userPn: string,
  groupId: string,
  record: GroupRecord,
  spreadsheetId?: string,
  limit = 50,
  offset = 0
): Promise<{ messages: Message[]; total: number }> {
  const params = new URLSearchParams({
    userPnIdentifier: userPn,
    limit: String(limit),
    offset: String(offset)
  });
  if (spreadsheetId) params.set('spreadsheetId', spreadsheetId);
  const res = await fetch(
    `${API_ENDPOINT}/api/groups/${encodeURIComponent(groupId)}/messages?${params}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) {
    throw new Error('Failed to load group messages');
  }
  const data = await res.json();
  const chatKey = await getGroupChatKey(userPn, record);
  const messages: Message[] = await Promise.all(
    (data.messages || []).map(async (row: Message & { encryptedContent?: string }) => {
      const enc = row.encryptedContent || row.content || '';
      let content = '';
      if (enc) {
        try {
          content = await decryptGroupMessage(enc, chatKey);
        } catch {
          content = '[Unable to decrypt message]';
        }
      }
      return { ...row, content, encrypted: true };
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
  mediaMimeType?: string
): Promise<void> {
  if (!isDmIdentityReady()) {
    throw new Error('Unlock messaging with your passcode before sending');
  }
  if (record.accessRole === 'readOnly') {
    throw new Error('You have read-only access in this group');
  }
  const chatKey = await getGroupChatKey(userPn, record);
  const encryptedContent = await encryptGroupMessage(plaintext, chatKey);
  const res = await fetch(`${API_ENDPOINT}/api/groups/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      fromPnIdentifier: userPn,
      userPnIdentifier: userPn,
      encryptedContent,
      cryptoVersion: 2,
      ...(mediaFileId ? { mediaFileId, ...(mediaMimeType ? { mediaMimeType } : {}) } : {})
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to send group message');
  }
}

export async function addGroupMember(
  ownerPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  accessRole: GroupAccessRole = 'readWrite'
): Promise<void> {
  if (!isDmIdentityReady()) {
    throw new Error('Unlock messaging with your passcode before adding members');
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
    thread.kemCiphertext,
    groupId
  );
  const res = await fetch(`${API_ENDPOINT}/api/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      ownerPnIdentifier,
      memberPnIdentifier,
      wrappedChatKey,
      accessRole
    })
  });
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
