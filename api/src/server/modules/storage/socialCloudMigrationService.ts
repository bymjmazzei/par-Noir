import { DriveIndexError } from '../pnDriveIndex';
import {
  buildPortableInventoryFromList,
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
import { buildGoogleInventoryFromDrive } from './googleDriveInventory';
import {
  migrateGoogleToPortable,
  migratePortableToGoogle,
  migratePortableToPortable
} from './googlePortableMigrator';
import { googleDriveProxyService } from '../googleDriveProxy';
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
  targetAccountId?: string,
  cloudAccessToken?: string
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

  let inventoryCount = 0;
  let estimatedBytes = 0;

  if (sourceProvider === 'google_drive') {
    // Reading the source Drive needs the owner's device-held token.
    const accessToken = cloudAccessToken?.trim();
    if (!accessToken) {
      throw new DriveIndexError(
        'Migration preview requires the owner\'s Drive token. Forward X-PN-Cloud-Access-Token from an unlocked session.',
        'CLOUD_TOKEN_REQUIRED'
      );
    }
    const inv = await buildGoogleInventoryFromDrive(
      { access_token: accessToken },
      credentials,
      normalized,
      credentials.socialCloudAccountId
    );
    inventoryCount = inv.items.length;
    estimatedBytes = inv.totalEstimatedBytes;
  } else if (await isPortableSocialCloud(normalized)) {
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
  if (preview.blockers.some((b) => b.includes('same provider'))) {
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
  void executeSocialCloudMigrationJob(
    jobId,
    normalized,
    credentials,
    sourceProvider,
    targetProvider,
    targetAccountId
  );

  return { jobId };
}

async function executeSocialCloudMigrationJob(
  jobId: string,
  normalized: string,
  credentials: StorageCredentialsEnvelope,
  sourceProvider: StorageProviderId,
  targetProvider: StorageProviderId,
  targetAccountId?: string
): Promise<void> {
  const onProgress = async (report: MigrationReport) => {
    await updateMigrationJob(jobId, {
      progress: { report, results: report.items }
    });
  };

  try {
    let report: MigrationReport;

    if (sourceProvider === 'google_drive' && targetProvider !== 'google_drive') {
      report = await migrateGoogleToPortable(
        jobId,
        normalized,
        credentials,
        targetProvider,
        targetAccountId,
        onProgress
      );
    } else if (sourceProvider !== 'google_drive' && targetProvider === 'google_drive') {
      report = await migratePortableToGoogle(
        jobId,
        normalized,
        credentials,
        credentials.socialCloudAccountId,
        onProgress
      );
    } else if (sourceProvider !== 'google_drive' && targetProvider !== 'google_drive') {
      report = await migratePortableToPortable(
        jobId,
        normalized,
        credentials,
        sourceProvider,
        targetProvider,
        credentials.socialCloudAccountId,
        targetAccountId,
        onProgress
      );
    } else {
      throw new Error('Unsupported migration direction');
    }

    const status =
      report.totals.failed > 0 && report.totals.migrated === 0 ? 'failed' : 'completed';

    await updateMigrationJob(jobId, {
      status,
      progress: { report, results: report.items },
      completedAt: new Date().toISOString()
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateMigrationJob(jobId, {
      status: 'failed',
      progress: { error: msg },
      completedAt: new Date().toISOString()
    });
  }
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
