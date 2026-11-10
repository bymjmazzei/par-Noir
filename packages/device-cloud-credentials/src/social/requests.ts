import { MESSAGE_REQUESTS_SCHEMA } from '@par-noir/user-owned-storage';
import { appendSheetValues, readSheetValues, writeSheetValues } from '../deviceSheet.js';
import { listDeviceMessageRequests, type DeviceMessageRequest } from '../deviceProduct.js';
import type { DeviceSocialContext } from './socialContext.js';

export interface DeviceMessageRequestStore {
  list(): Promise<DeviceMessageRequest[]>;
  append(request: DeviceMessageRequest): Promise<void>;
  setStatus(requestId: string, status: string): Promise<void>;
}

function requestFromTable(row: Record<string, unknown>): DeviceMessageRequest {
  return {
    requestId: String(row.requestId ?? ''),
    fromPnIdentifier: String(row.fromPnIdentifier ?? ''),
    toPnIdentifier: String(row.toPnIdentifier ?? ''),
    content: String(row.content ?? ''),
    status: String(row.status ?? 'pending'),
    timestamp: String(row.timestamp ?? ''),
    kemCiphertext: row.kemCiphertext ? String(row.kemCiphertext) : undefined,
    cryptoVersion: row.cryptoVersion !== undefined && row.cryptoVersion !== '' ? Number(row.cryptoVersion) : undefined,
  };
}

export function deviceMessageRequests(ctx: DeviceSocialContext, fetchImpl?: typeof fetch): DeviceMessageRequestStore {
  if (ctx.kind === 'google_drive') {
    const token = ctx.accessToken;
    const sheetId = ctx.index.sheetIds.message_requests;
    const requireSheet = () => {
      if (!sheetId) throw new Error('Message requests are not ready. Reconnect cloud storage.');
      return sheetId;
    };
    return {
      list: async () => (sheetId ? listDeviceMessageRequests(token, sheetId, fetchImpl) : []),
      append: async (r) => {
        await appendSheetValues(
          token,
          requireSheet(),
          'Requests!A:H',
          [[
            r.requestId,
            r.fromPnIdentifier,
            r.toPnIdentifier,
            r.content,
            r.status,
            r.timestamp,
            r.kemCiphertext || '',
            r.cryptoVersion !== undefined ? String(r.cryptoVersion) : '',
          ]],
          fetchImpl
        );
      },
      setStatus: async (requestId, status) => {
        const id = requireSheet();
        const rows = await readSheetValues(token, id, 'Requests!A2:H', fetchImpl);
        const index = rows.findIndex((row) => row[0] === requestId);
        if (index === -1) return;
        await writeSheetValues(token, id, `Requests!E${index + 2}`, [[status]], fetchImpl);
      },
    };
  }
  const table = () => ctx.tables.openTable(MESSAGE_REQUESTS_SCHEMA);
  return {
    list: async () => ((await (await table()).scan()) as Record<string, unknown>[]).map(requestFromTable),
    append: async (r) => {
      await (await table()).append({ ...r });
    },
    setStatus: async (requestId, status) => {
      const handle = await table();
      const existing = await handle.getByKey(requestId);
      if (!existing) return;
      await handle.append({ ...existing, status });
    },
  };
}
