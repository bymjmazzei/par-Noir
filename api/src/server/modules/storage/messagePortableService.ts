import { conversationLogPath, messagesPath } from '@par-noir/user-owned-storage';
import type { Message } from '../messageSheetsService';
import { resolveStorageContext } from './storageFacade';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableGetByKey,
  portableTableScan
} from './portableTableService';
import { INBOX_SCHEMA } from './tableSchemas';

export const PORTABLE_MESSAGES_FOLDER = 'pn-portable-messages';
export const PORTABLE_INBOX_SHEET = 'pn-portable-inbox';

export function portableConversationSheetId(otherPn: string): string {
  const id = otherPn.startsWith('pn-') ? otherPn : `pn-${otherPn}`;
  return `pn-portable-conv:${id}`;
}

export function portableGroupConversationSheetId(groupId: string): string {
  return `pn-portable-group:${groupId}`;
}

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function parseConversationId(sheetId: string): { kind: 'dm'; otherPn: string } | { kind: 'group'; groupId: string } | null {
  if (sheetId.startsWith('pn-portable-conv:')) {
    return { kind: 'dm', otherPn: sheetId.slice('pn-portable-conv:'.length) };
  }
  if (sheetId.startsWith('pn-portable-group:')) {
    return { kind: 'group', groupId: sheetId.slice('pn-portable-group:'.length) };
  }
  return null;
}

async function conversationBlobKey(
  pnIdentifier: string,
  sheetId: string,
  accountId?: string
): Promise<string> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  const parsed = parseConversationId(sheetId);
  if (!parsed) throw new Error('Invalid portable conversation id');
  if (parsed.kind === 'group') {
    return `${ctx.rootPrefix}${messagesPath(`group-${parsed.groupId}.jsonl`)}`;
  }
  return `${ctx.rootPrefix}${conversationLogPath(parsed.otherPn)}`;
}

async function readConversationLines(
  pnIdentifier: string,
  sheetId: string,
  accountId?: string
): Promise<Message[]> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  if (!ctx.blobStore) return [];
  const key = await conversationBlobKey(pnIdentifier, sheetId, accountId);
  const raw = await ctx.blobStore.get(key);
  if (!raw) return [];
  const text = Buffer.from(raw).toString('utf8').trim();
  if (!text) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Message);
}

export async function writeConversationLines(
  pnIdentifier: string,
  sheetId: string,
  messages: Message[],
  accountId?: string
): Promise<void> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  if (!ctx.blobStore) throw new Error('Blob store unavailable');
  const key = await conversationBlobKey(pnIdentifier, sheetId, accountId);
  const body = messages.map((m) => JSON.stringify(m)).join('\n');
  await ctx.blobStore.put(key, Buffer.from(body ? `${body}\n` : '', 'utf8'), {
    contentType: 'application/x-ndjson'
  });
}

export async function getOrCreateMessagesFolderPortable(_pnFolderId: string): Promise<string> {
  return PORTABLE_MESSAGES_FOLDER;
}

export async function getInboxSheetPortable(): Promise<string> {
  return PORTABLE_INBOX_SHEET;
}

export async function getConversationSheetPortable(otherPn: string): Promise<string> {
  return portableConversationSheetId(otherPn);
}

export async function createConversationSheetPortable(otherPn: string): Promise<string> {
  return portableConversationSheetId(otherPn);
}

export async function appendMessagePortable(
  pnIdentifier: string,
  sheetId: string,
  message: Message,
  accountId?: string
): Promise<void> {
  const messages = await readConversationLines(pnIdentifier, sheetId, accountId);
  messages.unshift(message);
  await writeConversationLines(pnIdentifier, sheetId, messages, accountId);
}

export async function getMessagesPortable(
  pnIdentifier: string,
  sheetId: string,
  accountId?: string,
  options?: { limit?: number; offset?: number }
): Promise<{ messages: Message[]; total: number }> {
  const all = await readConversationLines(pnIdentifier, sheetId, accountId);
  const total = all.length;
  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;
  return { messages: all.slice(offset, offset + limit), total };
}

export async function markAsReadPortable(
  pnIdentifier: string,
  sheetId: string,
  messageIds: string[],
  accountId?: string
): Promise<void> {
  const messages = await readConversationLines(pnIdentifier, sheetId, accountId);
  const now = new Date().toISOString();
  const idSet = new Set(messageIds);
  let changed = false;
  for (const m of messages) {
    if (idSet.has(m.messageId) && !m.read) {
      m.read = true;
      m.readAt = now;
      changed = true;
    }
  }
  if (changed) await writeConversationLines(pnIdentifier, sheetId, messages, accountId);
}

export async function deleteMessageFromConversationPortable(
  pnIdentifier: string,
  sheetId: string,
  messageId: string,
  accountId?: string
): Promise<{ deleted: boolean; mediaFileId?: string }> {
  const messages = await readConversationLines(pnIdentifier, sheetId, accountId);
  const idx = messages.findIndex((m) => m.messageId === messageId);
  if (idx === -1) return { deleted: false };
  const mediaFileId = messages[idx].mediaFileId;
  const filtered = messages.filter((m) => m.messageId !== messageId);
  await writeConversationLines(pnIdentifier, sheetId, filtered, accountId);
  return { deleted: true, ...(mediaFileId ? { mediaFileId } : {}) };
}

export async function deleteConversationPortable(
  pnIdentifier: string,
  sheetId: string,
  accountId?: string
): Promise<void> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  if (!ctx.blobStore) return;
  const key = await conversationBlobKey(pnIdentifier, sheetId, accountId);
  await ctx.blobStore.delete(key);
}

