/**
 * Index-aware DM connection resolution for messaging hot paths.
 * Inbox-first; falls back to one connections sheet read via pnDriveIndex (no Drive discovery).
 */

import type { OwnerDriveContext } from './ownerDriveContext';
import { PN_DRIVE_SHEET_KEYS } from './pnDriveIndex';

export type DmConnectionStatus = 'connected' | 'not_connected' | 'blocked';

export interface ResolvedDmConnection {
  connectionId: string;
  kemCiphertext?: string;
  conversationSpreadsheetId?: string;
  wrappedMessageRootKey?: string;
  status: DmConnectionStatus;
}

function normalizePeer(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

/**
 * Resolve DM connection data for messaging: inbox row first, then indexed connections sheet.
 */
export async function resolveDmConnectionFromIndex(
  ctx: OwnerDriveContext,
  peerPnIdentifier: string
): Promise<ResolvedDmConnection | null> {
  const peer = normalizePeer(peerPnIdentifier);
  const { MessageSheetsService } = await import('./messageSheetsService');

  try {
    const inboxEntry = await MessageSheetsService.getInboxConversationByParticipant(
      ctx.token,
      ctx.index.inboxSheetId,
      peer,
      ctx.pnIdentifier,
      ctx.accountId,
      50
    );

    if (inboxEntry?.connectionId) {
      return {
        connectionId: inboxEntry.connectionId,
        kemCiphertext: inboxEntry.kemCiphertext,
        conversationSpreadsheetId: inboxEntry.spreadsheetId,
        wrappedMessageRootKey: inboxEntry.wrappedMessageRootKey,
        status: 'connected',
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
    return { connectionId: '', status: 'not_connected' };
  }

  if (connection.status === 'blocked') {
    return {
      connectionId: connection.connectionId,
      status: 'blocked',
    };
  }

  if (connection.status !== 'accepted') {
    return { connectionId: connection.connectionId, status: 'not_connected' };
  }

  return {
    connectionId: connection.connectionId,
    kemCiphertext: connection.kemCiphertext,
    status: 'connected',
  };
}

/** Map resolver result to connection status API shape. */
export async function getConnectionStatusFromIndex(
  ctx: OwnerDriveContext,
  peerPnIdentifier: string
): Promise<{ status: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked'; connectionId?: string }> {
  const resolved = await resolveDmConnectionFromIndex(ctx, peerPnIdentifier);
  if (!resolved || resolved.status === 'not_connected') {
    return { status: 'not_connected' };
  }
  if (resolved.status === 'blocked') {
    return { status: 'blocked', connectionId: resolved.connectionId || undefined };
  }
  return { status: 'connected', connectionId: resolved.connectionId };
}
