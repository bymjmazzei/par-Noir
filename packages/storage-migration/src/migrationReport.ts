export type MigrationOutcome = 'migrated' | 'patched' | 'failed' | 'skipped';

export interface MigrationItemResult {
  path: string;
  outcome: MigrationOutcome;
  error?: string;
  bytes?: number;
}

export interface MigrationReport {
  jobId: string;
  startedAt: string;
  completedAt?: string;
  items: MigrationItemResult[];
  totals: {
    migrated: number;
    failed: number;
    skipped: number;
    bytes: number;
  };
}

export function createEmptyMigrationReport(jobId: string): MigrationReport {
  return {
    jobId,
    startedAt: new Date().toISOString(),
    items: [],
    totals: { migrated: 0, failed: 0, skipped: 0, bytes: 0 }
  };
}

export function recordMigrationOutcome(
  report: MigrationReport,
  path: string,
  outcome: MigrationOutcome,
  opts?: { error?: string; bytes?: number }
): MigrationReport {
  const item: MigrationItemResult = { path, outcome, error: opts?.error, bytes: opts?.bytes };
  const items = [...report.items, item];
  const totals = { ...report.totals };
  if (outcome === 'migrated' || outcome === 'patched') {
    totals.migrated += 1;
    totals.bytes += opts?.bytes ?? 0;
  } else if (outcome === 'failed') {
    totals.failed += 1;
  } else {
    totals.skipped += 1;
  }
  return { ...report, items, totals };
}

export function finalizeMigrationReport(report: MigrationReport): MigrationReport {
  return { ...report, completedAt: new Date().toISOString() };
}
