import type { BlobStore } from '@par-noir/user-owned-storage';
import { JSON_BLOB_PATHS, metadataPath } from '@par-noir/user-owned-storage';
import {
  createEmptyMigrationReport,
  finalizeMigrationReport,
  recordMigrationOutcome,
  type MigrationReport
} from './migrationReport.js';

export const SOCIAL_CLOUD_JSON_PATHS = [
  JSON_BLOB_PATHS.profile,
  JSON_BLOB_PATHS.preferences,
  JSON_BLOB_PATHS.devicePolicy,
  metadataPath('social-cloud-migration.json')
];

export interface JsonBlobCopyOptions {
  jobId: string;
  sourceStore: BlobStore;
  destStore: BlobStore;
  sourcePrefix: string;
  destPrefix: string;
  paths?: string[];
}

function normalizePrefix(p: string): string {
  return p.endsWith('/') ? p : `${p}/`;
}

/** Copy known JSON blobs from source to destination. */
export async function copyJsonBlobs(opts: JsonBlobCopyOptions): Promise<MigrationReport> {
  const srcPrefix = normalizePrefix(opts.sourcePrefix);
  const destPrefix = normalizePrefix(opts.destPrefix);
  const paths = opts.paths ?? SOCIAL_CLOUD_JSON_PATHS;

  let report = createEmptyMigrationReport(opts.jobId);
  for (const rel of paths) {
    const srcKey = `${srcPrefix}${rel}`;
    try {
      const data = await opts.sourceStore.get(srcKey);
      if (!data) {
        report = recordMigrationOutcome(report, rel, 'skipped');
        continue;
      }
      await opts.destStore.put(`${destPrefix}${rel}`, data, { contentType: 'application/json' });
      report = recordMigrationOutcome(report, rel, 'migrated', { bytes: data.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report = recordMigrationOutcome(report, rel, 'failed', { error: msg });
    }
  }
  return finalizeMigrationReport(report);
}
