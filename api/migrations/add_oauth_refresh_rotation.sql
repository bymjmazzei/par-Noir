ALTER TABLE oauth_refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id UUID,
  ADD COLUMN IF NOT EXISTS jti UUID,
  ADD COLUMN IF NOT EXISTS previous_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS replaced_by TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS reuse_detected_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_family_id
  ON oauth_refresh_tokens(family_id);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_used_at
  ON oauth_refresh_tokens(used_at);
