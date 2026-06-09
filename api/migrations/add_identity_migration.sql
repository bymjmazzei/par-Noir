-- Identity re-key migration orchestration (client-driven, server tracks step acks)

CREATE TABLE IF NOT EXISTS pn_identity_migration (
  id VARCHAR(128) PRIMARY KEY,
  predecessor_pn_identifier VARCHAR(255) NOT NULL,
  successor_pn_identifier VARCHAR(255) NOT NULL,
  predecessor_did TEXT,
  successor_did TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  lineage_predecessor_proof TEXT,
  lineage_successor_proof TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pn_identity_migration_predecessor
  ON pn_identity_migration(predecessor_pn_identifier);

CREATE INDEX IF NOT EXISTS idx_pn_identity_migration_successor
  ON pn_identity_migration(successor_pn_identifier);

CREATE INDEX IF NOT EXISTS idx_pn_identity_migration_status
  ON pn_identity_migration(status);
