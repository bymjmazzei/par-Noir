import {
  CONTENT_CLASSES,
  INTEGRATORS_DIR,
  METADATA_DIR,
  MESSAGES_DIR,
  companionMetadataPath,
  messagesPath,
  metadataPath,
  readCachedLayout,
  type ContentClass
} from '@par-noir/user-owned-storage';
import {
  createEmptyMigrationReport,
  finalizeMigrationReport,
  recordMigrationOutcome,
  type MigrationReport
} from '@par-noir/storage-migration';
import type { DriveTableContext } from './sheetsTableBridge';
import { updateConnectionsFilePortable, getConnectionsFilePortable } from './connectionsPortableService';
import {
  portableTableReplaceAll,
  portableTableScan
} from './portableTableService';
import {
  CONNECTIONS_SCHEMA,
  RECOVERY_CUSTODIANS_SCHEMA,
  RECOVERY_PENDING_SCHEMA,
  RECOVERY_REQUESTS_SCHEMA,
  PREFERENCES_INTERACTIONS_SCHEMA
} from './tableSchemas';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';
import { saveEngagementPortable, getEngagementPortable } from './engagementPortableService';
import type { UserEngagement } from './engagementPortableService';

export async function migrateConnectionsGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  try {
    const { ConnectionsSheetsService } = await import('../connectionsSheetsService');
    const data = await ConnectionsSheetsService.getConnectionsFile(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    if (!data) {
      return finalizeMigrationReport(recordMigrationOutcome(report, TABLE_PATHS_connections(), 'skipped'));
    }
    await updateConnectionsFilePortable(pnIdentifier, data, accountId);
    report = recordMigrationOutcome(report, TABLE_PATHS_connections(), 'migrated', {
      bytes: data.connections.length
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, TABLE_PATHS_connections(), 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

function TABLE_PATHS_connections(): string {
  return '_metadata/connections';
}

export async function migrateConnectionsPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  try {
    const data = await getConnectionsFilePortable(pnIdentifier, accountId);
    if (!data) {
      return finalizeMigrationReport(recordMigrationOutcome(report, TABLE_PATHS_connections(), 'skipped'));
    }
    const { ConnectionsSheetsService } = await import('../connectionsSheetsService');
    const sheetId = await ConnectionsSheetsService.getConnectionsSheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    await ConnectionsSheetsService.setAllConnections(
      ctx.token,
      sheetId,
      data.connections,
      pnIdentifier,
      ctx.accountId
    );
    await ConnectionsSheetsService.setBlocked(
      ctx.token,
      sheetId,
      data.blocked,
      pnIdentifier,
      ctx.accountId
    );
    await ConnectionsSheetsService.setMetadata(
      ctx.token,
      sheetId,
      data.identifier,
      data.updatedAt,
      pnIdentifier,
      ctx.accountId
    );
    report = recordMigrationOutcome(report, TABLE_PATHS_connections(), 'migrated', {
      bytes: data.connections.length
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, TABLE_PATHS_connections(), 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateRecoveryGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = '_metadata/recovery';
  try {
    const { RecoverySheetsService } = await import('../recoverySheetsService');
    const sheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    const custodians = await RecoverySheetsService.listCustodians(
      ctx.token,
      sheetId,
      pnIdentifier,
      ctx.accountId
    );
    const pending = await RecoverySheetsService.listPendingShares(
      ctx.token,
      sheetId,
      pnIdentifier,
      ctx.accountId,
      true
    );
    const requests = await RecoverySheetsService.listRecoveryRequests(
      ctx.token,
      sheetId,
      pnIdentifier,
      ctx.accountId
    );
    await portableTableReplaceAll(
      pnIdentifier,
      RECOVERY_CUSTODIANS_SCHEMA,
      custodians as unknown as Record<string, unknown>[],
      accountId
    );
    await portableTableReplaceAll(
      pnIdentifier,
      RECOVERY_PENDING_SCHEMA,
      pending.map((p) => ({
        shareIndex: String(p.shareIndex),
        encryptedShare: p.encryptedShare,
        createdAt: p.createdAt
      })),
      accountId
    );
    await portableTableReplaceAll(
      pnIdentifier,
      RECOVERY_REQUESTS_SCHEMA,
      requests as unknown as Record<string, unknown>[],
      accountId
    );
    report = recordMigrationOutcome(report, path, 'migrated', {
      bytes: custodians.length + pending.length + requests.length
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateRecoveryPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = '_metadata/recovery';
  try {
    const custodians = await portableTableScan(pnIdentifier, RECOVERY_CUSTODIANS_SCHEMA, accountId);
    const pending = await portableTableScan(pnIdentifier, RECOVERY_PENDING_SCHEMA, accountId);
    const requests = await portableTableScan(pnIdentifier, RECOVERY_REQUESTS_SCHEMA, accountId);
    const { RecoverySheetsService } = await import('../recoverySheetsService');
    const sheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    await RecoverySheetsService.setAllRecoveryData(
      ctx.token,
      sheetId,
      {
        custodians: custodians as never[],
        pending: pending.map((p) => ({
          shareIndex: parseInt(String(p.shareIndex), 10),
          encryptedShare: String(p.encryptedShare ?? ''),
          createdAt: String(p.createdAt ?? '')
        })),
        requests: requests as never[]
      },
      pnIdentifier,
      ctx.accountId
    );
    report = recordMigrationOutcome(report, path, 'migrated', { bytes: custodians.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migratePreferencesGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = '_metadata/preferences';
  try {
    const { PreferencesSheetsService } = await import('../preferencesSheetsService');
    const sheetId = await PreferencesSheetsService.getPreferencesSheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    const { interactions } = await PreferencesSheetsService.getPreferenceInteractions(
      ctx.token,
      sheetId,
      pnIdentifier,
      ctx.accountId,
      { limit: 100_000, offset: 0 }
    );
    const current = await PreferencesSheetsService.getCurrentPreferences(
      ctx.token,
      sheetId,
      pnIdentifier,
      ctx.accountId
    );
    await portableTableReplaceAll(
      pnIdentifier,
      PREFERENCES_INTERACTIONS_SCHEMA,
      interactions as unknown as Record<string, unknown>[],
      accountId
    );
    if (current) {
      await writePortableJsonBlob(pnIdentifier, metadataPath('preferences.json'), current, accountId);
    }
    report = recordMigrationOutcome(report, path, 'migrated', { bytes: interactions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migratePreferencesPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = '_metadata/preferences';
  try {
    const interactions = await portableTableScan(pnIdentifier, PREFERENCES_INTERACTIONS_SCHEMA, accountId);
    const current = await readPortableJsonBlob(pnIdentifier, metadataPath('preferences.json'), accountId);
    const { PreferencesSheetsService } = await import('../preferencesSheetsService');
    const sheetId = await PreferencesSheetsService.getPreferencesSheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    await PreferencesSheetsService.setAllPreferenceInteractions(
      ctx.token,
      sheetId,
      interactions as never[],
      pnIdentifier,
      ctx.accountId
    );
    if (current) {
      await PreferencesSheetsService.updateCurrentPreferences(
        ctx.token,
        sheetId,
        current as never,
        pnIdentifier,
        ctx.accountId
      );
    }
    report = recordMigrationOutcome(report, path, 'migrated', { bytes: interactions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateEngagementGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = `${METADATA_DIR}/engagement.json`;
  try {
    const { EngagementSheetsService } = await import('../engagementSheetsService');
    const sheetId = await EngagementSheetsService.getEngagementSheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    const likes = await EngagementSheetsService.getLikes(ctx.token, sheetId, pnIdentifier, ctx.accountId);
    const dislikes = await EngagementSheetsService.getDislikes(ctx.token, sheetId, pnIdentifier, ctx.accountId);
    const comments = await EngagementSheetsService.getComments(ctx.token, sheetId, pnIdentifier, ctx.accountId);
    const shares = await EngagementSheetsService.getShares(ctx.token, sheetId, pnIdentifier, ctx.accountId);
    const saves = await EngagementSheetsService.getSaves(ctx.token, sheetId, pnIdentifier, ctx.accountId);
    const engagement: UserEngagement = {
      userPnIdentifier: pnIdentifier,
      updatedAt: new Date().toISOString(),
      likes,
      dislikes,
      comments,
      shares,
      saves
    };
    await saveEngagementPortable(pnIdentifier, engagement, accountId);
    report = recordMigrationOutcome(report, path, 'migrated', { bytes: likes.length + comments.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateEngagementPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = `${METADATA_DIR}/engagement.json`;
  try {
    const engagement = await getEngagementPortable(pnIdentifier, accountId);
    if (!engagement) {
      return finalizeMigrationReport(recordMigrationOutcome(report, path, 'skipped'));
    }
    const { EngagementSheetsService } = await import('../engagementSheetsService');
    const sheetId = await EngagementSheetsService.getEngagementSheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    await EngagementSheetsService.setAllEngagement(
      ctx.token,
      sheetId,
      engagement,
      pnIdentifier,
      ctx.accountId
    );
    report = recordMigrationOutcome(report, path, 'migrated', { bytes: engagement.likes.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateMessagingGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = messagesPath('conversations');
  try {
    const { MessageSheetsService } = await import('../messageSheetsService');
    const inboxId = await MessageSheetsService.getInboxSheet(
      ctx.token,
      ctx.metadataFolderId,
      pnIdentifier,
      ctx.accountId
    );
    const entries = await MessageSheetsService.getInboxEntries(
      ctx.token,
      inboxId,
      pnIdentifier,
      ctx.accountId
    );
    let count = 0;
    for (const entry of entries) {
      if (!entry.spreadsheetId) continue;
      const { messages } = await MessageSheetsService.getMessages(
        ctx.token,
        entry.spreadsheetId,
        entry.connectionId ?? '',
        '',
        pnIdentifier,
        ctx.accountId,
        { limit: 100_000, offset: 0, relayOnly: true }
      );
      const sheetId = entry.threadType === 'group'
        ? `group-${entry.participantPnIdentifier}`
        : entry.participantPnIdentifier;
      const internal = await import('./messagePortableService');
      const key = entry.threadType === 'group'
        ? internal.portableGroupConversationSheetId(entry.participantPnIdentifier)
        : internal.portableConversationSheetId(entry.participantPnIdentifier);
      await internal.writeConversationLines(pnIdentifier, key, messages, accountId);
      count += messages.length;
    }
    report = recordMigrationOutcome(report, path, 'migrated', { bytes: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateMessagingPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = messagesPath('conversations');
  try {
    const { storageCredentialsService } = await import('../storageCredentialsService');
    const record = await storageCredentialsService.getCredentials(pnIdentifier);
    const credentials = record?.credentials;
    const layout = credentials ? readCachedLayout(credentials) : {};
    const pnFolderId = layout.nodeIds?.pnFolderId;
    if (!pnFolderId) throw new Error('Google Drive pN folder not initialized');

    const { resolveSocialCloudContext } = await import('./storageFacade');
    const portableCtx = await resolveSocialCloudContext(pnIdentifier, accountId);
    if (!portableCtx.blobStore) throw new Error('Portable blob store unavailable');
    const prefix = `${portableCtx.rootPrefix}${MESSAGES_DIR}/`;
    const entries = await portableCtx.blobStore.list(prefix);
    const { MessageSheetsService } = await import('../messageSheetsService');
    const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
      ctx.token,
      pnFolderId,
      pnIdentifier,
      ctx.accountId
    );
    const internal = await import('./messagePortableService');
    let count = 0;
    for (const entry of entries) {
      if (!entry.key.endsWith('.jsonl')) continue;
      const baseName = entry.key.split('/').pop()?.replace('.jsonl', '') ?? '';
      let sheetId: string;
      let portableSheetId: string;
      if (baseName.startsWith('group-')) {
        const groupId = baseName.slice('group-'.length);
        portableSheetId = internal.portableGroupConversationSheetId(groupId);
        sheetId = await MessageSheetsService.getOrCreateGroupConversationSheet(
          ctx.token,
          messagesFolderId,
          groupId,
          pnIdentifier,
          ctx.accountId
        );
      } else if (baseName.startsWith('conversation-')) {
        const otherPn = baseName.slice('conversation-'.length);
        portableSheetId = internal.portableConversationSheetId(otherPn);
        sheetId = await MessageSheetsService.createConversationSheet(
          ctx.token,
          messagesFolderId,
          otherPn,
          pnIdentifier,
          ctx.accountId
        );
      } else {
        continue;
      }
      const { messages } = await internal.getMessagesPortable(
        pnIdentifier,
        portableSheetId,
        accountId,
        { limit: 100_000, offset: 0 }
      );
      await MessageSheetsService.setAllConversationMessages(
        ctx.token,
        sheetId,
        messages,
        pnIdentifier,
        ctx.accountId
      );
      count += messages.length;
    }
    report = recordMigrationOutcome(report, path, 'migrated', { bytes: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

const CONTENT_CLASS_FOLDERS = new Set<string>(CONTENT_CLASSES);

async function listGoogleChildFolders(
  drive: ReturnType<typeof import('googleapis').google.drive>,
  parentId: string
): Promise<Array<{ id: string; name: string }>> {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 200 });
  return (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
}

async function listGoogleSpreadsheets(
  drive: ReturnType<typeof import('googleapis').google.drive>,
  folderId: string
): Promise<Array<{ id: string; name: string }>> {
  const q = `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 200 });
  return (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
}

export async function migrateCompanionGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = `${METADATA_DIR}/companion`;
  try {
    const { google } = await import('googleapis');
    const { GoogleOAuth2Helper } = await import('../googleOAuth2Helper');
    const { CompanionMetadataSheets } = await import('../companionMetadataSheets');
    const auth = GoogleOAuth2Helper.createClient(ctx.token, pnIdentifier, ctx.accountId);
    const drive = google.drive({ version: 'v3', auth });
    let count = 0;
    const classFolders = await listGoogleChildFolders(drive, ctx.metadataFolderId);
    for (const folder of classFolders) {
      if (!CONTENT_CLASS_FOLDERS.has(folder.name)) continue;
      const contentClass = folder.name as ContentClass;
      const spreadsheets = await listGoogleSpreadsheets(drive, folder.id);
      for (const sheet of spreadsheets) {
        if (!sheet.name.endsWith('.metadata')) continue;
        const fileId = sheet.name.replace(/\.metadata$/, '');
        const meta = await CompanionMetadataSheets.readMetadata(
          ctx.token,
          sheet.id,
          pnIdentifier,
          ctx.accountId
        );
        if (!meta) continue;
        await writePortableJsonBlob(
          pnIdentifier,
          companionMetadataPath(contentClass, fileId),
          meta,
          accountId
        );
        count++;
      }
    }
    report = recordMigrationOutcome(report, path, count > 0 ? 'migrated' : 'skipped', { bytes: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateCompanionPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = `${METADATA_DIR}/companion`;
  try {
    const { CompanionMetadataSheets } = await import('../companionMetadataSheets');
    const { resolveSocialCloudContext } = await import('./storageFacade');
    const portableCtx = await resolveSocialCloudContext(pnIdentifier, accountId);
    if (!portableCtx.blobStore) throw new Error('Portable blob store unavailable');
    let count = 0;
    for (const contentClass of CONTENT_CLASSES) {
      const prefix = `${portableCtx.rootPrefix}${METADATA_DIR}/${contentClass}/`;
      const entries = await portableCtx.blobStore.list(prefix);
      for (const entry of entries) {
        const name = entry.key.split('/').pop() ?? '';
        if (!name.endsWith('.metadata.json')) continue;
        const fileId = name.replace(/\.metadata\.json$/, '');
        const raw = await portableCtx.blobStore.get(entry.key);
        if (!raw) continue;
        const meta = JSON.parse(Buffer.from(raw).toString('utf8'));
        const existingId = await CompanionMetadataSheets.findSpreadsheet(
          ctx.token,
          ctx.metadataFolderId,
          fileId,
          pnIdentifier,
          ctx.accountId
        );
        if (existingId) {
          await CompanionMetadataSheets.updateMetadata(
            ctx.token,
            existingId,
            meta,
            pnIdentifier,
            ctx.accountId
          );
        } else {
          await CompanionMetadataSheets.createSpreadsheet(
            ctx.token,
            ctx.metadataFolderId,
            fileId,
            { ...meta, contentClass: meta.contentClass ?? contentClass },
            pnIdentifier,
            ctx.accountId
          );
        }
        count++;
      }
    }
    report = recordMigrationOutcome(report, path, count > 0 ? 'migrated' : 'skipped', { bytes: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

async function getOrCreateParNoirMediaFolder(
  drive: ReturnType<typeof import('googleapis').google.drive>
): Promise<string> {
  const q = "name='par-noir-media' and mimeType='application/vnd.google-apps.folder' and trashed=false";
  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (res.data.files?.[0]?.id) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: 'par-noir-media', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  return created.data.id!;
}

export async function migrateFeedSubscribersGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = `${METADATA_DIR}/feeds`;
  try {
    const { google } = await import('googleapis');
    const { GoogleOAuth2Helper } = await import('../googleOAuth2Helper');
    const { writeSubscribersPortable } = await import('./creatorSubscriberPortableService');
    const auth = GoogleOAuth2Helper.createClient(ctx.token, pnIdentifier, ctx.accountId);
    const drive = google.drive({ version: 'v3', auth });
    const folderId = await getOrCreateParNoirMediaFolder(drive);
    const q = `'${folderId}' in parents and name contains 'feed-' and name contains '-subscribers.json' and trashed=false`;
    const res = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 200 });
    let count = 0;
    for (const file of res.data.files ?? []) {
      const match = file.name?.match(/^feed-(.+)-subscribers\.json$/);
      if (!match) continue;
      const feedId = match[1];
      const content = await drive.files.get({ fileId: file.id!, alt: 'media' });
      const raw = typeof content.data === 'string' ? content.data : JSON.stringify(content.data);
      const data = JSON.parse(raw);
      await writeSubscribersPortable(pnIdentifier, feedId, data, accountId);
      count++;
    }
    report = recordMigrationOutcome(report, path, count > 0 ? 'migrated' : 'skipped', { bytes: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateFeedSubscribersPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  const path = `${METADATA_DIR}/feeds`;
  try {
    const { google } = await import('googleapis');
    const { GoogleOAuth2Helper } = await import('../googleOAuth2Helper');
    const { resolveSocialCloudContext } = await import('./storageFacade');
    const portableCtx = await resolveSocialCloudContext(pnIdentifier, accountId);
    if (!portableCtx.blobStore) throw new Error('Portable blob store unavailable');
    const feedsPrefix = `${portableCtx.rootPrefix}${METADATA_DIR}/feeds/`;
    const entries = await portableCtx.blobStore.list(feedsPrefix);
    const auth = GoogleOAuth2Helper.createClient(ctx.token, pnIdentifier, ctx.accountId);
    const drive = google.drive({ version: 'v3', auth });
    const folderId = await getOrCreateParNoirMediaFolder(drive);
    let count = 0;
    for (const entry of entries) {
      if (!entry.key.endsWith('/subscribers.json')) continue;
      const parts = entry.key.replace(portableCtx.rootPrefix, '').split('/');
      const feedIdx = parts.indexOf('feeds');
      const feedId = feedIdx >= 0 ? parts[feedIdx + 1] : '';
      if (!feedId) continue;
      const raw = await portableCtx.blobStore.get(entry.key);
      if (!raw) continue;
      const data = JSON.parse(Buffer.from(raw).toString('utf8'));
      const fileName = `feed-${feedId}-subscribers.json`;
      const existingQ = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
      const existing = await drive.files.list({ q: existingQ, fields: 'files(id)', pageSize: 1 });
      const body = JSON.stringify(data, null, 2);
      if (existing.data.files?.[0]?.id) {
        await drive.files.update({
          fileId: existing.data.files[0].id!,
          media: { mimeType: 'application/json', body }
        });
      } else {
        await drive.files.create({
          requestBody: { name: fileName, parents: [folderId], mimeType: 'application/json' },
          media: { mimeType: 'application/json', body }
        });
      }
      count++;
    }
    report = recordMigrationOutcome(report, path, count > 0 ? 'migrated' : 'skipped', { bytes: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, path, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateIntegratorsGoogleToPortable(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  try {
    const { storageCredentialsService } = await import('../storageCredentialsService');
    const record = await storageCredentialsService.getCredentials(pnIdentifier);
    const layout = record?.credentials ? readCachedLayout(record.credentials) : {};
    const integratorsRootId = layout.nodeIds?.integratorsRootId;
    if (!integratorsRootId) {
      return finalizeMigrationReport(recordMigrationOutcome(report, INTEGRATORS_DIR, 'skipped'));
    }
    const { google } = await import('googleapis');
    const { GoogleOAuth2Helper } = await import('../googleOAuth2Helper');
    const { resolveSocialCloudContext } = await import('./storageFacade');
    const portableCtx = await resolveSocialCloudContext(pnIdentifier, accountId);
    if (!portableCtx.blobStore) throw new Error('Portable blob store unavailable');
    const auth = GoogleOAuth2Helper.createClient(ctx.token, pnIdentifier, ctx.accountId);
    const drive = google.drive({ version: 'v3', auth });

    async function copyFolder(folderId: string, relPath: string): Promise<number> {
      let copied = 0;
      let pageToken: string | undefined;
      do {
        const res = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: 'nextPageToken, files(id,name,mimeType)',
          pageSize: 200,
          pageToken
        });
        for (const f of res.data.files ?? []) {
          const childRel = relPath ? `${relPath}/${f.name}` : f.name!;
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            copied += await copyFolder(f.id!, childRel);
          } else {
            const content = await drive.files.get({ fileId: f.id!, alt: 'media' });
            const raw =
              typeof content.data === 'string'
                ? Buffer.from(content.data, 'utf8')
                : Buffer.from(JSON.stringify(content.data));
            const destKey = `${portableCtx.rootPrefix}${INTEGRATORS_DIR}/${childRel}`;
            await portableCtx.blobStore!.put(destKey, raw, { contentType: 'application/octet-stream' });
            copied++;
            report = recordMigrationOutcome(report, `${INTEGRATORS_DIR}/${childRel}`, 'migrated', {
              bytes: raw.length
            });
          }
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return copied;
    }

    const total = await copyFolder(integratorsRootId, '');
    if (total === 0) {
      report = recordMigrationOutcome(report, INTEGRATORS_DIR, 'skipped');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, INTEGRATORS_DIR, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export async function migrateIntegratorsPortableToGoogle(
  jobId: string,
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  try {
    const { storageCredentialsService } = await import('../storageCredentialsService');
    const record = await storageCredentialsService.getCredentials(pnIdentifier);
    const layout = record?.credentials ? readCachedLayout(record.credentials) : {};
    let integratorsRootId = layout.nodeIds?.integratorsRootId;
    const { google } = await import('googleapis');
    const { GoogleOAuth2Helper } = await import('../googleOAuth2Helper');
    const { resolveSocialCloudContext } = await import('./storageFacade');
    const portableCtx = await resolveSocialCloudContext(pnIdentifier, accountId);
    if (!portableCtx.blobStore) throw new Error('Portable blob store unavailable');
    const auth = GoogleOAuth2Helper.createClient(ctx.token, pnIdentifier, ctx.accountId);
    const drive = google.drive({ version: 'v3', auth });

    if (!integratorsRootId) {
      const pnFolderId = layout.nodeIds?.pnFolderId;
      if (!pnFolderId) throw new Error('Google Drive layout not initialized');
      const q = `name='${INTEGRATORS_DIR}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
      integratorsRootId = res.data.files?.[0]?.id ?? undefined;
      if (!integratorsRootId) {
        const created = await drive.files.create({
          requestBody: {
            name: INTEGRATORS_DIR,
            parents: [pnFolderId],
            mimeType: 'application/vnd.google-apps.folder'
          },
          fields: 'id'
        });
        integratorsRootId = created.data.id ?? undefined;
      }
    }
    if (!integratorsRootId) throw new Error('Integrators root folder unavailable');

    const prefix = `${portableCtx.rootPrefix}${INTEGRATORS_DIR}/`;
    const entries = await portableCtx.blobStore.list(prefix);
    let count = 0;
    for (const entry of entries) {
      const rel = entry.key.slice(prefix.length);
      if (!rel || rel.endsWith('/')) continue;
      const parts = rel.split('/');
      let parentId = integratorsRootId;
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        const fq = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const fr = await drive.files.list({ q: fq, fields: 'files(id)', pageSize: 1 });
        if (fr.data.files?.[0]?.id) {
          parentId = fr.data.files[0].id!;
        } else {
          const created = await drive.files.create({
            requestBody: {
              name: folderName,
              parents: [parentId],
              mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
          });
          parentId = created.data.id!;
        }
      }
      const fileName = parts[parts.length - 1];
      const raw = await portableCtx.blobStore.get(entry.key);
      if (!raw) continue;
      const eq = `name='${fileName}' and '${parentId}' in parents and trashed=false`;
      const er = await drive.files.list({ q: eq, fields: 'files(id)', pageSize: 1 });
      if (er.data.files?.[0]?.id) {
        await drive.files.update({
          fileId: er.data.files[0].id!,
          media: { mimeType: 'application/octet-stream', body: Buffer.from(raw) }
        });
      } else {
        await drive.files.create({
          requestBody: { name: fileName, parents: [parentId] },
          media: { mimeType: 'application/octet-stream', body: Buffer.from(raw) }
        });
      }
      count++;
      report = recordMigrationOutcome(report, `${INTEGRATORS_DIR}/${rel}`, 'migrated', { bytes: raw.length });
    }
    if (count === 0) {
      report = recordMigrationOutcome(report, INTEGRATORS_DIR, 'skipped');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, INTEGRATORS_DIR, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}