export async function countUnreadMessagesPortable(
  pnIdentifier: string,
  sheetId: string,
  forPn: string,
  accountId?: string
): Promise<number> {
  const messages = await readConversationLines(pnIdentifier, sheetId, accountId);
  const self = normalizePn(forPn);
  return messages.filter((m) => !m.read && normalizePn(m.toPnIdentifier) === self).length;
}

export interface InboxRow {
  threadType?: 'dm' | 'group';
  participantPnIdentifier: string;
  spreadsheetId: string;
  connectionId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  kemCiphertext?: string;
  groupId?: string;
}

export async function updateInboxEntryPortable(
  pnIdentifier: string,
  entry: InboxRow,
  accountId?: string
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    INBOX_SCHEMA,
    { threadType: 'dm', ...entry } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function removeInboxEntryPortable(
  pnIdentifier: string,
  participantPnIdentifier: string,
  accountId?: string
): Promise<void> {
  await portableTableDelete(pnIdentifier, INBOX_SCHEMA, participantPnIdentifier, accountId);
}

export async function getInboxConversationsPortable(
  pnIdentifier: string,
  accountId?: string
): Promise<InboxRow[]> {
  const rows = await portableTableScan<InboxRow>(pnIdentifier, INBOX_SCHEMA, accountId);
  return rows.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export async function getInboxConversationByParticipantPortable(
  pnIdentifier: string,
  participantPnIdentifier: string,
  accountId?: string
): Promise<InboxRow | null> {
  return portableTableGetByKey<InboxRow>(
    pnIdentifier,
    INBOX_SCHEMA,
    participantPnIdentifier,
    accountId
  );
}

export async function getInboxEntriesPortable(
  pnIdentifier: string,
  accountId?: string
): Promise<
  Array<{
    threadType: 'dm' | 'group';
    participantPnIdentifier: string;
    spreadsheetId: string;
    connectionId: string;
    lastMessageAt: string;
    lastMessagePreview?: string;
    kemCiphertext?: string;
    groupId?: string;
    ownerPnIdentifier?: string;
    groupTitle?: string;
  }>
> {
  const rows = await getInboxConversationsPortable(pnIdentifier, accountId);
  return rows.map((r) => {
    const threadType = r.threadType ?? 'dm';
    if (threadType === 'group') {
      return {
        threadType: 'group' as const,
        participantPnIdentifier: r.participantPnIdentifier,
        spreadsheetId: r.spreadsheetId,
        connectionId: r.connectionId,
        lastMessageAt: r.lastMessageAt,
        lastMessagePreview: r.lastMessagePreview,
        kemCiphertext: r.kemCiphertext,
        groupId: r.groupId ?? r.participantPnIdentifier,
        ownerPnIdentifier: r.connectionId
      };
    }
    return {
      threadType: 'dm' as const,
      participantPnIdentifier: r.participantPnIdentifier,
      spreadsheetId: r.spreadsheetId,
      connectionId: r.connectionId,
      lastMessageAt: r.lastMessageAt,
      lastMessagePreview: r.lastMessagePreview,
      kemCiphertext: r.kemCiphertext
    };
  });
}

export async function getOrCreateInboxSheetPortable(): Promise<string> {
  return PORTABLE_INBOX_SHEET;
}

export async function getConversationsPortable(
  pnIdentifier: string,
  accountId?: string
): Promise<
  Array<{
    participantPnIdentifier: string;
    spreadsheetId: string;
    connectionId: string;
    lastMessageAt: string;
    lastMessagePreview?: string;
  }>
> {
  const rows = await getInboxConversationsPortable(pnIdentifier, accountId);
  return rows.map((r) => ({
    participantPnIdentifier: r.participantPnIdentifier,
    spreadsheetId: r.spreadsheetId,
    connectionId: r.connectionId,
    lastMessageAt: r.lastMessageAt,
    lastMessagePreview: r.lastMessagePreview
  }));
}

export async function applyMessageRowUpdatesPortable(
  pnIdentifier: string,
  sheetId: string,
  rowUpdates: Array<{
    rowIndex: number;
    fromPnIdentifier?: string;
    encryptedContent?: string;
  }>,
  accountId?: string
): Promise<number> {
  const messages = await readConversationLines(pnIdentifier, sheetId, accountId);
  let updated = 0;
  for (const row of rowUpdates) {
    const idx = row.rowIndex - 2;
    if (idx < 0 || idx >= messages.length) continue;
    if (row.fromPnIdentifier) {
      messages[idx].fromPnIdentifier = row.fromPnIdentifier;
      updated++;
    }
    if (row.encryptedContent) {
      messages[idx].encryptedContent = row.encryptedContent;
      messages[idx].cryptoVersion = 2;
      updated++;
    }
  }
  if (updated > 0) await writeConversationLines(pnIdentifier, sheetId, messages, accountId);
  return updated;
}

export async function updateGroupInboxEntryPortable(
  pnIdentifier: string,
  groupId: string,
  entry: Omit<InboxRow, 'threadType' | 'participantPnIdentifier'> & { title?: string },
  accountId?: string
): Promise<void> {
  await portableTableAppend(
    pnIdentifier,
    INBOX_SCHEMA,
    {
      threadType: 'group',
      participantPnIdentifier: groupId,
      groupId,
      ...entry
    } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function getOrCreateGroupConversationSheetPortable(groupId: string): Promise<string> {
  return portableGroupConversationSheetId(groupId);
}

export async function createGroupConversationSheetPortable(groupId: string): Promise<string> {
  return portableGroupConversationSheetId(groupId);
}
