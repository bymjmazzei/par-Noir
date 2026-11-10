-- Veriff: the server keeps no pN-to-session link and no identity data.
-- veriff_billed_sessions books Veriff's charge once per session (no pN column).
-- verified_identities is only "pN verified until expires_at"; the person data lives in the
-- user-held credential.
CREATE TABLE IF NOT EXISTS veriff_billed_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  billed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS verified_identities ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

DROP INDEX IF EXISTS idx_verified_identities_document_hmac;
ALTER TABLE IF EXISTS verified_identities DROP COLUMN IF EXISTS document_hmac;
ALTER TABLE IF EXISTS verified_identities DROP COLUMN IF EXISTS legal_name_hmac;

DROP TABLE IF EXISTS veriff_sessions;
