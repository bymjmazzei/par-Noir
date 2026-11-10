/**
 * Connection, inbox, and group sheets on the device.
 * Column layouts match the sheets the API used to write.
 */

import { appendSheetValues, readSheetValues, writeSheetValues } from './deviceSheet.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';
import { ensureDeviceDriveLayout, isDeviceDriveLayoutComplete } from './deviceDriveLayout.js';
import { ensureDriveChildSpreadsheet, writeSheetHeaders, type SpreadsheetSpec } from './driveChild.js';
import { getSessionDriveIndex, normalizeCloudIdentityId, setSessionDriveIndex } from './sessionMemory.js';

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

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MESSAGES_TAB = 'Messages';

const MESSAGES_HEADERS = [
  'User DID',
  'Message Content',
  'Timestamp',
  'Message ID',
  'Read Status',
  'Read At',
  'Crypto Version',
  'Media File ID',
  'Media MIME Type',
  'Media Backend',
];
const MESSAGES_HEADER_WRITE = [{ range: `${MESSAGES_TAB}!A1:J1`, values: [MESSAGES_HEADERS] }];

function conversationSpec(connectionId: string): SpreadsheetSpec {
  const name = `dm-${connectionId}`;
  return {
    driveFileName: name,
    sheets: [{ title: MESSAGES_TAB, rowCount: 10_000, columnCount: MESSAGES_HEADERS.length }],
    headers: MESSAGES_HEADER_WRITE,
  };
}

function googleJsonHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

/** Adds the Messages tab and header row when a DM sheet was created blank. */
export async function ensureMessagesTab(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const metaRes = await fetchImpl(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    { headers: googleJsonHeaders(accessToken) }
  );
  if (!metaRes.ok) throw new Error(`conversation_sheet_meta_failed_${metaRes.status}`);
  const meta = (await metaRes.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  if ((meta.sheets || []).some((sheet) => sheet.properties?.title === MESSAGES_TAB)) return;
  const added = await fetchImpl(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    headers: googleJsonHeaders(accessToken),
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: MESSAGES_TAB,
              gridProperties: { rowCount: 10_000, columnCount: MESSAGES_HEADERS.length },
            },
          },
        },
      ],
    }),
  });
  if (!added.ok) throw new Error(`conversation_sheet_tab_failed_${added.status}`);
  await writeSheetHeaders(accessToken, spreadsheetId, MESSAGES_HEADER_WRITE, fetchImpl);
}

/** Find or create this pN's own `dm-<connectionId>` sheet with a Messages tab. */
export async function ensureDeviceConversationSheet(
  accessToken: string,
  messagesFolderId: string,
  connectionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!messagesFolderId) throw new Error('messages folder missing from Drive layout');
  if (!connectionId) throw new Error('connectionId is required for a conversation sheet');
  const spreadsheetId = await ensureDriveChildSpreadsheet(
    accessToken,
    messagesFolderId,
    conversationSpec(connectionId),
    fetchImpl
  );
  await ensureMessagesTab(accessToken, spreadsheetId, fetchImpl);
  return spreadsheetId;
}

/**
 * Sheets created by the old API carry legacy names and may sit outside the
 * current messages folder; only a `dm-*` sheet in another folder is the peer's.
 */
async function isOwnConversationSheet(
  accessToken: string,
  spreadsheetId: string,
  messagesFolderId: string,
  fetchImpl: typeof fetch
): Promise<boolean> {
  const res = await fetchImpl(
    `${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}?fields=name,parents`,
    { headers: googleJsonHeaders(accessToken) }
  );
  if (!res.ok) return false;
  const file = (await res.json()) as { name?: string; parents?: string[] };
  if ((file.parents || []).includes(messagesFolderId)) return true;
  return !(file.name || '').startsWith('dm-');
}

const ownConversationSheetCache = new Map<string, string>();

export function clearOwnConversationSheetCache(): void {
  ownConversationSheetCache.clear();
}

/**
 * The sheet this pN writes a DM thread to — always in its own Drive. Repairs
 * blank sheets, replaces peer-owned ids, and keeps the Inbox row in sync.
 */
