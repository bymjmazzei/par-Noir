import {
  conversationLogPath,
  messagesPath,
  parsePortableConversationId,
  portableGroupConversationId,
} from '@par-noir/user-owned-storage';
import { portableConversationBlobId } from '@par-noir/dm-crypto';
import { readSheetValues, writeSheetValues } from '../deviceSheet.js';
import { appendDeviceMessage, listDeviceMessages, resolveOwnConversationSheet, type DeviceMessage } from '../deviceSocial.js';
import { deleteDeviceMessageRow, markDeviceMessageRead } from '../deviceProduct.js';
import { normalizeCloudIdentityId } from '../sessionMemory.js';
import type { DeviceSocialContext } from './socialContext.js';
import { deviceInbox } from './inbox.js';
import { editBlobText, readBlobText } from './blobText.js';

/** A stored message; tables keep the API's full row (recipient, media fields). */
export type DeviceConversationMessage = DeviceMessage & {
  toPnIdentifier?: string;
  readAt?: string;
  mediaFileId?: string;
  mediaBackend?: string;
  mediaMimeType?: string;
};

export type ConversationRowUpdate = { rowIndex: number; fromPnIdentifier?: string; encryptedContent?: string };

export interface DeviceConversation {
  readonly id: string;
  /** Oldest first. */
  list(): Promise<DeviceConversationMessage[]>;
  append(message: DeviceConversationMessage): Promise<void>;
  markRead(messageId: string): Promise<void>;
  remove(messageId: string): Promise<void>;
  /** Positional rows for identity re-key: rowIndex is stable between rows() and applyRowUpdates(). */
  rows(): Promise<Array<{ rowIndex: number; fromPnIdentifier: string; encryptedContent: string }>>;
  applyRowUpdates(updates: ConversationRowUpdate[]): Promise<number>;
}

const NDJSON = 'application/x-ndjson';

function conversationBlobKey(layoutRoot: string, conversationId: string): string {
  const parsed = parsePortableConversationId(conversationId);
  if (!parsed) throw new Error(`Not a portable conversation id: ${conversationId}`);
  return parsed.kind === 'group'
    ? `${layoutRoot}${messagesPath(`group-${parsed.groupId}.jsonl`)}`
    : `${layoutRoot}${conversationLogPath(parsed.peerKey)}`;
}

/** Stored newest first, the order the API wrote. */
function parseLines(text: string | null): DeviceConversationMessage[] {
  if (!text?.trim()) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DeviceConversationMessage);
}

function serialize(messages: DeviceConversationMessage[]): string {
  return messages.length ? `${messages.map((m) => JSON.stringify(m)).join('\n')}\n` : '';
}

