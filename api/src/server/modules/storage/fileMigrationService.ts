import { encryptedMediaPath, type ContentClass } from '@par-noir/user-owned-storage';
import type { StorageProviderId } from '@par-noir/user-owned-storage';
import { IndexStorageService } from './indexStorageService';
import { resolveFileBackendContext, resolveSocialCloudContext } from './storageFacade';
import {
  createMigrationJob,
  getMigrationJob,
  updateMigrationJob
} from './storageMigrationJobs';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export async function previewFileMigration(
  pnIdentifier: string,
  fileIds: string[],
  destProvider: StorageProviderId,
  destAccountId?: string
): Promise<{ fileCount: number; destProvider: string; destAccountId?: string }> {
  void destAccountId;
  return {
    fileCount: fileIds.length,
    destProvider,
    destAccountId
  };
}

export async function migrateFiles(
  pnIdentifier: string,
  fileIds: string[],
  destProvider: StorageProviderId,
  destAccountId: string | undefined,
  mode: 'move' | 'copy' = 'move'
): Promise<{ jobId: string }> {
  const normalized = normalizePn(pnIdentifier);
  const socialCtx = await resolveSocialCloudContext(normalized);
  const destCtx = await resolveFileBackendContext(normalized, destProvider, destAccountId);

  if (!destCtx.blobStore) {
    throw new Error('Destination blob store unavailable');
  }

  const jobId = await createMigrationJob({
    pnIdentifier: normalized,
    jobType: 'files',
    destProvider,
    destAccountId,
    progress: { fileIds, mode }
  });
  await updateMigrationJob(jobId, { status: 'running' });

  const results: Array<{ fileId: string; ok: boolean; error?: string }> = [];

  for (const fileId of fileIds) {
    try {
      const entry = await IndexStorageService.getFileById(
        normalized,
        'owner',
        fileId,
        undefined,
        undefined,
        socialCtx.accountId
      );
      if (!entry) {
        results.push({ fileId, ok: false, error: 'Not in owner index' });
        continue;
      }

      const srcBackend = (entry as { backend?: string }).backend ?? 'google_drive';
      const srcKey =
        (entry as { backendFileId?: string }).backendFileId ??
        entry.googleDriveFileId ??
        fileId;
      const srcAccountId = (entry as { backendAccountId?: string }).backendAccountId;

      if (srcBackend === 'google_drive') {
        results.push({ fileId, ok: false, error: 'Google Drive file migration use dashboard move API' });
        continue;
      }

      const srcCtx = await resolveFileBackendContext(
        normalized,
        srcBackend as StorageProviderId,
        srcAccountId
      );
      if (!srcCtx.blobStore) {
        results.push({ fileId, ok: false, error: 'Source blob store unavailable' });
        continue;
      }

      const srcFullKey = srcKey.startsWith(srcCtx.rootPrefix)
        ? srcKey
        : `${srcCtx.rootPrefix}${srcKey}`;
      const data = await srcCtx.blobStore.get(srcFullKey);
      if (!data) {
        results.push({ fileId, ok: false, error: 'Source blob missing' });
        continue;
      }

      const contentClass =
        ((entry as { contentClass?: ContentClass }).contentClass as ContentClass) ?? 'media';
      const newKey = encryptedMediaPath(contentClass, fileId);
      const destFullKey = `${destCtx.rootPrefix}${newKey}`;
      await destCtx.blobStore.put(destFullKey, data, {
        contentType: 'application/octet-stream'
      });

      await IndexStorageService.updateFile(
        normalized,
        'owner',
        fileId,
        {
          backend: destProvider,
          backendFileId: newKey,
          backendAccountId: destAccountId,
          googleDriveFileId: newKey
        },
        undefined,
        undefined,
        socialCtx.accountId
      );

      if (entry.visibility === 'public') {
        await IndexStorageService.updateFile(
          normalized,
          'public',
          fileId,
          {
            backend: destProvider,
            backendFileId: newKey,
            backendAccountId: destAccountId
          },
          undefined,
          undefined,
          socialCtx.accountId,
          contentClass
        );
      }

      try {
        const { AggregatorMetadataServiceDB } = await import('../aggregatorMetadataServiceDB');
        await AggregatorMetadataServiceDB.getInstance().updateMetadata(fileId, {
          backend: destProvider,
          backendFileId: newKey,
          backendAccountId: destAccountId
        } as Record<string, unknown>);
      } catch {
        /* non-fatal */
      }

      if (mode === 'move') {
        await srcCtx.blobStore.delete(srcFullKey);
      }

      results.push({ fileId, ok: true });
    } catch (err) {
      results.push({
        fileId,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  await updateMigrationJob(jobId, {
    status: failed === fileIds.length ? 'failed' : 'completed',
    progress: { results },
    completedAt: new Date().toISOString()
  });

  return { jobId };
}

export async function bulkMigrateFiles(
  pnIdentifier: string,
  sourceProvider: StorageProviderId,
  sourceAccountId: string | undefined,
  destProvider: StorageProviderId,
  destAccountId: string | undefined,
  mode: 'move' | 'copy' = 'move'
): Promise<{ jobId: string }> {
  const normalized = normalizePn(pnIdentifier);
  const socialCtx = await resolveSocialCloudContext(normalized);
  const { files } = await IndexStorageService.getOwnerFileIndex(
    normalized,
    undefined,
    undefined,
    socialCtx.accountId
  );
  const matching = files.filter((f) => {
    const backend = (f as { backend?: string }).backend ?? 'google_drive';
    const acct = (f as { backendAccountId?: string }).backendAccountId;
    if (backend !== sourceProvider) return false;
    if (sourceAccountId && acct && acct !== sourceAccountId) return false;
    return true;
  });
  const ids = matching.map((f) => f.fileId).filter(Boolean) as string[];
  return migrateFiles(normalized, ids, destProvider, destAccountId, mode);
}

export { getMigrationJob };
