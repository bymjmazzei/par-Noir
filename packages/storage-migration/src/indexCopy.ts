import type { BlobStore } from '@par-noir/user-owned-storage';
import {
  CONTENT_CLASSES,
  TABLE_PATHS,
  contentClassIndexPath,
  portableTablePath
} from '@par-noir/user-owned-storage';
import {
  createEmptyMigrationReport,
  finalizeMigrationReport,
  recordMigrationOutcome,
  type MigrationReport
} from './migrationReport.js';

export interface IndexCopyOptions {
  jobId: string;
  sourceStore: BlobStore;
  destStore: BlobStore;
  sourcePrefix: string;
  destPrefix: string;
}

function normalizePrefix(p: string): string {
  return p.endsWith('/') ? p : `${p}/`;
}

const INDEX_PATHS = [
  portableTablePath(TABLE_PATHS.ownerFileIndex),
  portableTablePath(TABLE_PATHS.publicFileIndex),
  ...CONTENT_CLASSES.flatMap((cc) => [
    portableTablePath(contentClassIndexPath(cc, 'owner')),
    portableTablePath(contentClassIndexPath(cc, 'public'))
  ])
];

/** Copy owner/public index table blobs (preserves per-file backend references). */
export async function copyIndexTables(opts: IndexCopyOptions): Promise<MigrationReport> {
  const srcPrefix = normalizePrefix(opts.sourcePrefix);
  const destPrefix = normalizePrefix(opts.destPrefix);

  let report = createEmptyMigrationReport(opts.jobId);
  for (const rel of INDEX_PATHS) {
    const srcKey = `${srcPrefix}${rel}`;
    try {
      const data = await opts.sourceStore.get(srcKey);
      if (!data) {
        report = recordMigrationOutcome(report, rel, 'skipped');
        continue;
      }
      await opts.destStore.put(`${destPrefix}${rel}`, data, { contentType: 'application/octet-stream' });
      report = recordMigrationOutcome(report, rel, 'migrated', { bytes: data.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report = recordMigrationOutcome(report, rel, 'failed', { error: msg });
    }
  }
  return finalizeMigrationReport(report);
}