export function deviceConversation(
  ctx: DeviceSocialContext,
  conversationId: string,
  fetchImpl?: typeof fetch
): DeviceConversation {
  if (ctx.kind === 'google_drive') {
    const token = ctx.accessToken;
    return {
      id: conversationId,
      list: () => listDeviceMessages(token, conversationId, fetchImpl),
      append: (message) => appendDeviceMessage(token, conversationId, message, fetchImpl),
      markRead: (messageId) => markDeviceMessageRead(token, conversationId, messageId, fetchImpl),
      remove: (messageId) => deleteDeviceMessageRow(token, conversationId, messageId, fetchImpl),
      rows: async () =>
        (await readSheetValues(token, conversationId, 'Messages!A2:J', fetchImpl)).map((row, i) => ({
          rowIndex: i + 2,
          fromPnIdentifier: row[0] || '',
          encryptedContent: row[1] || '',
        })),
      applyRowUpdates: async (updates) => {
        let updated = 0;
        for (const row of updates) {
          if (!row.rowIndex || row.rowIndex < 2) continue;
          if (row.fromPnIdentifier) {
            await writeSheetValues(token, conversationId, `Messages!A${row.rowIndex}`, [[row.fromPnIdentifier]], fetchImpl);
            updated++;
          }
          if (row.encryptedContent) {
            await writeSheetValues(token, conversationId, `Messages!B${row.rowIndex}`, [[row.encryptedContent]], fetchImpl);
            updated++;
          }
        }
        return updated;
      },
    };
  }

  const key = conversationBlobKey(ctx.layoutRoot, conversationId);
  const blobs = ctx.blobs;
  const edit = (change: (messages: DeviceConversationMessage[]) => boolean) =>
    editBlobText(blobs, key, NDJSON, (current) => {
      const messages = parseLines(current);
      return change(messages) ? serialize(messages) : null;
    });
  return {
    id: conversationId,
    list: async () => parseLines(await readBlobText(blobs, key)).reverse(),
    append: async (message) => {
      await edit((messages) => {
        if (message.messageId && messages.some((m) => m.messageId === message.messageId)) return false;
        messages.unshift(message);
        return true;
      });
    },
    markRead: async (messageId) => {
      const readAt = new Date().toISOString();
      await edit((messages) => {
        const target = messages.find((m) => m.messageId === messageId && !m.read);
        if (!target) return false;
        target.read = true;
        target.readAt = readAt;
        return true;
      });
    },
    remove: async (messageId) => {
      await edit((messages) => {
        const index = messages.findIndex((m) => m.messageId === messageId);
        if (index === -1) return false;
        messages.splice(index, 1);
        return true;
      });
    },
    rows: async () =>
      parseLines(await readBlobText(blobs, key)).map((m, i) => ({
        rowIndex: i + 2,
        fromPnIdentifier: m.fromPnIdentifier,
        encryptedContent: m.encryptedContent || '',
      })),
    applyRowUpdates: async (updates) => {
      let updated = 0;
      await edit((messages) => {
        updated = 0;
        for (const row of updates) {
          const target = messages[row.rowIndex - 2];
          if (!target) continue;
          if (row.fromPnIdentifier) {
            target.fromPnIdentifier = row.fromPnIdentifier;
            updated++;
          }
          if (row.encryptedContent) {
            target.encryptedContent = row.encryptedContent;
            target.cryptoVersion = 2;
            updated++;
          }
        }
        return updated > 0;
      });
      return updated;
    },
  };
}

export type DmConversationArgs = {
  identityId: string;
  peerPnIdentifier?: string;
  connectionId?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  channelClientId?: string;
};

/**
 * The conversation this pN writes a DM thread to, on its own cloud. Creates the
 * thread (and its inbox row) when missing.
 */
export async function resolveDmConversation(
  ctx: DeviceSocialContext,
  args: DmConversationArgs,
  fetchImpl?: typeof fetch
): Promise<string> {
  if (ctx.kind === 'google_drive') {
    return resolveOwnConversationSheet({ accessToken: ctx.accessToken, ...args, fetchImpl });
  }
  const peerArg = args.peerPnIdentifier ? normalizeCloudIdentityId(args.peerPnIdentifier) : '';
  if (!peerArg && !args.connectionId) {
    throw new Error('peerPnIdentifier or connectionId is required for a conversation');
  }
  const inbox = deviceInbox(ctx, fetchImpl);
  const thread = (await inbox.list()).find(
    (row) =>
      row.threadType === 'dm' &&
      ((peerArg && normalizeCloudIdentityId(row.participantPnIdentifier) === peerArg) ||
        (!peerArg && row.connectionId === args.connectionId))
  );
  if (thread?.spreadsheetId && parsePortableConversationId(thread.spreadsheetId)?.kind === 'dm') {
    return thread.spreadsheetId;
  }
  const peer = peerArg || (thread ? normalizeCloudIdentityId(thread.participantPnIdentifier) : '');
  if (!peer) throw new Error('No conversation found for this connection');
  const conversationId = portableConversationBlobId(normalizeCloudIdentityId(args.identityId), peer);
  await inbox.upsert({
    threadType: 'dm',
    participantPnIdentifier: thread?.participantPnIdentifier || peer,
    spreadsheetId: conversationId,
    connectionId: args.connectionId || thread?.connectionId || '',
    lastMessageAt: thread?.lastMessageAt || new Date().toISOString(),
    lastMessagePreview: thread?.lastMessagePreview,
    kemCiphertext: thread?.kemCiphertext || args.kemCiphertext,
    wrappedMessageRootKey: thread?.wrappedMessageRootKey || args.wrappedMessageRootKey,
    channelClientId: thread?.channelClientId || args.channelClientId,
  });
  return conversationId;
}

/** Group threads on tables live at one id per group; Google keeps a sheet id on the group row. */
export function groupConversationIdFor(ctx: DeviceSocialContext, groupId: string, sheetId?: string): string | undefined {
  return ctx.kind === 'google_drive' ? sheetId : portableGroupConversationId(groupId);
}
