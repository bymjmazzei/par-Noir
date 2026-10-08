/**
 * Connection, inbox, group, and public-index sheets on the device.
 * Column layouts match the sheets the API used to write.
 */

import { appendSheetValues, readSheetValues, writeSheetValues } from './deviceSheet.js';
import { upsertDevicePublicIndexFile } from './deviceIndexes.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';
import { ensureDeviceDriveLayout } from './deviceDriveLayout.js';
import { getSessionDriveIndex, setSessionDriveIndex } from './sessionMemory.js';

export type DeviceConnection = {
  connectionId: string;
  userPnIdentifier: string;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
  peerMlKemPublicKey?: string;
  kemCiphertext?: string;
  peerMailboxRouteKey?: string;
};

function peerKey(column: string | undefined): string | undefined {
  if (!column?.trim()) return undefined;
  try {
    const bin = atob(column.replace(/\s/g, ''));
    if (bin.length >= 1000) return column;
  } catch {
    /* legacy shared secret */
  }
  return undefined;
}

function connectionFromRow(row: string[]): DeviceConnection | null {
  const connectionId = row[0];
  const rawPeer = row[1];
  if (!connectionId || !rawPeer) return null;
  const userPnIdentifier = rawPeer.startsWith('pn-') ? rawPeer : `pn-${rawPeer}`;
  const peerMlKemPublicKey = peerKey(row[5]);
  const route = typeof row[7] === 'string' && /^[a-f0-9]{64}$/i.test(row[7].trim()) ? row[7].trim() : undefined;
  return {
    connectionId,
    userPnIdentifier,
    status: (row[2] || 'pending_sent') as DeviceConnection['status'],
    createdAt: row[3] || new Date().toISOString(),
    acceptedAt: row[4] || undefined,
    peerMlKemPublicKey,
    kemCiphertext: row[6] || undefined,
    peerMailboxRouteKey: route,
  };
}

function connectionToRow(row: DeviceConnection): string[] {
  return [
    row.connectionId,
    row.userPnIdentifier,
    row.status,
    row.createdAt,
    row.acceptedAt || '',
    row.peerMlKemPublicKey || '',
    row.kemCiphertext || '',
    row.peerMailboxRouteKey || '',
  ];
}

export async function listDeviceConnections(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceConnection[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Connections!A2:H', fetchImpl);
  return rows.map(connectionFromRow).filter((row): row is DeviceConnection => !!row && row.userPnIdentifier.length > 4);
}

export async function upsertDeviceConnection(
  accessToken: string,
  spreadsheetId: string,
  next: DeviceConnection,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Connections!A2:H', fetchImpl);
  const parsed = rows.map(connectionFromRow);
  const index = parsed.findIndex((row) => row?.connectionId === next.connectionId);
  if (index === -1) {
    await appendSheetValues(accessToken, spreadsheetId, 'Connections!A:H', [connectionToRow(next)], fetchImpl);
    return;
  }
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    `Connections!A${index + 2}:H${index + 2}`,
    [connectionToRow(next)],
    fetchImpl
  );
}

export type DeviceInboxThread = {
  threadType: 'dm' | 'group';
  participantPnIdentifier: string;
  spreadsheetId: string;
  connectionId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  channelClientId?: string;
};

export async function listDeviceInbox(
  accessToken: string,
  inboxSheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceInboxThread[]> {
  const rows = await readSheetValues(accessToken, inboxSheetId, 'Inbox!A2:I', fetchImpl);
  return rows
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      threadType: row[6] === 'group' ? 'group' : 'dm',
      participantPnIdentifier: row[0],
      spreadsheetId: row[1],
      connectionId: row[2] || '',
      lastMessageAt: row[3] || '',
      lastMessagePreview: row[4] || undefined,
      kemCiphertext: row[5] || undefined,
      wrappedMessageRootKey: row[7] || undefined,
      channelClientId: row[8] || undefined,
    }));
}

