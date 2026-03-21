-- Identity succession (dead predecessor pN on par Noir network) + optional audit trail

CREATE TABLE IF NOT EXISTS pn_identity_succession (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_pn_identifier VARCHAR(255) NOT NULL UNIQUE,
  successor_pn_identifier VARCHAR(255) NOT NULL,
  predecessor_did TEXT,
  successor_did TEXT,
  effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  migration_id VARCHAR(128),
  reason VARCHAR(64) NOT NULL DEFAULT 'recovery',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pn_succession_successor
  ON pn_identity_succession(successor_pn_identifier);

CREATE INDEX IF NOT EXISTS idx_pn_succession_predecessor_did
  ON pn_identity_succession(predecessor_did)
  WHERE predecessor_did IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  actor_hint VARCHAR(255),
  subject_pn_identifier VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_type_created
  ON audit_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_subject_created
  ON audit_events(subject_pn_identifier, created_at DESC);
