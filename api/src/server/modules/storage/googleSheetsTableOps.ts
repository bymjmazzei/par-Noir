import {
  TABLE_PATHS,
  messagesPath,
  type TableRow,
  type TableSchema
} from '@par-noir/user-owned-storage';
import {
  indexEntryToRow,
  portableRowsToIndexEntries
} from '@par-noir/storage-migration';
import type { IndexFileEntry } from '../indexSheetsService';
import type { DriveTableContext } from './sheetsTableBridge';

const MAX_ROWS = 100_000;

function parseContentClassIndex(
  schema: TableSchema
): { contentClass: 'media' | 'thoughts' | 'collections'; indexType: 'public' | 'owner' } | null {
  const m = schema.path.match(/^_metadata\/(media|thoughts|collections)\/\1-(public|owner)-index$/);
  if (!m) return null;
  return { contentClass: m[1] as 'media' | 'thoughts' | 'collections', indexType: m[2] as 'public' | 'owner' };
}

export async function scanGoogleTableRows(
  ctx: DriveTableContext,
  schema: TableSchema
): Promise<TableRow[]> {
  const { token, metadataFolderId, pnIdentifier, accountId } = ctx;

  if (schema.path === TABLE_PATHS.thirdPartyPermissions) {
    const { ThirdPartyPermissionsSheetsService } = await import('../thirdPartyPermissionsSheetsService');
    const sheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
      token, metadataFolderId, pnIdentifier, accountId
    );
    const all = await ThirdPartyPermissionsSheetsService.getPermissions(token, sheetId, pnIdentifier, accountId);
    return Object.values(all) as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.notifications) {
    const { NotificationsSheetsService } = await import('../notificationsSheetsService');
    const sheetId = await NotificationsSheetsService.getNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId);
    const { notifications } = await NotificationsSheetsService.getNotifications(token, sheetId, pnIdentifier, accountId, { limit: MAX_ROWS, offset: 0 });
    return notifications as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.zkpDataPoints) {
    const { ZKPDataPointsSheetsService } = await import('../zkpDataPointsSheetsService');
    const sheetId = await ZKPDataPointsSheetsService.getZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId);
    const all = await ZKPDataPointsSheetsService.getZKPDataPoints(token, sheetId, pnIdentifier, accountId);
    return Object.values(all) as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.devices) {
    const { DeviceSheetsService } = await import('../deviceSheetsService');
    const sheetId = await DeviceSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId);
    const devices = await DeviceSheetsService.listDevices(token, sheetId, pnIdentifier, accountId);
    return devices as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.groups) {
    const { GroupSheetsService } = await import('../groupSheetsService');
    const sheetId = await GroupSheetsService.getOrCreateGroupsSheet(token, metadataFolderId, pnIdentifier, accountId);
    const records = await GroupSheetsService.listAllGroupRows(token, sheetId, pnIdentifier, accountId);
    return records.map((r) => ({
      memberKey: `${r.groupId}::${r.memberPnIdentifier}`,
      ...r
    })) as TableRow[];
  }

  if (schema.path === TABLE_PATHS.followers) {
    const { ConnectionsSheetsService } = await import('../connectionsSheetsService');
    const sheetId = await ConnectionsSheetsService.getFollowersSheet(token, metadataFolderId, pnIdentifier, accountId);
    const { followers } = await ConnectionsSheetsService.getFollowers(token, sheetId, pnIdentifier, accountId, { limit: MAX_ROWS, offset: 0 });
    return followers as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.following) {
    const { ConnectionsSheetsService } = await import('../connectionsSheetsService');
    const sheetId = await ConnectionsSheetsService.getFollowingSheet(token, metadataFolderId, pnIdentifier, accountId);
    const { following } = await ConnectionsSheetsService.getFollowing(token, sheetId, pnIdentifier, accountId, { limit: MAX_ROWS, offset: 0 });
    return following as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.activityLedger) {
    const { ActivityLedgerSheetsService } = await import('../activityLedgerSheetsService');
    const sheetId = await ActivityLedgerSheetsService.getActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId);
    const { activities } = await ActivityLedgerSheetsService.getActivities(token, sheetId, pnIdentifier, accountId, { limit: MAX_ROWS, offset: 0 });
    return activities as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.messagingLedger) {
    const { MessagingLedgerSheetsService } = await import('../messagingLedgerSheetsService');
    const sheetId = await MessagingLedgerSheetsService.getMessagingLedgerSheet(token, metadataFolderId, pnIdentifier, accountId);
    const { activities } = await MessagingLedgerSheetsService.getActivities(token, sheetId, pnIdentifier, accountId, { limit: MAX_ROWS, offset: 0 });
    return activities as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.messageRequests) {
    const { MessageRequestSheetsService } = await import('../messageRequestSheetsService');
    const sheetId = await MessageRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId);
    const requests = await MessageRequestSheetsService.listRequests(token, sheetId, pnIdentifier, accountId);
    return requests as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.dataPointRequests) {
    const { DataPointRequestSheetsService } = await import('../dataPointRequestSheetsService');
    const sheetId = await DataPointRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId);
    const requests = await DataPointRequestSheetsService.listRequests(token, sheetId, pnIdentifier, accountId);
    return requests as unknown as TableRow[];
  }

  if (schema.path === TABLE_PATHS.prismLedger) {
    const { PrismLedgerSheetsService } = await import('../prismLedgerSheetsService');
    const sheetId = await PrismLedgerSheetsService.getPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId);
    const { entries } = await PrismLedgerSheetsService.getActivities(token, sheetId, pnIdentifier, accountId, { limit: MAX_ROWS, offset: 0 });
    return entries as unknown as TableRow[];
  }

  if (schema.path === messagesPath('inbox')) {
    const { MessageSheetsService } = await import('../messageSheetsService');
    const inboxId = await MessageSheetsService.getInboxSheet(token, metadataFolderId, pnIdentifier, accountId);
    const entries = await MessageSheetsService.getInboxEntries(token, inboxId, pnIdentifier, accountId);
    return entries.map((e) => ({
      participantPnIdentifier: e.participantPnIdentifier,
      spreadsheetId: e.spreadsheetId,
      connectionId: e.connectionId,
      lastMessageAt: e.lastMessageAt,
      lastMessagePreview: e.lastMessagePreview,
      kemCiphertext: e.kemCiphertext,
      threadType: e.threadType,
      groupId: e.groupId,
      ownerPnIdentifier: e.ownerPnIdentifier,
      groupTitle: e.groupTitle
    })) as TableRow[];
  }

  const ccIndex = parseContentClassIndex(schema);
  if (ccIndex || schema.path === TABLE_PATHS.publicFileIndex || schema.path === TABLE_PATHS.ownerFileIndex) {
    const { IndexSheetsService } = await import('../indexSheetsService');
    const indexType = ccIndex?.indexType ?? (schema.path === TABLE_PATHS.publicFileIndex ? 'public' : 'owner');
    const contentClass = ccIndex?.contentClass;
    const sheetId = await IndexSheetsService.getIndexSheet(
      token, metadataFolderId, indexType, pnIdentifier, accountId, contentClass
    );
    const { files } = await IndexSheetsService.getFiles(token, sheetId, pnIdentifier, accountId, { limit: MAX_ROWS, offset: 0 });
    return files.map((f) => indexEntryToRow(f as IndexFileEntry)) as TableRow[];
  }

  throw new Error(`Google scan not implemented for ${schema.id}`);
}