export async function upsertDeviceInboxThread(
  accessToken: string,
  inboxSheetId: string,
  thread: DeviceInboxThread,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, inboxSheetId, 'Inbox!A2:I', fetchImpl);
  const values = [
    thread.participantPnIdentifier,
    thread.spreadsheetId,
    thread.connectionId,
    thread.lastMessageAt,
    thread.lastMessagePreview || '',
    thread.kemCiphertext || '',
    thread.threadType,
    thread.wrappedMessageRootKey || '',
    thread.channelClientId || '',
  ];
  const index = rows.findIndex((row) => row[0] === thread.participantPnIdentifier && (row[6] || 'dm') === thread.threadType);
  if (index === -1) {
    await appendSheetValues(accessToken, inboxSheetId, 'Inbox!A:I', [values], fetchImpl);
    return;
  }
  await writeSheetValues(accessToken, inboxSheetId, `Inbox!A${index + 2}:I${index + 2}`, [values], fetchImpl);
}

export type DeviceMessage = {
  fromPnIdentifier: string;
  content: string;
  timestamp: string;
  messageId: string;
  read: boolean;
  encryptedContent?: string;
  cryptoVersion?: number;
};

export async function listDeviceMessages(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceMessage[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Messages!A2:J', fetchImpl);
  return rows
    .filter((row) => row[3])
    .map((row) => ({
      fromPnIdentifier: row[0] || '',
      content: row[1] || '',
      encryptedContent: row[6] === '2' ? row[1] : undefined,
      timestamp: row[2] || '',
      messageId: row[3],
      read: row[4] === 'true',
      cryptoVersion: row[6] ? Number(row[6]) : undefined,
    }));
}

export async function appendDeviceMessage(
  accessToken: string,
  spreadsheetId: string,
  message: DeviceMessage,
  fetchImpl?: typeof fetch
): Promise<void> {
  await appendSheetValues(
    accessToken,
    spreadsheetId,
    'Messages!A:J',
    [[
      message.fromPnIdentifier,
      message.encryptedContent || message.content,
      message.timestamp,
      message.messageId,
      message.read ? 'true' : 'false',
      '',
      message.cryptoVersion ? String(message.cryptoVersion) : '',
      '',
      '',
      '',
    ]],
    fetchImpl
  );
}

export type DeviceGroupRow = {
  groupId: string;
  ownerPnIdentifier: string;
  title: string;
  createdAt: string;
  memberPnIdentifier: string;
  accessRole: string;
  wrappedChatKey: string;
  conversationSpreadsheetId?: string;
};

export async function listDeviceGroups(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceGroupRow[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Groups!A2:H', fetchImpl);
  return rows
    .filter((row) => row[0] && row[4])
    .map((row) => ({
      groupId: row[0],
      ownerPnIdentifier: row[1] || '',
      title: row[2] || '',
      createdAt: row[3] || '',
      memberPnIdentifier: row[4],
      accessRole: row[5] || 'readWrite',
      wrappedChatKey: row[6] || '',
      conversationSpreadsheetId: row[7] || undefined,
    }));
}

export async function appendDeviceGroupRow(
  accessToken: string,
  spreadsheetId: string,
  row: DeviceGroupRow,
  fetchImpl?: typeof fetch
): Promise<void> {
  await appendSheetValues(
    accessToken,
    spreadsheetId,
    'Groups!A:H',
    [[
      row.groupId,
      row.ownerPnIdentifier,
      row.title,
      row.createdAt,
      row.memberPnIdentifier,
      row.accessRole,
      row.wrappedChatKey,
      row.conversationSpreadsheetId || '',
    ]],
    fetchImpl
  );
}

export async function appendPublicIndexRow(
  accessToken: string,
  spreadsheetId: string,
  entry: Record<string, unknown>,
  fetchImpl?: typeof fetch
): Promise<void> {
  await upsertDevicePublicIndexFile(accessToken, spreadsheetId, entry, fetchImpl);
}

export async function ensureSessionDriveIndex(args: {
  identityId: string;
  accessToken: string;
  readStoredIndex?: () => Promise<DeviceDriveLayout | null>;
  persistIndex?: (index: DeviceDriveLayout) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<DeviceDriveLayout> {
  const existing = getSessionDriveIndex(args.identityId);
  if (existing?.inboxSheetId && existing.sheetIds.connections) return existing;
  const stored = await args.readStoredIndex?.();
  if (stored?.inboxSheetId && stored.sheetIds?.connections) {
    setSessionDriveIndex(args.identityId, stored);
    return stored;
  }
  const built = await ensureDeviceDriveLayout(args.accessToken, args.fetchImpl);
  setSessionDriveIndex(args.identityId, built);
  await args.persistIndex?.(built);
  return built;
}
