-- Opaque cross-cloud drops: address by route_key instead of clear recipient pn.

ALTER TABLE social_mailbox
  ADD COLUMN IF NOT EXISTS route_key TEXT;

CREATE INDEX IF NOT EXISTS idx_social_mailbox_route_pending
  ON social_mailbox (route_key, created_at ASC)
  WHERE acked_at IS NULL;

-- Legacy clear recipient column becomes optional (new rows use route_key only).
ALTER TABLE social_mailbox
  ALTER COLUMN recipient_identity_id DROP NOT NULL;
