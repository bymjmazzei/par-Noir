import { getDatabasePool } from '../../utils/database';

export type MigrationJobType = 'social_cloud' | 'files';
export type MigrationJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StorageMigrationJobRow {
  job_id: string;
  pn_identifier: string;
  job_type: MigrationJobType;
  status: MigrationJobStatus;
  source_provider: string | null;
  source_account_id: string | null;
  dest_provider: string | null;
  dest_account_id: string | null;
  progress_json: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export async function createMigrationJob(params: {
  pnIdentifier: string;
  jobType: MigrationJobType;
  sourceProvider?: string;
  sourceAccountId?: string;
  destProvider?: string;
  destAccountId?: string;
  progress?: Record<string, unknown>;
}): Promise<string> {
  const db = getDatabasePool();
  const result = await db.query(
    `INSERT INTO storage_migration_jobs (
      pn_identifier, job_type, status, source_provider, source_account_id,
      dest_provider, dest_account_id, progress_json
    ) VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)
    RETURNING job_id`,
    [
      params.pnIdentifier,
      params.jobType,
      params.sourceProvider ?? null,
      params.sourceAccountId ?? null,
      params.destProvider ?? null,
      params.destAccountId ?? null,
      JSON.stringify(params.progress ?? {})
    ]
  );
  return result.rows[0].job_id as string;
}

export async function getMigrationJob(jobId: string): Promise<StorageMigrationJobRow | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT * FROM storage_migration_jobs WHERE job_id = $1`,
    [jobId]
  );
  return (result.rows[0] as StorageMigrationJobRow) ?? null;
}

export async function updateMigrationJob(
  jobId: string,
  updates: {
    status?: MigrationJobStatus;
    progress?: Record<string, unknown>;
    completedAt?: string;
  }
): Promise<void> {
  const db = getDatabasePool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (updates.status) {
    sets.push(`status = $${i++}`);
    vals.push(updates.status);
  }
  if (updates.progress) {
    sets.push(`progress_json = $${i++}`);
    vals.push(JSON.stringify(updates.progress));
  }
  if (updates.completedAt) {
    sets.push(`completed_at = $${i++}`);
    vals.push(updates.completedAt);
  }
  if (sets.length === 0) return;
  vals.push(jobId);
  await db.query(
    `UPDATE storage_migration_jobs SET ${sets.join(', ')} WHERE job_id = $${i}`,
    vals
  );
}

/** File IDs listed in active file migration jobs (skip orphan cleanup while migrating). */
export async function getActiveFileMigrationFileIds(): Promise<Set<string>> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT progress_json FROM storage_migration_jobs
     WHERE job_type = 'files' AND status IN ('pending', 'running')`
  );
  const ids = new Set<string>();
  for (const row of result.rows) {
    const progress =
      typeof row.progress_json === 'string'
        ? JSON.parse(row.progress_json)
        : row.progress_json ?? {};
    const fileIds = progress.fileIds;
    if (Array.isArray(fileIds)) {
      for (const id of fileIds) {
        if (typeof id === 'string' && id.trim()) ids.add(id.trim());
      }
    }
    const results = progress.results;
    if (Array.isArray(results)) {
      for (const r of results) {
        if (r && typeof r.fileId === 'string' && r.fileId.trim()) ids.add(r.fileId.trim());
      }
    }
  }
  return ids;
}

export async function isCompletedSocialCloudMigrationJob(
  jobId: string,
  pnIdentifier: string,
  destProvider: string,
  destAccountId?: string
): Promise<boolean> {
  const job = await getMigrationJob(jobId);
  if (!job) return false;
  if (job.pn_identifier !== pnIdentifier) return false;
  if (job.job_type !== 'social_cloud') return false;
  if (job.status !== 'completed') return false;
  if (job.dest_provider !== destProvider) return false;
  if (destAccountId && job.dest_account_id && job.dest_account_id !== destAccountId) {
    return false;
  }
  return true;
}