export async function replaceAllGoogleTableRows(
  ctx: DriveTableContext,
  schema: TableSchema,
  rows: TableRow[],
  meta?: { updatedAt?: string }
): Promise<void> {
  const { token, metadataFolderId, pnIdentifier, accountId } = ctx;

  if (schema.path === TABLE_PATHS.thirdPartyPermissions) {
    const { ThirdPartyPermissionsSheetsService } = await import('../thirdPartyPermissionsSheetsService');
    const sheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
      token, metadataFolderId, pnIdentifier, accountId
    );
    await ThirdPartyPermissionsSheetsService.setAllPermissions(
      token,
      sheetId,
      rows as unknown as Parameters<typeof ThirdPartyPermissionsSheetsService.setAllPermissions>[2],
      pnIdentifier,
      accountId
    );
    return;
  }

  if (schema.path === TABLE_PATHS.notifications) {
    const { NotificationsSheetsService } = await import('../notificationsSheetsService');
    const sheetId = await NotificationsSheetsService.getNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId);
    await NotificationsSheetsService.setAllNotifications(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.zkpDataPoints) {
    const { ZKPDataPointsSheetsService } = await import('../zkpDataPointsSheetsService');
    const sheetId = await ZKPDataPointsSheetsService.getZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId);
    await ZKPDataPointsSheetsService.setAllZKPDataPoints(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.devices) {
    const { DeviceSheetsService } = await import('../deviceSheetsService');
    const sheetId = await DeviceSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId);
    await DeviceSheetsService.setAllDevices(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.groups) {
    const { GroupSheetsService } = await import('../groupSheetsService');
    const sheetId = await GroupSheetsService.getOrCreateGroupsSheet(token, metadataFolderId, pnIdentifier, accountId);
    await GroupSheetsService.setAllMembers(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.followers) {
    const { ConnectionsSheetsService } = await import('../connectionsSheetsService');
    const sheetId = await ConnectionsSheetsService.getFollowersSheet(token, metadataFolderId, pnIdentifier, accountId);
    await ConnectionsSheetsService.setAllFollowers(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.following) {
    const { ConnectionsSheetsService } = await import('../connectionsSheetsService');
    const sheetId = await ConnectionsSheetsService.getFollowingSheet(token, metadataFolderId, pnIdentifier, accountId);
    await ConnectionsSheetsService.setAllFollowing(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.activityLedger) {
    const { ActivityLedgerSheetsService } = await import('../activityLedgerSheetsService');
    const sheetId = await ActivityLedgerSheetsService.getActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId);
    await ActivityLedgerSheetsService.setAllActivities(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.messagingLedger) {
    const { MessagingLedgerSheetsService } = await import('../messagingLedgerSheetsService');
    const sheetId = await MessagingLedgerSheetsService.getMessagingLedgerSheet(token, metadataFolderId, pnIdentifier, accountId);
    await MessagingLedgerSheetsService.setAllActivities(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.messageRequests) {
    const { MessageRequestSheetsService } = await import('../messageRequestSheetsService');
    const sheetId = await MessageRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId);
    await MessageRequestSheetsService.setAllRequests(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.dataPointRequests) {
    const { DataPointRequestSheetsService } = await import('../dataPointRequestSheetsService');
    const sheetId = await DataPointRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId);
    await DataPointRequestSheetsService.setAllRequests(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === TABLE_PATHS.prismLedger) {
    const { PrismLedgerSheetsService } = await import('../prismLedgerSheetsService');
    const sheetId = await PrismLedgerSheetsService.getPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId);
    await PrismLedgerSheetsService.setAllEntries(token, sheetId, rows as never[], pnIdentifier, accountId);
    return;
  }

  if (schema.path === messagesPath('inbox')) {
    const { MessageSheetsService } = await import('../messageSheetsService');
    const inboxId = await MessageSheetsService.getOrCreateInboxSheet(token, metadataFolderId, pnIdentifier, accountId);
    await MessageSheetsService.setAllInboxEntries(token, inboxId, rows as never[], pnIdentifier, accountId);
    return;
  }

  const ccIndex = parseContentClassIndex(schema);
  if (ccIndex || schema.path === TABLE_PATHS.publicFileIndex || schema.path === TABLE_PATHS.ownerFileIndex) {
    const { IndexSheetsService } = await import('../indexSheetsService');
    const indexType = ccIndex?.indexType ?? (schema.path === TABLE_PATHS.publicFileIndex ? 'public' : 'owner');
    const contentClass = ccIndex?.contentClass;
    const sheetId = await IndexSheetsService.getIndexSheet(
      token, metadataFolderId, indexType, pnIdentifier, accountId, contentClass
    );
    const entries = portableRowsToIndexEntries(rows as Record<string, unknown>[]) as IndexFileEntry[];
    await IndexSheetsService.setAllFiles(token, sheetId, entries, pnIdentifier, accountId, meta?.updatedAt);
    return;
  }

  throw new Error(`Google replaceAll not implemented for ${schema.id}`);
}
