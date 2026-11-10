import {
  INBOX_SCHEMA,
  dmInboxRowKey,
  normalizeChannelClientId,
  normalizeInboxRow,
  type InboxRow,
} from '@par-noir/user-owned-storage';
import { readSheetValues, writeSheetValues } from '../deviceSheet.js';
import { listDeviceInbox, upsertDeviceInboxThread, type DeviceInboxThread } from '../deviceSocial.js';
import type { DeviceSocialContext } from './socialContext.js';

export type DeviceInboxEntry = DeviceInboxThread & { groupId?: string };

export interface DeviceInboxStore {
  list(): Promise<DeviceInboxEntry[]>;
  upsert(thread: DeviceInboxEntry): Promise<void>;
  /** Drop rows that match; returns how many were removed. */
  remove(match: (thread: DeviceInboxEntry) => boolean): Promise<number>;
}

function entryFromRow(row: InboxRow): DeviceInboxEntry {
  const n = normalizeInboxRow(row);
  const group = n.threadType === 'group';
  return {
    threadType: group ? 'group' : 'dm',
    participantPnIdentifier: group ? n.groupId || n.participantPnIdentifier : n.participantPnIdentifier,
    spreadsheetId: n.spreadsheetId,
    connectionId: n.connectionId,
    lastMessageAt: n.lastMessageAt,
    lastMessagePreview: n.lastMessagePreview,
    kemCiphertext: n.kemCiphertext,
    wrappedMessageRootKey: n.wrappedMessageRootKey,
    channelClientId: group ? undefined : n.channelClientId,
    ...(group ? { groupId: n.groupId || n.participantPnIdentifier } : {}),
  };
}

function rowFromEntry(entry: DeviceInboxEntry): InboxRow {
  if (entry.threadType === 'group') {
    const groupId = entry.groupId || entry.participantPnIdentifier;
    return {
      inboxRowKey: groupId,
      threadType: 'group',
      participantPnIdentifier: groupId,
      groupId,
      spreadsheetId: entry.spreadsheetId,
      connectionId: entry.connectionId,
      lastMessageAt: entry.lastMessageAt,
      lastMessagePreview: entry.lastMessagePreview,
      kemCiphertext: entry.kemCiphertext,
      wrappedMessageRootKey: entry.wrappedMessageRootKey,
    };
  }
  const channelClientId = normalizeChannelClientId(entry.channelClientId);
  return {
    inboxRowKey: dmInboxRowKey(entry.participantPnIdentifier, channelClientId),
    threadType: 'dm',
    participantPnIdentifier: entry.participantPnIdentifier,
    spreadsheetId: entry.spreadsheetId,
    connectionId: entry.connectionId,
    lastMessageAt: entry.lastMessageAt,
    lastMessagePreview: entry.lastMessagePreview,
    kemCiphertext: entry.kemCiphertext,
    wrappedMessageRootKey: entry.wrappedMessageRootKey,
    channelClientId,
  };
}

function rowKey(row: InboxRow): string {
  return row.inboxRowKey || row.groupId || row.participantPnIdentifier;
}

/** Inbox threads: Google `Inbox` sheet, or the inbox table keyed by peer[|channel] / groupId. */
export function deviceInbox(ctx: DeviceSocialContext, fetchImpl?: typeof fetch): DeviceInboxStore {
  if (ctx.kind === 'google_drive') {
    const sheetId = ctx.index.inboxSheetId;
    return {
      list: async () => (sheetId ? listDeviceInbox(ctx.accessToken, sheetId, fetchImpl) : []),
      upsert: async (thread) => {
        if (!sheetId) throw new Error('Messaging inbox is not ready. Reconnect cloud storage.');
        await upsertDeviceInboxThread(ctx.accessToken, sheetId, thread, fetchImpl);
      },
      remove: async (match) => {
        if (!sheetId) return 0;
        const rows = await readSheetValues(ctx.accessToken, sheetId, 'Inbox!A2:I', fetchImpl);
        const threads = await listDeviceInbox(ctx.accessToken, sheetId, fetchImpl);
        const drop = new Set(
          threads.filter(match).map((t) => `${t.participantPnIdentifier}|${t.threadType}|${t.channelClientId || ''}`)
        );
        if (drop.size === 0) return 0;
        const kept = rows.filter((row) => {
          const threadType = row[6] === 'group' ? 'group' : 'dm';
          return !drop.has(`${row[0]}|${threadType}|${row[8] || ''}`);
        });
        const blank = Array.from({ length: rows.length - kept.length }, () => Array(9).fill(''));
        await writeSheetValues(ctx.accessToken, sheetId, 'Inbox!A2:I', [...kept, ...blank], fetchImpl);
        return rows.length - kept.length;
      },
    };
  }
  const table = () => ctx.tables.openTable(INBOX_SCHEMA);
  return {
    list: async () => {
      const rows = (await (await table()).scan()) as unknown as InboxRow[];
      return rows
        .map(entryFromRow)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    },
    upsert: async (thread) => {
      const handle = await table();
      const next = rowFromEntry(thread);
      const rows = (await handle.scan()) as unknown as InboxRow[];
      let stored: InboxRow | undefined;
      for (const existing of rows) {
        if (normalizeInboxRow(existing).inboxRowKey !== next.inboxRowKey) continue;
        stored = { ...stored, ...existing };
        const key = rowKey(existing);
        if (key !== next.inboxRowKey) await handle.delete(key);
      }
      await handle.append({ ...(stored ?? {}), ...stripUndefined(next) });
    },
    remove: async (match) => {
      const handle = await table();
      const rows = (await handle.scan()) as unknown as InboxRow[];
      let removed = 0;
      for (const row of rows) {
        if (!match(entryFromRow(row))) continue;
        await handle.delete(rowKey(row));
        removed += 1;
      }
      return removed;
    },
  };
}

/** Layout v1 on portable clouds: re-key legacy inbox rows to peer|channel / groupId. Returns rows moved. */
export async function normalizeInboxKeysOnTables(ctx: Extract<DeviceSocialContext, { kind: 'tables' }>): Promise<number> {
  const handle = await ctx.tables.openTable(INBOX_SCHEMA);
  const rows = (await handle.scan()) as unknown as InboxRow[];
  let moved = 0;
  for (const row of rows) {
    const complete =
      !!row.inboxRowKey && !!row.threadType && (row.threadType === 'group' || !!row.channelClientId);
    if (complete) continue;
    const normalized = normalizeInboxRow(row);
    const key = rowKey(row);
    if (key !== normalized.inboxRowKey) await handle.delete(key);
    await handle.append({ ...stripUndefined(row), ...stripUndefined(normalized) });
    moved += 1;
  }
  return moved;
}

function stripUndefined<T extends object>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}
