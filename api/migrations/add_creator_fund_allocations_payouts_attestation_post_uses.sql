-- Per-creator bounty allocations, optional HMAC attestation on closed periods, Connect payout requests, post→registry track.

ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS period_attestation_hmac TEXT;

CREATE TABLE IF NOT EXISTS creator_fund_period_creator_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES creator_fund_periods(id) ON DELETE CASCADE,
  recipient_identity_id VARCHAR(255) NOT NULL,
  bucket VARCHAR(20) NOT NULL,
  engagement_units BIGINT NOT NULL DEFAULT 0,
  allocation_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT creator_fund_period_creator_allocations_bucket_check CHECK (
    bucket IN ('verified', 'unverified')
  ),
  CONSTRAINT uq_creator_fund_period_creator_alloc UNIQUE (period_id, recipient_identity_id, bucket)
);

CREATE INDEX IF NOT EXISTS idx_cf_period_creator_alloc_recipient
  ON creator_fund_period_creator_allocations(recipient_identity_id);

CREATE INDEX IF NOT EXISTS idx_cf_period_creator_alloc_period
  ON creator_fund_period_creator_allocations(period_id);

CREATE TABLE IF NOT EXISTS creator_fund_payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_identifier VARCHAR(255) NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  stripe_transfer_id TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT creator_fund_payout_requests_status_check CHECK (
    status IN ('processing', 'paid', 'failed', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS idx_creator_fund_payout_pn
  ON creator_fund_payout_requests(pn_identifier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_fund_payout_transfer
  ON creator_fund_payout_requests(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS music_registry_post_uses (
  post_file_id VARCHAR(512) PRIMARY KEY,
  registry_track_id UUID NOT NULL REFERENCES music_registry_tracks(id) ON DELETE RESTRICT,
  claimant_pn_identifier VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_registry_post_uses_track
  ON music_registry_post_uses(registry_track_id);
