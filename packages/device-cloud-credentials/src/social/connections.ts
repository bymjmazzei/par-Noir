import { CONNECTIONS_SCHEMA } from '@par-noir/user-owned-storage';
import { listDeviceConnections, upsertDeviceConnection, type DeviceConnection } from '../deviceSocial.js';
import type { DeviceSocialContext } from './socialContext.js';
import { socialReceipt } from './socialContext.js';

export interface DeviceConnectionStore {
  list(): Promise<DeviceConnection[]>;
  get(connectionId: string): Promise<DeviceConnection | undefined>;
  /** Insert or replace by connectionId; unspecified optional fields keep their stored values on tables. */
  upsert(row: DeviceConnection): Promise<void>;
  /** deviceCloudResult receipt for API routes that record this write. */
  receipt(extra?: Record<string, unknown>): Record<string, unknown>;
}

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function connectionFromTableRow(row: Record<string, unknown>): DeviceConnection | null {
  const connectionId = typeof row.connectionId === 'string' ? row.connectionId : '';
  const peer = typeof row.userPnIdentifier === 'string' ? row.userPnIdentifier : '';
  if (!connectionId || !peer) return null;
  const text = (key: string) => (typeof row[key] === 'string' && row[key] ? (row[key] as string) : undefined);
  return {
    connectionId,
    userPnIdentifier: normalizePn(peer),
    status: (text('status') || 'pending_sent') as DeviceConnection['status'],
    createdAt: text('createdAt') || new Date().toISOString(),
    acceptedAt: text('acceptedAt'),
    peerMlKemPublicKey: text('peerMlKemPublicKey'),
    kemCiphertext: text('kemCiphertext'),
    peerMailboxRouteKey: text('peerMailboxRouteKey'),
  };
}

function definedFields(row: DeviceConnection): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

/** Connections index: Google `Connections` sheet, or the connections table (server row shape). */
export function deviceConnections(ctx: DeviceSocialContext, fetchImpl?: typeof fetch): DeviceConnectionStore {
  if (ctx.kind === 'google_drive') {
    const sheetId = ctx.index.sheetIds.connections;
    const list = async () => (sheetId ? listDeviceConnections(ctx.accessToken, sheetId, fetchImpl) : []);
    return {
      list,
      get: async (connectionId) => (await list()).find((row) => row.connectionId === connectionId),
      upsert: async (row) => {
        if (sheetId) await upsertDeviceConnection(ctx.accessToken, sheetId, row, fetchImpl);
      },
      receipt: (extra) => socialReceipt(ctx, { spreadsheetId: sheetId, ...extra }),
    };
  }
  const table = () => ctx.tables.openTable(CONNECTIONS_SCHEMA);
  return {
    list: async () =>
      (await (await table()).scan())
        .map(connectionFromTableRow)
        .filter((row): row is DeviceConnection => !!row),
    get: async (connectionId) => {
      const row = await (await table()).getByKey(connectionId);
      return row ? connectionFromTableRow(row) ?? undefined : undefined;
    },
    upsert: async (row) => {
      const handle = await table();
      const existing = await handle.getByKey(row.connectionId);
      await handle.append({ ...(existing ?? {}), ...definedFields(row) });
    },
    receipt: (extra) => socialReceipt(ctx, extra),
  };
}
