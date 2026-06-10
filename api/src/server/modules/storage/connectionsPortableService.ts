import { METADATA_DIR } from '@par-noir/user-owned-storage';
import type { Connection, ConnectionsFile } from '../connectionsService';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableScan
} from './portableTableService';
import { CONNECTIONS_SCHEMA } from './tableSchemas';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';

const CONNECTIONS_META_REL = `${METADATA_DIR}/connections-meta.json`;

interface ConnectionsMeta {
  identifier: string;
  updatedAt: string;
  blocked: string[];
}

function normalizePn(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

export async function getConnectionsFilePortable(
  userPnIdentifier: string,
  accountId?: string
): Promise<ConnectionsFile | null> {
  const normalized = normalizePn(userPnIdentifier);
  const connections = await portableTableScan<Connection>(
    normalized,
    CONNECTIONS_SCHEMA,
    accountId
  );
  const meta = await readPortableJsonBlob<ConnectionsMeta>(
    normalized,
    CONNECTIONS_META_REL,
    accountId
  );
  if (connections.length === 0 && !meta) return null;
  return {
    identifier: meta?.identifier ?? normalized,
    updatedAt: meta?.updatedAt ?? new Date().toISOString(),
    connections,
    blocked: meta?.blocked ?? []
  };
}

export async function updateConnectionsFilePortable(
  userPnIdentifier: string,
  data: ConnectionsFile,
  accountId?: string
): Promise<void> {
  const normalized = normalizePn(userPnIdentifier);
  const { portableTableReplaceAll } = await import('./portableTableService');
  await portableTableReplaceAll(
    normalized,
    CONNECTIONS_SCHEMA,
    data.connections as unknown as Record<string, unknown>[],
    accountId,
    { updatedAt: data.updatedAt }
  );
  await writePortableJsonBlob(
    normalized,
    CONNECTIONS_META_REL,
    {
      identifier: data.identifier,
      updatedAt: data.updatedAt,
      blocked: data.blocked
    },
    accountId
  );
}

export async function removeConnectionByPeerPortable(
  userPnIdentifier: string,
  peerPnIdentifier: string,
  accountId?: string
): Promise<void> {
  const normalized = normalizePn(userPnIdentifier);
  const peer = normalizePn(peerPnIdentifier);
  const rows = await portableTableScan<Connection>(normalized, CONNECTIONS_SCHEMA, accountId);
  const existing = rows.find((c) => normalizePn(c.userPnIdentifier) === peer);
  if (existing) {
    await portableTableDelete(normalized, CONNECTIONS_SCHEMA, existing.connectionId, accountId);
  }
}

export async function appendConnectionPortable(
  userPnIdentifier: string,
  connection: Connection,
  accountId?: string
): Promise<void> {
  const normalized = normalizePn(userPnIdentifier);
  await portableTableAppend(
    normalized,
    CONNECTIONS_SCHEMA,
    connection as unknown as Record<string, unknown>,
    accountId
  );
}

export async function updateConnectionStatusPortable(
  userPnIdentifier: string,
  connectionId: string,
  status: Connection['status'],
  accountId?: string,
  acceptedAt?: string,
  kemCiphertext?: string
): Promise<void> {
  const normalized = normalizePn(userPnIdentifier);
  const rows = await portableTableScan<Connection>(normalized, CONNECTIONS_SCHEMA, accountId);
  const existing = rows.find((c) => c.connectionId === connectionId);
  if (!existing) {
    throw new Error('Connection not found');
  }
  await portableTableAppend(
    normalized,
    CONNECTIONS_SCHEMA,
    {
      ...existing,
      status,
      ...(acceptedAt ? { acceptedAt } : {}),
      ...(kemCiphertext ? { kemCiphertext } : {})
    } as unknown as Record<string, unknown>,
    accountId
  );
}

export async function listConnectionsPortable(
  userPnIdentifier: string,
  accountId?: string,
  filter?: { status?: Connection['status'] }
): Promise<Connection[]> {
  const file = await getConnectionsFilePortable(userPnIdentifier, accountId);
  if (!file) return [];
  if (!filter?.status) return file.connections;
  return file.connections.filter((c) => c.status === filter.status);
}
