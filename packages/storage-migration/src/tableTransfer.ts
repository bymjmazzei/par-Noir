import type { TableRow, TableSchema } from '@par-noir/user-owned-storage';
import {
  createEmptyMigrationReport,
  finalizeMigrationReport,
  recordMigrationOutcome,
  type MigrationReport
} from './migrationReport.js';

export interface TableTransferOps {
  scan: (schema: TableSchema) => Promise<TableRow[]>;
  replaceAll: (schema: TableSchema, rows: TableRow[], meta?: { updatedAt?: string }) => Promise<void>;
}

/** Read all rows from source and write to destination. */
export async function transferTable(
  jobId: string,
  artifactPath: string,
  schema: TableSchema,
  source: TableTransferOps,
  dest: TableTransferOps
): Promise<MigrationReport> {
  let report = createEmptyMigrationReport(jobId);
  try {
    const rows = await source.scan(schema);
    if (rows.length === 0) {
      return finalizeMigrationReport(
        recordMigrationOutcome(report, artifactPath, 'skipped')
      );
    }
    await dest.replaceAll(schema, rows);
    report = recordMigrationOutcome(report, artifactPath, 'migrated', {
      bytes: rows.length
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report = recordMigrationOutcome(report, artifactPath, 'failed', { error: msg });
  }
  return finalizeMigrationReport(report);
}

export function mergeMigrationReports(jobId: string, reports: MigrationReport[]): MigrationReport {
  const merged = createEmptyMigrationReport(jobId);
  let result = merged;
  for (const r of reports) {
    for (const item of r.items) {
      result = recordMigrationOutcome(result, item.path, item.outcome, {
        error: item.error,
        bytes: item.bytes
      });
    }
  }
  return finalizeMigrationReport(result);
}