export async function resolveOwnConversationSheet(args: {
  accessToken: string;
  identityId: string;
  /** Optional when connectionId identifies the thread. */
  peerPnIdentifier?: string;
  connectionId?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  channelClientId?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = args.fetchImpl || fetch;
  const identityKey = normalizeCloudIdentityId(args.identityId);
  const peerArg = args.peerPnIdentifier ? normalizeCloudIdentityId(args.peerPnIdentifier) : '';
  if (!peerArg && !args.connectionId) {
    throw new Error('peerPnIdentifier or connectionId is required for a conversation sheet');
  }
  const cached =
    (peerArg && ownConversationSheetCache.get(`${identityKey}|${peerArg}`)) ||
    (args.connectionId && ownConversationSheetCache.get(`${identityKey}|conn:${args.connectionId}`));
  if (cached) return cached;

  const index = getSessionDriveIndex(args.identityId);
  if (!index?.inboxSheetId || !index.messagesFolderId) {
    throw new Error('Drive layout not ready for messaging');
  }
  const threads = await listDeviceInbox(args.accessToken, index.inboxSheetId, fetchImpl);
  const thread = threads.find(
    (row) =>
      row.threadType === 'dm' &&
      ((peerArg && normalizeCloudIdentityId(row.participantPnIdentifier) === peerArg) ||
        (!peerArg && !!args.connectionId && row.connectionId === args.connectionId))
  );
  const peer = peerArg || (thread ? normalizeCloudIdentityId(thread.participantPnIdentifier) : '');
  if (!peer) throw new Error('No conversation found for this connection');
  const remember = (spreadsheetId: string) => {
    ownConversationSheetCache.set(`${identityKey}|${peer}`, spreadsheetId);
    const connectionId = args.connectionId || thread?.connectionId;
    if (connectionId) ownConversationSheetCache.set(`${identityKey}|conn:${connectionId}`, spreadsheetId);
  };

  if (
    thread?.spreadsheetId &&
    (await isOwnConversationSheet(args.accessToken, thread.spreadsheetId, index.messagesFolderId, fetchImpl))
  ) {
    await ensureMessagesTab(args.accessToken, thread.spreadsheetId, fetchImpl);
    remember(thread.spreadsheetId);
    return thread.spreadsheetId;
  }

  const connectionId = args.connectionId || thread?.connectionId || '';
  const spreadsheetId = await ensureDeviceConversationSheet(
    args.accessToken,
    index.messagesFolderId,
    connectionId,
    fetchImpl
  );
  await upsertDeviceInboxThread(
    args.accessToken,
    index.inboxSheetId,
    {
      threadType: 'dm',
      participantPnIdentifier: thread?.participantPnIdentifier || peer,
      spreadsheetId,
      connectionId,
      lastMessageAt: thread?.lastMessageAt || new Date().toISOString(),
      lastMessagePreview: thread?.lastMessagePreview,
      kemCiphertext: thread?.kemCiphertext || args.kemCiphertext,
      wrappedMessageRootKey: thread?.wrappedMessageRootKey || args.wrappedMessageRootKey,
      channelClientId: thread?.channelClientId || args.channelClientId,
    },
    fetchImpl
  );
  remember(spreadsheetId);
  return spreadsheetId;
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

export async function ensureSessionDriveIndex(args: {
  identityId: string;
  accessToken: string;
  readStoredIndex?: () => Promise<DeviceDriveLayout | null>;
  persistIndex?: (index: DeviceDriveLayout) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<DeviceDriveLayout> {
  const existing = getSessionDriveIndex(args.identityId);
  if (isDeviceDriveLayoutComplete(existing)) return existing!;
  const stored = await args.readStoredIndex?.();
  if (isDeviceDriveLayoutComplete(stored)) {
    setSessionDriveIndex(args.identityId, stored!);
    return stored!;
  }
  const built = await ensureDeviceDriveLayout(
    args.accessToken,
    args.identityId,
    args.fetchImpl
  );
  setSessionDriveIndex(args.identityId, built);
  await args.persistIndex?.(built);
  return built;
}
