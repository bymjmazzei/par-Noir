import type { BlobStore } from '@par-noir/user-owned-storage';
import {
  createEmptyMigrationReport,
  finalizeMigrationReport,
  recordMigrationOutcome,
  type MigrationReport
} from './migrationReport.js';

export interface PortableCopyOptions {
  jobId: string;
  sourceStore: BlobStore;
  destStore: BlobStore;
  sourcePrefix: string;
  destPrefix: string;
  /** Only copy keys under this relative prefix (e.g. `_metadata/`) */
  filterPrefix?: string;
}

function normalizePrefix(p: string): string {
  return p.endsWith('/') ? p : `${p}/`;
}

/**
 * Byte-copy blobs from source to destination under metadata prefix.
 */
export async function copyPortableSocialCloudBlobs(
  opts: PortableCopyOptions
): Promise<MigrationReport> {
  const srcPrefix = normalizePrefix(opts.sourcePrefix);
  const destPrefix = normalizePrefix(opts.destPrefix);
  const filter = opts.filterPrefix ?? '_metadata/';

  let report = createEmptyMigrationReport(opts.jobId);
  const entries = await opts.sourceStore.list(srcPrefix);

  for (const entry of entries) {
    const rel = entry.key.startsWith(srcPrefix)
      ? entry.key.slice(srcPrefix.length)
      : entry.key;
    if (!rel.startsWith(filter)) {
      report = recordMigrationOutcome(report, rel, 'skipped');
      continue;
    }
    try {
      const data = await opts.sourceStore.get(entry.key);
      if (!data) {
        report = recordMigrationOutcome(report, rel, 'skipped');
        continue;
      }
      const destKey = `${destPrefix}${rel}`;
      await opts.destStore.put(destKey, data, { contentType: 'application/octet-stream' });
      report = recordMigrationOutcome(report, rel, 'migrated', { bytes: data.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report = recordMigrationOutcome(report, rel, 'failed', { error: msg });
    }
  }

  return finalizeMigrationReport(report);
}
