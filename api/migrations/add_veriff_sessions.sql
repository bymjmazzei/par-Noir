-- Veriff sessions (one row per Station session) + one-person-one-pN document guard.
CREATE TABLE IF NOT EXISTS veriff_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  pn_identifier VARCHAR(255) NOT NULL,
  session_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  decision_code INTEGER,
  cost_recorded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_veriff_sessions_pn_created
  ON veriff_sessions(pn_identifier, created_at DESC);

ALTER TABLE IF EXISTS verified_identities ADD COLUMN IF NOT EXISTS document_hmac VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_identities_document_hmac
  ON verified_identities(document_hmac)
  WHERE is_active = TRUE AND document_hmac IS NOT NULL;
