-- Opaque store-and-forward social jobs (device cloud custody).
-- No provider tokens in payload.

CREATE TABLE IF NOT EXISTS social_mailbox (
  id UUID PRIMARY KEY,
  recipient_identity_id TEXT NOT NULL,
  job_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  acked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_social_mailbox_recipient_pending
  ON social_mailbox (recipient_identity_id, created_at ASC)
  WHERE acked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_mailbox_expires
  ON social_mailbox (expires_at);
