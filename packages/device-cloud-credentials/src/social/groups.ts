import { GROUPS_SCHEMA } from '@par-noir/user-owned-storage';
import { readSheetValues, writeSheetValues } from '../deviceSheet.js';
import { appendDeviceGroupRow, listDeviceGroups, type DeviceGroupRow } from '../deviceSocial.js';
import type { DeviceSocialContext } from './socialContext.js';

export type GroupKeyRotation = Array<{ memberPnIdentifier: string; wrappedChatKey: string; accessRole: string }>;

export interface DeviceGroupStore {
  list(): Promise<DeviceGroupRow[]>;
  /** Add one member row; tables replace an existing row for the same member. */
  append(row: DeviceGroupRow): Promise<void>;
  /** Replace a group's member rows with re-wrapped keys under a successor owner. */
  rewrap(groupId: string, successorOwnerPnIdentifier: string, rotation: GroupKeyRotation): Promise<boolean>;
}

const memberKey = (groupId: string, memberPnIdentifier: string) => `${groupId}::${memberPnIdentifier}`;

function groupRowFromTable(row: Record<string, unknown>): DeviceGroupRow {
  return {
    groupId: String(row.groupId ?? ''),
    ownerPnIdentifier: String(row.ownerPnIdentifier ?? ''),
    title: String(row.title ?? ''),
    createdAt: String(row.createdAt ?? ''),
    memberPnIdentifier: String(row.memberPnIdentifier ?? ''),
    accessRole: String(row.accessRole ?? 'readWrite'),
    wrappedChatKey: String(row.wrappedChatKey ?? ''),
    conversationSpreadsheetId: row.conversationSpreadsheetId ? String(row.conversationSpreadsheetId) : undefined,
  };
}

export function deviceGroups(ctx: DeviceSocialContext, fetchImpl?: typeof fetch): DeviceGroupStore {
  if (ctx.kind === 'google_drive') {
    const token = ctx.accessToken;
    const sheetId = ctx.index.sheetIds.groups;
    const requireSheet = () => {
      if (!sheetId) throw new Error('Groups are not ready. Reconnect cloud storage.');
      return sheetId;
    };
    return {
      list: async () => (sheetId ? listDeviceGroups(token, sheetId, fetchImpl) : []),
      append: (row) => appendDeviceGroupRow(token, requireSheet(), row, fetchImpl),
      rewrap: async (groupId, successor, rotation) => {
        const id = requireSheet();
        const rows = await readSheetValues(token, id, 'Groups!A2:H', fetchImpl);
        const groupRows = rows.filter((r) => r[0] === groupId);
        const template = groupRows[0];
        if (!template) return false;
        const rotated = rotation.map((m) => [
          groupId,
          successor,
          template[2] || '',
          template[3] || '',
          m.memberPnIdentifier,
          m.accessRole,
          m.wrappedChatKey,
          groupRows.find((r) => r[4] === m.memberPnIdentifier)?.[7] || '',
        ]);
        const kept = [...rows.filter((r) => r[0] !== groupId), ...rotated];
        const blank = Array.from({ length: Math.max(0, rows.length - kept.length) }, () => Array(8).fill(''));
        await writeSheetValues(token, id, 'Groups!A2:H', [...kept, ...blank], fetchImpl);
        return true;
      },
    };
  }
  const table = () => ctx.tables.openTable(GROUPS_SCHEMA);
  return {
    list: async () => ((await (await table()).scan()) as Record<string, unknown>[]).map(groupRowFromTable),
    append: async (row) => {
      await (await table()).append({ ...row, memberKey: memberKey(row.groupId, row.memberPnIdentifier) });
    },
    rewrap: async (groupId, successor, rotation) => {
      const handle = await table();
      const groupRows = ((await handle.scan()) as Record<string, unknown>[])
        .map(groupRowFromTable)
        .filter((r) => r.groupId === groupId);
      const template = groupRows[0];
      if (!template) return false;
      for (const row of groupRows) {
        if (!rotation.some((m) => m.memberPnIdentifier === row.memberPnIdentifier)) {
          await handle.delete(memberKey(groupId, row.memberPnIdentifier));
        }
      }
      for (const m of rotation) {
        const existing = groupRows.find((r) => r.memberPnIdentifier === m.memberPnIdentifier);
        await handle.append({
          ...template,
          ownerPnIdentifier: successor,
          memberPnIdentifier: m.memberPnIdentifier,
          accessRole: m.accessRole,
          wrappedChatKey: m.wrappedChatKey,
          conversationSpreadsheetId: existing?.conversationSpreadsheetId,
          memberKey: memberKey(groupId, m.memberPnIdentifier),
        });
      }
      return true;
    },
  };
}
