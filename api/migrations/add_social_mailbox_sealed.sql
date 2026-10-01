-- Sealed throughway: idempotency is a hash, and the route binding can hold the
-- recipient's published ML-KEM key so senders seal without a clear pn column.

ALTER TABLE social_mailbox
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_social_mailbox_idempotency
  ON social_mailbox (route_key, job_type, idempotency_key);

ALTER TABLE mailbox_route_binding
  ADD COLUMN IF NOT EXISTS ml_kem_public_key TEXT;
