/**
 * Scheduled job: remove orphaned aggregator metadata (entries whose Drive file is gone).
 * Uses isDriveFileUrlDead (Drive web URL check, no OAuth).
 * Called by the POST /api/aggregator/metadata-index/cleanup-orphaned route and by the 5-minute timer.
 */
export async function runCleanupOrphaned(): Promise<{ checked: number; removed: number }> {
  const { AggregatorMetadataServiceDB } = await import('../modules/aggregatorMetadataServiceDB');
  const { isDriveFileUrlDead } = await import('../utils/driveUrlCheck');
  const { getDatabasePool } = await import('../utils/database');
  const { hashIdentifier, safeLogger } = await import('../../utils/logger');

  const service = AggregatorMetadataServiceDB.getInstance();
  const db = getDatabasePool();

  const allTables = ['aggregator_media', 'aggregator_thoughts', 'aggregator_collections'];
  const allEntries: Array<{
    fileId: string;
    metadata: any;
    googleDriveFileId: string;
    backend: string;
    ownerPn?: string;
  }> = [];

  for (const table of allTables) {
    try {
      const result = await db.query(`SELECT file_id, metadata, pn_identifier FROM ${table}`);
      for (const row of result.rows) {
        try {
          if (!row.metadata) {
            safeLogger.warn('[CleanupOrphaned] Skipping row with null metadata', { table, fileIdHash: hashIdentifier(row.file_id) });
            continue;
          }
          let metadata: any = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          const backend = metadata.backend || 'google_drive';
          const backendFileId =
            (metadata as any).googleDriveFileId || metadata.backendFileId || row.file_id;
          if (!backendFileId) continue;
          allEntries.push({
            fileId: row.file_id,
            metadata,
            googleDriveFileId: backendFileId,
            backend,
            ownerPn: row.pn_identifier
          });
        } catch (rowError) {
          safeLogger.error('[CleanupOrphaned] Error processing row', { table, fileIdHash: hashIdentifier(row.file_id), error: rowError as Error });
        }
      }
    } catch (tableError) {
      safeLogger.error('[CleanupOrphaned] Error querying table', { table, error: tableError as Error });
    }
  }

  safeLogger.info('[CleanupOrphaned] Found files to verify', { count: allEntries.length });

  const { getActiveFileMigrationFileIds } = await import(
    '../modules/storage/storageMigrationJobs'
  );
  const migratingFileIds = await getActiveFileMigrationFileIds();

  const filesToRemove: string[] = [];
  const batchSize = 10;
  for (let i = 0; i < allEntries.length; i += batchSize) {
    const batch = allEntries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          if (migratingFileIds.has(entry.fileId)) {
            return null;
          }
          if (entry.backend === 'google_drive') {
            const dead = await isDriveFileUrlDead(entry.googleDriveFileId);
            if (dead) {
              safeLogger.info('[CleanupOrphaned] Drive file missing', {
                fileIdHash: hashIdentifier(entry.googleDriveFileId)
              });
              return entry.fileId;
            }
            return null;
          }
          const ownerPn = entry.ownerPn || entry.metadata?.pnIdentifier;
          if (!ownerPn) return null;
          const { resolveFileBackendContext } = await import('../modules/storage/storageFacade');
          const ctx = await resolveFileBackendContext(
            ownerPn,
            entry.backend as import('@par-noir/user-owned-storage').StorageProviderId,
            entry.metadata?.backendAccountId
          );
          if (!ctx.blobStore) return null;
          const key = `${ctx.rootPrefix}${entry.googleDriveFileId}`.replace(/\/+/g, '/');
          const blob = await ctx.blobStore.get(key);
          if (!blob) {
            safeLogger.info('[CleanupOrphaned] Portable blob missing', {
              fileIdHash: hashIdentifier(entry.fileId)
            });
            return entry.fileId;
          }
          return null;
        } catch (error) {
          safeLogger.warn('[CleanupOrphaned] Error verifying file', {
            fileIdHash: hashIdentifier(entry.googleDriveFileId),
            error: error as Error
          });
          return null;
        }
      })
    );
    filesToRemove.push(...(results.filter((id): id is string => id != null)));

    if (i + batchSize < allEntries.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  let removedCount = 0;
  for (const fileId of filesToRemove) {
    try {
      if (await service.removeMetadata(fileId)) removedCount++;
    } catch (error) {
      safeLogger.error('[CleanupOrphaned] Failed to remove metadata', { fileIdHash: hashIdentifier(fileId), error: error as Error });
    }
  }

  safeLogger.info('[CleanupOrphaned] Removed orphaned entries', { removedCount });
  return { checked: allEntries.length, removed: removedCount };
}
