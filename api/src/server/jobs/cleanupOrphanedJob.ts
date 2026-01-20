/**
 * Scheduled job: remove orphaned aggregator metadata (entries whose Drive file is gone).
 * Uses isDriveFileUrlDead (Drive web URL check, no OAuth).
 * Called by the POST /api/aggregator/metadata-index/cleanup-orphaned route and by the 5-minute timer.
 */
export async function runCleanupOrphaned(): Promise<{ checked: number; removed: number }> {
  const { AggregatorMetadataServiceDB } = await import('../modules/aggregatorMetadataServiceDB');
  const { isDriveFileUrlDead } = await import('../utils/driveUrlCheck');
  const { getDatabasePool } = await import('../utils/database');

  const service = AggregatorMetadataServiceDB.getInstance();
  const db = getDatabasePool();

  const allTables = ['aggregator_media', 'aggregator_thoughts', 'aggregator_collections'];
  const allEntries: Array<{ fileId: string; metadata: any; googleDriveFileId: string }> = [];

  for (const table of allTables) {
    try {
      const result = await db.query(`SELECT file_id, metadata FROM ${table}`);
      for (const row of result.rows) {
        try {
          if (!row.metadata) {
            console.warn(`[CleanupOrphaned] Skipping row with null metadata in ${table}: ${row.file_id}`);
            continue;
          }
          let metadata: any = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          if (!metadata || metadata.backend !== 'google_drive') continue;
          const googleDriveFileId = (metadata as any).googleDriveFileId || metadata.backendFileId || row.file_id;
          if (!googleDriveFileId) continue;
          allEntries.push({ fileId: row.file_id, metadata, googleDriveFileId });
        } catch (rowError) {
          console.error(`[CleanupOrphaned] Error processing row ${row.file_id} in ${table}:`, rowError);
        }
      }
    } catch (tableError) {
      console.error(`[CleanupOrphaned] Error querying table ${table}:`, tableError);
    }
  }

  console.log(`[CleanupOrphaned] Found ${allEntries.length} Google Drive file(s) to verify`);

  const filesToRemove: string[] = [];
  const batchSize = 10;
  for (let i = 0; i < allEntries.length; i += batchSize) {
    const batch = allEntries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          const dead = await isDriveFileUrlDead(entry.googleDriveFileId);
          if (dead) {
            console.log(`[CleanupOrphaned] File ${entry.googleDriveFileId} is dead (deleted/not found): ${entry.metadata?.name || 'unknown'}`);
            return entry.fileId;
          }
          return null;
        } catch (error) {
          console.warn(`[CleanupOrphaned] Error verifying ${entry.googleDriveFileId}:`, error);
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
      console.error(`[CleanupOrphaned] Failed to remove metadata for ${fileId}:`, error);
    }
  }

  console.log(`[CleanupOrphaned] Removed ${removedCount} orphaned metadata entry/entries`);
  return { checked: allEntries.length, removed: removedCount };
}
