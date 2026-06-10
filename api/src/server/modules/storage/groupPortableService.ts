import type { GroupMemberInput, GroupRecord } from '../groupSheetsService';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableGetByKey,
  portableTableScan
} from './portableTableService';
import { GROUPS_SCHEMA } from './tableSchemas';

export const PORTABLE_GROUPS_SHEET = 'pn-portable-groups';

function memberKey(groupId: string, memberPnIdentifier: string): string {
  return `${groupId}::${memberPnIdentifier}`;
}

function rowToRecord(row: Record<string, unknown>): GroupRecord {
  return row as unknown as GroupRecord;
}

export async function appendGroupMembersPortable(
  groupId: string,
  ownerPnIdentifier: string,
  title: string,
  createdAt: string,
  members: GroupMemberInput[],
  userPnIdentifier: string,
  accountId?: string
): Promise<void> {
  for (const m of members) {
    await portableTableAppend(
      userPnIdentifier,
      GROUPS_SCHEMA,
      {
        memberKey: memberKey(groupId, m.memberPnIdentifier),
        groupId,
        ownerPnIdentifier,
        title,
        createdAt,
        memberPnIdentifier: m.memberPnIdentifier,
        accessRole: m.accessRole,
        wrappedChatKey: m.wrappedChatKey,
        conversationSpreadsheetId: m.conversationSpreadsheetId
      },
      accountId
    );
  }
}

export async function listGroupsForUserPortable(
  userPnIdentifier: string,
  accountId?: string
): Promise<GroupRecord[]> {
  const rows = await portableTableScan<Record<string, unknown>>(userPnIdentifier, GROUPS_SCHEMA, accountId);
  return rows
    .map(rowToRecord)
    .filter((r) => r.memberPnIdentifier === userPnIdentifier || r.ownerPnIdentifier === userPnIdentifier);
}

export async function getMemberRowPortable(
  userPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  accountId?: string
): Promise<GroupRecord | null> {
  return portableTableGetByKey<GroupRecord>(
    userPnIdentifier,
    GROUPS_SCHEMA,
    memberKey(groupId, memberPnIdentifier),
    accountId
  );
}

export async function getGroupMembersPortable(
  userPnIdentifier: string,
  groupId: string,
  accountId?: string
): Promise<GroupMemberInput[]> {
  const rows = await listGroupsForUserPortable(userPnIdentifier, accountId);
  const byMember = new Map<string, GroupMemberInput>();
  for (const row of rows.filter((r) => r.groupId === groupId)) {
    byMember.set(row.memberPnIdentifier, {
      memberPnIdentifier: row.memberPnIdentifier,
      accessRole: row.accessRole,
      wrappedChatKey: row.wrappedChatKey,
      conversationSpreadsheetId: row.conversationSpreadsheetId
    });
  }
  return [...byMember.values()];
}

export async function updateMemberAccessRolePortable(
  userPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  accessRole: GroupRecord['accessRole'],
  accountId?: string
): Promise<boolean> {
  const existing = await getMemberRowPortable(userPnIdentifier, groupId, memberPnIdentifier, accountId);
  if (!existing) return false;
  await portableTableAppend(
    userPnIdentifier,
    GROUPS_SCHEMA,
    { ...existing, accessRole, memberKey: memberKey(groupId, memberPnIdentifier) } as unknown as Record<
      string,
      unknown
    >,
    accountId
  );
  return true;
}

export async function updateConversationSpreadsheetIdPortable(
  userPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  conversationSpreadsheetId: string,
  accountId?: string
): Promise<boolean> {
  const existing = await getMemberRowPortable(userPnIdentifier, groupId, memberPnIdentifier, accountId);
  if (!existing) return false;
  await portableTableAppend(
    userPnIdentifier,
    GROUPS_SCHEMA,
    {
      ...existing,
      conversationSpreadsheetId,
      memberKey: memberKey(groupId, memberPnIdentifier)
    } as unknown as Record<string, unknown>,
    accountId
  );
  return true;
}

export async function updateGroupTitlePortable(
  userPnIdentifier: string,
  groupId: string,
  title: string,
  accountId?: string
): Promise<void> {
  const rows = await portableTableScan<GroupRecord>(userPnIdentifier, GROUPS_SCHEMA, accountId);
  for (const row of rows.filter((r) => r.groupId === groupId)) {
    await portableTableAppend(
      userPnIdentifier,
      GROUPS_SCHEMA,
      {
        ...row,
        title,
        memberKey: memberKey(groupId, row.memberPnIdentifier)
      } as unknown as Record<string, unknown>,
      accountId
    );
  }
}

export async function removeGroupMemberPortable(
  userPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  accountId?: string
): Promise<boolean> {
  const existing = await getMemberRowPortable(userPnIdentifier, groupId, memberPnIdentifier, accountId);
  if (!existing) return false;
  await portableTableDelete(
    userPnIdentifier,
    GROUPS_SCHEMA,
    memberKey(groupId, memberPnIdentifier),
    accountId
  );
  return true;
}

export async function rotateGroupMemberKeysPortable(
  userPnIdentifier: string,
  groupId: string,
  removedMemberPn: string,
  keyRotation: Array<{
    memberPnIdentifier: string;
    wrappedChatKey: string;
    accessRole: GroupRecord['accessRole'];
  }>,
  accountId?: string
): Promise<boolean> {
  const rows = await portableTableScan<GroupRecord>(userPnIdentifier, GROUPS_SCHEMA, accountId);
  const groupRows = rows.filter((r) => r.groupId === groupId);
  if (!groupRows.some((r) => r.memberPnIdentifier === removedMemberPn)) return false;
  const template = groupRows[0];
  if (!template) return false;

  for (const row of groupRows) {
    await portableTableDelete(
      userPnIdentifier,
      GROUPS_SCHEMA,
      memberKey(groupId, row.memberPnIdentifier),
      accountId
    );
  }

  for (const m of keyRotation) {
    const existing = groupRows.find((r) => r.memberPnIdentifier === m.memberPnIdentifier);
    await portableTableAppend(
      userPnIdentifier,
      GROUPS_SCHEMA,
      {
        memberKey: memberKey(groupId, m.memberPnIdentifier),
        groupId,
        ownerPnIdentifier: template.ownerPnIdentifier,
        title: template.title,
        createdAt: template.createdAt,
        memberPnIdentifier: m.memberPnIdentifier,
        accessRole: m.accessRole,
        wrappedChatKey: m.wrappedChatKey,
        conversationSpreadsheetId: existing?.conversationSpreadsheetId
      },
      accountId
    );
  }
  return true;
}

export async function rewrapGroupKeysForMigrationPortable(
  userPnIdentifier: string,
  groupId: string,
  memberPnIdentifier: string,
  wrappedChatKey: string,
  accountId?: string
): Promise<void> {
  const existing = await getMemberRowPortable(userPnIdentifier, groupId, memberPnIdentifier, accountId);
  if (!existing) return;
  await portableTableAppend(
    userPnIdentifier,
    GROUPS_SCHEMA,
    {
      ...existing,
      wrappedChatKey,
      memberKey: memberKey(groupId, memberPnIdentifier)
    } as unknown as Record<string, unknown>,
    accountId
  );
}
