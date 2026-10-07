import type { Connection, ConnectionStatus } from './types.js';
import { normalizePnId } from './normalize.js';

const CONNECTIONS_TTL_MS = 5 * 60_000;

export interface ConnectionsClientDeps {
  waitForCloud: (userPnIdentifier: string) => Promise<boolean>;
  listConnectionRows: (userPnIdentifier: string) => Promise<Connection[]>;
  /** Optional hook when accepted rows are loaded (e.g. peer mailbox route cache). */
  onAcceptedRowsLoaded?: (rows: Connection[]) => void;
}

export interface ConnectionsClient {
  getConnections: (userPnIdentifier: string) => Promise<Connection[]>;
  resolveConnectionStatusFromCache: (
    userPnIdentifier: string,
    otherUserPnIdentifier: string
  ) => Promise<ConnectionStatus>;
  invalidateConnectionsCache: (pnIdentifier?: string) => void;
  prefetchConnectionsList: (userPnIdentifier: string) => Promise<Connection[]>;
}

export function createConnectionsClient(deps: ConnectionsClientDeps): ConnectionsClient {
  const connectionsInflight = new Map<string, Promise<Connection[]>>();
  const connectionsPrefetchInflight = new Map<string, Promise<Connection[]>>();
  let connectionsCache: { pn: string; at: number; value: Connection[] } | null = null;

  function invalidateConnectionsCache(pnIdentifier?: string): void {
    if (!pnIdentifier) {
      connectionsCache = null;
      connectionsInflight.clear();
      connectionsPrefetchInflight.clear();
      return;
    }
    const norm = normalizePnId(pnIdentifier);
    if (connectionsCache?.pn === norm) {
      connectionsCache = null;
    }
    connectionsInflight.delete(norm);
    connectionsPrefetchInflight.delete(norm);
  }

  async function getConnections(userPnIdentifier: string): Promise<Connection[]> {
    const norm = normalizePnId(userPnIdentifier);
    if (
      connectionsCache?.pn === norm &&
      Date.now() - connectionsCache.at < CONNECTIONS_TTL_MS
    ) {
      return connectionsCache.value;
    }
    const inflight = connectionsInflight.get(norm);
    if (inflight) return inflight;

    const work = (async (): Promise<Connection[]> => {
      try {
        const ready = await deps.waitForCloud(userPnIdentifier);
        if (!ready) return [];

        const rows = await deps.listConnectionRows(userPnIdentifier);
        const connections = rows.filter((row) => row.status === 'accepted') as Connection[];
        connectionsCache = { pn: norm, at: Date.now(), value: connections };
        deps.onAcceptedRowsLoaded?.(connections);
        return connections;
      } catch {
        return [];
      }
    })().finally(() => {
      connectionsInflight.delete(norm);
    });

    connectionsInflight.set(norm, work);
    return work;
  }

  async function resolveConnectionStatusFromCache(
    userPnIdentifier: string,
    otherUserPnIdentifier: string
  ): Promise<ConnectionStatus> {
    const connections = await getConnections(userPnIdentifier);
    const other = normalizePnId(otherUserPnIdentifier);
    for (const c of connections) {
      if (normalizePnId(c.userPnIdentifier) !== other) continue;
      if (c.status === 'accepted') {
        return { status: 'connected', connectionId: c.connectionId };
      }
      if (c.status === 'pending_sent') {
        return { status: 'pending_sent', connectionId: c.connectionId };
      }
      if (c.status === 'pending_received') {
        return { status: 'pending_received', connectionId: c.connectionId };
      }
      if (c.status === 'blocked') {
        return { status: 'blocked', connectionId: c.connectionId };
      }
    }
    return resolveConnectionStatusFromRows(userPnIdentifier, otherUserPnIdentifier, deps);
  }

  function prefetchConnectionsList(userPnIdentifier: string): Promise<Connection[]> {
    const norm = normalizePnId(userPnIdentifier);
    const existing = connectionsPrefetchInflight.get(norm);
    if (existing) return existing;

    const work = getConnections(userPnIdentifier).finally(() => {
      connectionsPrefetchInflight.delete(norm);
    });
    connectionsPrefetchInflight.set(norm, work);
    return work;
  }

  return {
    getConnections,
    resolveConnectionStatusFromCache,
    invalidateConnectionsCache,
    prefetchConnectionsList
  };
}

async function resolveConnectionStatusFromRows(
  userPnIdentifier: string,
  otherUserPnIdentifier: string,
  deps: ConnectionsClientDeps
): Promise<ConnectionStatus> {
  try {
    if (otherUserPnIdentifier.length > 200) {
      return { status: 'not_connected' };
    }
    const ready = await deps.waitForCloud(userPnIdentifier);
    if (!ready) return { status: 'not_connected' };

    const other = normalizePnId(otherUserPnIdentifier);
    const row = (await deps.listConnectionRows(userPnIdentifier)).find(
      (item) => normalizePnId(item.userPnIdentifier) === other
    );
    if (!row) return { status: 'not_connected' };
    if (row.status === 'accepted') return { status: 'connected', connectionId: row.connectionId };
    if (row.status === 'pending_sent') {
      return { status: 'pending_sent', connectionId: row.connectionId };
    }
    if (row.status === 'pending_received') {
      return { status: 'pending_received', connectionId: row.connectionId };
    }
    if (row.status === 'blocked') return { status: 'blocked', connectionId: row.connectionId };
    return { status: 'not_connected' };
  } catch {
    return { status: 'not_connected' };
  }
}
