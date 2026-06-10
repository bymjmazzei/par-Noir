CREATE TABLE IF NOT EXISTS storage_migration_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_identifier TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('social_cloud', 'files')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  source_provider TEXT,
  source_account_id TEXT,
  dest_provider TEXT,
  dest_account_id TEXT,
  progress_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storage_migration_jobs_pn ON storage_migration_jobs (pn_identifier);
CREATE INDEX IF NOT EXISTS idx_storage_migration_jobs_status ON storage_migration_jobs (status);
