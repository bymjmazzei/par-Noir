import {
  MIGRATION_CATALOG,
  mergeMigrationReports,
  transferTable,
  type MigrationReport,
  type TableTransferOps
} from '@par-noir/storage-migration';
import {
  INTEGRATORS_DIR,
  MESSAGES_DIR,
  metadataPath,
  pnRootFolderName,
  readCachedLayout,
  type StorageCredentialsEnvelope,
  type StorageProviderId,
  type TableSchema
} from '@par-noir/user-owned-storage';
import { google } from 'googleapis';
import { GoogleOAuth2Helper } from '../googleOAuth2Helper';
import { googleDriveProxyService } from '../googleDriveProxy';
import { createBlobStoreForProvider } from './blobAdapters';
import { initializePortableStorage } from './storageInitService';
import {
  migrateConnectionsGoogleToPortable,
  migrateConnectionsPortableToGoogle,
  migrateEngagementGoogleToPortable,
  migrateEngagementPortableToGoogle,
  migrateMessagingGoogleToPortable,
  migrateMessagingPortableToGoogle,
  migratePreferencesGoogleToPortable,
  migratePreferencesPortableToGoogle,
  migrateRecoveryGoogleToPortable,
  migrateRecoveryPortableToGoogle,
  migrateCompanionGoogleToPortable,
  migrateCompanionPortableToGoogle,
  migrateFeedSubscribersGoogleToPortable,
  migrateFeedSubscribersPortableToGoogle,
  migrateIntegratorsGoogleToPortable,
  migrateIntegratorsPortableToGoogle
} from './migrationTransformers';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';
import {
  portableTableReplaceAll,
  portableTableScan
} from './portableTableService';
import { scanGoogleTableRows, replaceAllGoogleTableRows } from './googleSheetsTableOps';
import type { DriveTableContext } from './sheetsTableBridge';
import { copyPortableSocialCloudBlobs } from '@par-noir/storage-migration';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

async function buildGoogleCtx(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  accountId?: string
): Promise<DriveTableContext> {
  const layout = readCachedLayout(credentials);
  const metadataFolderId = layout.nodeIds?.metadataFolderId;
  if (!metadataFolderId) throw new Error('Google Drive metadata folder not initialized');
  const accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
  return {
    token: { access_token: accessToken },
    metadataFolderId,
    pnIdentifier,
    accountId
  };
}

function portableOps(pnIdentifier: string, accountId?: string): TableTransferOps {
  return {
    scan: (schema: TableSchema) => portableTableScan(pnIdentifier, schema, accountId),
    replaceAll: (schema, rows, meta) =>
      portableTableReplaceAll(pnIdentifier, schema, rows, accountId, meta)
  };
}

type MigrationProgressCallback = (report: MigrationReport) => Promise<void>;

async function emitProgress(
  jobId: string,
  reports: MigrationReport[],
  onProgress?: MigrationProgressCallback
): Promise<void> {
  if (!onProgress) return;
  await onProgress(mergeMigrationReports(jobId, reports));
}

function googleOps(ctx: DriveTableContext): TableTransferOps {
  return {
    scan: (schema) => scanGoogleTableRows(ctx, schema),
    replaceAll: (schema, rows, meta) => replaceAllGoogleTableRows(ctx, schema, rows, meta)
  };
}

