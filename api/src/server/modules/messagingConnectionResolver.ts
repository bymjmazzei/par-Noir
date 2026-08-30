/**
 * Index-aware DM connection resolution for messaging hot paths.
 * Inbox-first (peer + channel); falls back to one connections sheet read via pnDriveIndex.
 */

import type { OwnerDriveContext } from './ownerDriveContext';
import { PN_DRIVE_SHEET_KEYS } from './pnDriveIndex';
import { normalizeChannelClientId } from './messagingChannel';

export type DmConnectionStatus = 'connected' | 'not_connected' | 'blocked';

export interface ResolvedDmConnection {
  connectionId: string;
  kemCiphertext?: string;
  conversationSpreadsheetId?: string;
  wrappedMessageRootKey?: string;
  status: DmConnectionStatus;
  channelClientId: string;
}

function normalizePeer(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

/**
 * Resolve DM connection data for messaging: inbox row first (peer + channel), then indexed connections sheet.
 */
export async function resolveDmConnectionFromIndex(
  ctx: OwnerDriveContext,
  peerPnIdentifier: string,
  channelClientId?: string | null
): Promise<ResolvedDmConnection | null> {
  const peer = normalizePeer(peerPnIdentifier);
  const channel = normalizeChannelClientId(channelClientId);
  const { MessageSheetsService } = await import('./messageSheetsService');

  try {
    const inboxEntry = await MessageSheetsService.getInboxConversationByParticipant(
      ctx.token,
      ctx.index.inboxSheetId,
      peer,
      ctx.pnIdentifier,
      ctx.accountId,
      50,
      channel
    );

    if (inboxEntry?.connectionId) {
      return {
        connectionId: inboxEntry.connectionId,
        kemCiphertext: inboxEntry.kemCiphertext,
        conversationSpreadsheetId: inboxEntry.spreadsheetId,
        wrappedMessageRootKey: inboxEntry.wrappedMessageRootKey,
        status: 'connected',
        channelClientId: channel,
      };
    }
  } catch {
    /* fall through to connections sheet */
  }

  const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
  const connectionsSpreadsheetId = ctx.sheetId(PN_DRIVE_SHEET_KEYS.CONNECTIONS);
  const result = await ConnectionsSheetsService.getConnections(
    ctx.token,
    connectionsSpreadsheetId,
    ctx.pnIdentifier,
    ctx.accountId
  );

  const connection = result.connections.find((c) => {
    const rowPeer = normalizePeer(c.userPnIdentifier);
    return rowPeer === peer;
  });

  if (!connection) {
    return { connectionId: '', status: 'not_connected', channelClientId: channel };
  }

  if (connection.status === 'blocked') {
    return {
      connectionId: connection.connectionId,
      status: 'blocked',
      channelClientId: channel,
    };
  }

  if (connection.status !== 'accepted') {
    return {
      connectionId: connection.connectionId,
      status: 'not_connected',
      channelClientId: channel,
    };
  }

  // Peer accepted, but this channel's Inbox row may not exist yet.
  return {
    connectionId: connection.connectionId,
    kemCiphertext: connection.kemCiphertext,
    status: 'connected',
    channelClientId: channel,
  };
}

/** Map resolver result to connection status API shape (peer-level; channel-agnostic). */
export async function getConnectionStatusFromIndex(
  ctx: OwnerDriveContext,
  peerPnIdentifier: string
): Promise<{ status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked'; connectionId?: string }> {
  const peer = normalizePeer(peerPnIdentifier);
  const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
  const connectionsSpreadsheetId = ctx.sheetId(PN_DRIVE_SHEET_KEYS.CONNECTIONS);
  const result = await ConnectionsSheetsService.getConnections(
    ctx.token,
    connectionsSpreadsheetId,
    ctx.pnIdentifier,
    ctx.accountId
  );
  const connection = result.connections.find((c) => normalizePeer(c.userPnIdentifier) === peer);
  if (!connection) {
    return { status: 'not_connected' };
  }
  if (connection.status === 'blocked') {
    return { status: 'blocked', connectionId: connection.connectionId };
  }
  if (connection.status === 'accepted') {
    return { status: 'connected', connectionId: connection.connectionId };
  }
  if (connection.status === 'pending_sent' || connection.status === 'pending_received') {
    return { status: connection.status, connectionId: connection.connectionId };
  }
  return { status: 'not_connected', connectionId: connection.connectionId };
}
