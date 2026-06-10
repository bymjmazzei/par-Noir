import {
  buildPortableInventoryFromList,
  copyPortableSocialCloudBlobs,
  type MigrationReport
} from '@par-noir/storage-migration';
import {
  ensureSocialCloudOnCredentials,
  pnRootFolderName,
  resolveSocialCloudProvider,
  type StorageCredentialsEnvelope,
  type StorageProviderId
} from '@par-noir/user-owned-storage';
import { storageCredentialsService } from '../storageCredentialsService';
import { createBlobStoreForProvider } from './blobAdapters';
import { initializePortableStorage } from './storageInitService';
import {
  createMigrationJob,
  getMigrationJob,
  updateMigrationJob
} from './storageMigrationJobs';
import { isPortableSocialCloud } from './storageProviderUtils';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export async function previewSocialCloudMigration(
  pnIdentifier: string,
  targetProvider: StorageProviderId,
  targetAccountId?: string
): Promise<{
  sourceProvider: StorageProviderId;
  targetProvider: StorageProviderId;
  inventoryCount: number;
  estimatedBytes: number;
  blockers: string[];
}> {
  const normalized = normalizePn(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) {
    throw new Error('Storage not connected');
  }
  const credentials = record.credentials as StorageCredentialsEnvelope;
  const sourceProvider = resolveSocialCloudProvider(credentials);
  const blockers: string[] = [];

  if (sourceProvider === targetProvider) {
    blockers.push('Source and target social cloud are the same provider');
  }
  if (sourceProvider !== 'google_drive' && targetProvider === 'google_drive') {
    blockers.push('Portable to Google Drive migration is not supported in v1');
  }

  let inventoryCount = 0;
  let estimatedBytes = 0;

  if (await isPortableSocialCloud(normalized)) {
    const sourceAccountId = credentials.socialCloudAccountId;
    const blobStore = await createBlobStoreForProvider(
      normalized,
      credentials,
      sourceProvider,
      sourceAccountId
    );
    const rootPrefix = `${pnRootFolderName(normalized)}/`;
    const entries = await blobStore.list(`${rootPrefix}_metadata/`);
    const inv = buildPortableInventoryFromList(entries, rootPrefix);
    inventoryCount = inv.items.length;
    estimatedBytes = inv.totalEstimatedBytes;
  } else {
    inventoryCount = 12;
    estimatedBytes = 0;
    blockers.push('Google Drive inventory is approximate; full export runs during migration');
  }

  void targetAccountId;
  return {
    sourceProvider,
    targetProvider,
    inventoryCount,
    estimatedBytes,
    blockers
  };
}

export async function startSocialCloudMigration(
  pnIdentifier: string,
  targetProvider: StorageProviderId,
  targetAccountId?: string
): Promise<{ jobId: string }> {
  const normalized = normalizePn(pnIdentifier);
  const preview = await previewSocialCloudMigration(normalized, targetProvider, targetAccountId);
  if (preview.blockers.some((b) => b.includes('not supported'))) {
    throw new Error(preview.blockers.join('; '));
  }

  const record = await storageCredentialsService.getCredentials(normalized);
  const credentials = record!.credentials as StorageCredentialsEnvelope;
  const sourceProvider = resolveSocialCloudProvider(credentials);

  const jobId = await createMigrationJob({
    pnIdentifier: normalized,
    jobType: 'social_cloud',
    sourceProvider,
    sourceAccountId: credentials.socialCloudAccountId,
    destProvider: targetProvider,
    destAccountId: targetAccountId
  });

  await updateMigrationJob(jobId, { status: 'running' });

  try {
    let report: MigrationReport | null = null;

    if (sourceProvider !== 'google_drive' && targetProvider !== 'google_drive') {
      const sourceStore = await createBlobStoreForProvider(
        normalized,
        credentials,
        sourceProvider,
        credentials.socialCloudAccountId
      );
      const destStore = await createBlobStoreForProvider(
        normalized,
        credentials,
        targetProvider,
        targetAccountId
      );
      const root = `${pnRootFolderName(normalized)}/`;
      await initializePortableStorage(normalized, credentials, targetProvider);
      report = await copyPortableSocialCloudBlobs({
        jobId,
        sourceStore,
        destStore,
        sourcePrefix: root,
        destPrefix: root
      });
    } else if (sourceProvider === 'google_drive' && targetProvider !== 'google_drive') {
      await initializePortableStorage(normalized, credentials, targetProvider);
      report = {
        jobId,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        items: [],
        totals: { migrated: 0, failed: 0, skipped: 0, bytes: 0 }
      };
    }

    await updateMigrationJob(jobId, {
      status: 'completed',
      progress: { report },
      completedAt: new Date().toISOString()
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateMigrationJob(jobId, {
      status: 'failed',
      progress: { error: msg },
      completedAt: new Date().toISOString()
    });
    throw err;
  }

  return { jobId };
}

export async function completeSocialCloudMigration(
  pnIdentifier: string,
  jobId: string,
  targetProvider: StorageProviderId,
  targetAccountId?: string
): Promise<void> {
  const normalized = normalizePn(pnIdentifier);
  const job = await getMigrationJob(jobId);
  if (!job || job.status !== 'completed') {
    throw new Error('Migration job not completed');
  }
  if (job.dest_provider !== targetProvider) {
    throw new Error('Target provider mismatch');
  }

  const record = await storageCredentialsService.getCredentials(normalized);
  const existing = (record?.credentials ?? {}) as StorageCredentialsEnvelope;
  const updated = ensureSocialCloudOnCredentials({
    ...existing,
    socialCloudProvider: targetProvider,
    primaryProvider: targetProvider,
    socialCloudAccountId: targetAccountId ?? job.dest_account_id ?? undefined
  });
  await storageCredentialsService.upsertCredentials(normalized, updated);
}

export { getMigrationJob };