async function copyJsonBlobGoogleToPortable(
  ctx: DriveTableContext,
  relativePath: string,
  pnIdentifier: string,
  accountId?: string
): Promise<void> {
  const auth = GoogleOAuth2Helper.createClient(ctx.token, pnIdentifier, ctx.accountId);
  const drive = google.drive({ version: 'v3', auth });
  const fileName = relativePath.split('/').pop()!;
  const q = `name='${fileName}' and '${ctx.metadataFolderId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  const fileId = res.data.files?.[0]?.id;
  if (!fileId) return;
  const content = await drive.files.get({ fileId, alt: 'media' });
  const raw = typeof content.data === 'string' ? content.data : JSON.stringify(content.data);
  await writePortableJsonBlob(pnIdentifier, relativePath, JSON.parse(raw), accountId);
}

async function copyJsonBlobPortableToGoogle(
  ctx: DriveTableContext,
  relativePath: string,
  pnIdentifier: string,
  accountId?: string
): Promise<void> {
  const data = await readPortableJsonBlob(pnIdentifier, relativePath, accountId);
  if (!data) return;
  const auth = GoogleOAuth2Helper.createClient(ctx.token, pnIdentifier, ctx.accountId);
  const drive = google.drive({ version: 'v3', auth });
  const fileName = relativePath.split('/').pop()!;
  const q = `name='${fileName}' and '${ctx.metadataFolderId}' in parents and trashed=false`;
  const existing = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  const body = JSON.stringify(data, null, 2);
  if (existing.data.files?.[0]?.id) {
    await drive.files.update({
      fileId: existing.data.files[0].id!,
      media: { mimeType: 'application/json', body }
    });
  } else {
    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [ctx.metadataFolderId],
        mimeType: 'application/json'
      },
      media: { mimeType: 'application/json', body }
    });
  }
}

async function runTransformer(
  jobId: string,
  transformerId: string,
  direction: 'google_to_portable' | 'portable_to_google',
  ctx: DriveTableContext,
  pnIdentifier: string,
  accountId?: string
): Promise<MigrationReport> {
  const map: Record<string, { g2p: () => Promise<MigrationReport>; p2g: () => Promise<MigrationReport> }> = {
    connections: {
      g2p: () => migrateConnectionsGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migrateConnectionsPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    },
    recovery: {
      g2p: () => migrateRecoveryGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migrateRecoveryPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    },
    preferences: {
      g2p: () => migratePreferencesGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migratePreferencesPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    },
    engagement: {
      g2p: () => migrateEngagementGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migrateEngagementPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    },
    messaging: {
      g2p: () => migrateMessagingGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migrateMessagingPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    },
    companion: {
      g2p: () => migrateCompanionGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migrateCompanionPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    },
    'feed-subscribers': {
      g2p: () => migrateFeedSubscribersGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migrateFeedSubscribersPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    },
    integrators: {
      g2p: () => migrateIntegratorsGoogleToPortable(jobId, ctx, pnIdentifier, accountId),
      p2g: () => migrateIntegratorsPortableToGoogle(jobId, ctx, pnIdentifier, accountId)
    }
  };
  const handler = map[transformerId];
  if (!handler) {
    const { createEmptyMigrationReport, finalizeMigrationReport, recordMigrationOutcome } = await import('@par-noir/storage-migration');
    let r = createEmptyMigrationReport(jobId);
    r = recordMigrationOutcome(r, transformerId, 'skipped');
    return finalizeMigrationReport(r);
  }
  return direction === 'google_to_portable' ? handler.g2p() : handler.p2g();
}

export async function migrateGoogleToPortable(
  jobId: string,
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  targetProvider: StorageProviderId,
  targetAccountId?: string,
  onProgress?: MigrationProgressCallback
): Promise<MigrationReport> {
  const normalized = normalizePn(pnIdentifier);
  await initializePortableStorage(normalized, credentials, targetProvider);
  const googleCtx = await buildGoogleCtx(normalized, credentials, credentials.socialCloudAccountId);
  const destOps = portableOps(normalized, targetAccountId);
  const srcOps = googleOps(googleCtx);
  const reports: MigrationReport[] = [];

  for (const artifact of MIGRATION_CATALOG) {
    if (artifact.kind === 'bridge_table' && artifact.schema) {
      reports.push(
        await transferTable(jobId, artifact.path, artifact.schema, srcOps, destOps)
      );
    } else if (artifact.kind === 'json_blob') {
      try {
        await copyJsonBlobGoogleToPortable(googleCtx, artifact.path, normalized, targetAccountId);
        const { createEmptyMigrationReport, finalizeMigrationReport, recordMigrationOutcome } = await import('@par-noir/storage-migration');
        let r = createEmptyMigrationReport(jobId);
        r = recordMigrationOutcome(r, artifact.path, 'migrated');
        reports.push(finalizeMigrationReport(r));
      } catch (err) {
        const { createEmptyMigrationReport, finalizeMigrationReport, recordMigrationOutcome } = await import('@par-noir/storage-migration');
        let r = createEmptyMigrationReport(jobId);
        r = recordMigrationOutcome(r, artifact.path, artifact.critical ? 'failed' : 'skipped', {
          error: err instanceof Error ? err.message : String(err)
        });
        reports.push(finalizeMigrationReport(r));
      }
    } else if (artifact.kind === 'transformer' && artifact.transformerId) {
      reports.push(
        await runTransformer(jobId, artifact.transformerId, 'google_to_portable', googleCtx, normalized, targetAccountId)
      );
    }
    await emitProgress(jobId, reports, onProgress);
  }

  await writePortableJsonBlob(
    normalized,
    metadataPath('social-cloud-migration.json'),
    {
      jobId,
      sourceProvider: 'google_drive',
      destProvider: targetProvider,
      completedAt: new Date().toISOString(),
      sourceReadOnly: true
    },
    targetAccountId
  );

  return mergeMigrationReports(jobId, reports);
}

export async function migratePortableToGoogle(
  jobId: string,
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  sourceAccountId?: string,
  onProgress?: MigrationProgressCallback
): Promise<MigrationReport> {
  const normalized = normalizePn(pnIdentifier);
  const googleCtx = await buildGoogleCtx(normalized, credentials, credentials.socialCloudAccountId);
  const srcOps = portableOps(normalized, sourceAccountId ?? credentials.socialCloudAccountId);
  const destOps = googleOps(googleCtx);
  const reports: MigrationReport[] = [];

  for (const artifact of MIGRATION_CATALOG) {
    if (artifact.kind === 'bridge_table' && artifact.schema) {
      reports.push(
        await transferTable(jobId, artifact.path, artifact.schema, srcOps, destOps)
      );
    } else if (artifact.kind === 'json_blob') {
      try {
        await copyJsonBlobPortableToGoogle(googleCtx, artifact.path, normalized, sourceAccountId);
        const { createEmptyMigrationReport, finalizeMigrationReport, recordMigrationOutcome } = await import('@par-noir/storage-migration');
        let r = createEmptyMigrationReport(jobId);
        r = recordMigrationOutcome(r, artifact.path, 'migrated');
        reports.push(finalizeMigrationReport(r));
      } catch (err) {
        const { createEmptyMigrationReport, finalizeMigrationReport, recordMigrationOutcome } = await import('@par-noir/storage-migration');
        let r = createEmptyMigrationReport(jobId);
        r = recordMigrationOutcome(r, artifact.path, artifact.critical ? 'failed' : 'skipped', {
          error: err instanceof Error ? err.message : String(err)
        });
        reports.push(finalizeMigrationReport(r));
      }
    } else if (artifact.kind === 'transformer' && artifact.transformerId) {
      reports.push(
        await runTransformer(jobId, artifact.transformerId, 'portable_to_google', googleCtx, normalized, sourceAccountId)
      );
    }
    await emitProgress(jobId, reports, onProgress);
  }

  return mergeMigrationReports(jobId, reports);
}

export async function migratePortableToPortable(
  jobId: string,
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  sourceProvider: StorageProviderId,
  targetProvider: StorageProviderId,
  sourceAccountId?: string,
  targetAccountId?: string,
  onProgress?: MigrationProgressCallback
): Promise<MigrationReport> {
  const normalized = normalizePn(pnIdentifier);
  const sourceStore = await createBlobStoreForProvider(
    normalized,
    credentials,
    sourceProvider,
    sourceAccountId ?? credentials.socialCloudAccountId
  );
  const destStore = await createBlobStoreForProvider(
    normalized,
    credentials,
    targetProvider,
    targetAccountId
  );
  const root = `${pnRootFolderName(normalized)}/`;
  await initializePortableStorage(normalized, credentials, targetProvider);
  const reports: MigrationReport[] = [];
  for (const filterPrefix of ['_metadata/', `${MESSAGES_DIR}/`, `${INTEGRATORS_DIR}/`]) {
    reports.push(
      await copyPortableSocialCloudBlobs({
        jobId,
        sourceStore,
        destStore,
        sourcePrefix: root,
        destPrefix: root,
        filterPrefix
      })
    );
    await emitProgress(jobId, reports, onProgress);
  }
  return mergeMigrationReports(jobId, reports);
}
