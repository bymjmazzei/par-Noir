import { INTEGRATORS_DIR, MESSAGES_DIR, METADATA_DIR, type BlobStore } from '@par-noir/user-owned-storage';
import {
  createEmptyMigrationReport,
  finalizeMigrationReport,
  recordMigrationOutcome,
  type MigrationItemResult,
  type MigrationReport
} from './migrationReport.js';

/** Everything a social cloud holds besides owned file blobs. */
export const SOCIAL_CLOUD_PREFIXES = [`${METADATA_DIR}/`, `${MESSAGES_DIR}/`, `${INTEGRATORS_DIR}/`] as const;

/** Encrypted file blobs stay with the backend the owner index names. */
export function isOwnedFileBlob(relativeKey: string): boolean {
  return relativeKey.endsWith('.encrypted');
}

export interface PortableCopyOptions {
  jobId: string;
  sourceStore: BlobStore;
  destStore: BlobStore;
  sourcePrefix: string;
  destPrefix: string;
  prefixes?: readonly string[];
  onItem?: (item: MigrationItemResult) => void;
}

function normalizePrefix(p: string): string {
  return p.endsWith('/') ? p : `${p}/`;
}

/** Byte-copy the social layout from one portable cloud to another. */
export async function copyPortableSocialCloudBlobs(
  opts: PortableCopyOptions
): Promise<MigrationReport> {
  const srcPrefix = normalizePrefix(opts.sourcePrefix);
  const destPrefix = normalizePrefix(opts.destPrefix);
  const prefixes = opts.prefixes ?? SOCIAL_CLOUD_PREFIXES;

  let report = createEmptyMigrationReport(opts.jobId);
  const record = (rel: string, outcome: MigrationItemResult['outcome'], extra?: { error?: string; bytes?: number }) => {
    report = recordMigrationOutcome(report, rel, outcome, extra);
    opts.onItem?.(report.items[report.items.length - 1]);
  };

  for (const prefix of prefixes) {
    const entries = await opts.sourceStore.list(`${srcPrefix}${prefix}`);
    for (const entry of entries) {
      const rel = entry.key.startsWith(srcPrefix) ? entry.key.slice(srcPrefix.length) : entry.key;
      if (isOwnedFileBlob(rel)) continue;
      try {
        const data = await opts.sourceStore.get(entry.key);
        if (!data) {
          record(rel, 'skipped');
          continue;
        }
        await opts.destStore.put(`${destPrefix}${rel}`, data, { contentType: 'application/octet-stream' });
        record(rel, 'migrated', { bytes: data.length });
      } catch (err) {
        record(rel, 'failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return finalizeMigrationReport(report);
}
