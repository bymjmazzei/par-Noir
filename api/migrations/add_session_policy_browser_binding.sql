-- Browser binding for refresh-token families (lock every app in one browser)
ALTER TABLE oauth_refresh_tokens
  ADD COLUMN IF NOT EXISTS browser_id TEXT;

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_browser_id
  ON oauth_refresh_tokens(browser_id);

-- Per-pN idle lock policy (not secret; read by every first-party app)
CREATE TABLE IF NOT EXISTS pn_session_policy (
  pn_identifier VARCHAR(255) PRIMARY KEY,
  idle_minutes INTEGER NOT NULL DEFAULT 60,
  trusted_device BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
