import type { BlobStore } from '@par-noir/user-owned-storage';
import { METADATA_DIR } from '@par-noir/user-owned-storage';
import {
  createEmptyMigrationReport,
  finalizeMigrationReport,
  recordMigrationOutcome,
  type MigrationReport
} from './migrationReport.js';

export interface TableCopyOptions {
  jobId: string;
  sourceStore: BlobStore;
  destStore: BlobStore;
  sourcePrefix: string;
  destPrefix: string;
}

function normalizePrefix(p: string): string {
  return p.endsWith('/') ? p : `${p}/`;
}

/** Copy portable `.db` table blobs under `_metadata/`. */
export async function copyPortableTables(opts: TableCopyOptions): Promise<MigrationReport> {
  const srcPrefix = normalizePrefix(opts.sourcePrefix);
  const destPrefix = normalizePrefix(opts.destPrefix);
  const metaPrefix = `${srcPrefix}${METADATA_DIR}`;

  let report = createEmptyMigrationReport(opts.jobId);
  const entries = await opts.sourceStore.list(metaPrefix);

  for (const entry of entries) {
    const rel = entry.key.startsWith(srcPrefix)
      ? entry.key.slice(srcPrefix.length)
      : entry.key;
    if (!rel.endsWith('.db')) {
      report = recordMigrationOutcome(report, rel, 'skipped');
      continue;
    }
    try {
      const data = await opts.sourceStore.get(entry.key);
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
