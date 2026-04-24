-- Creator fund period close: G/E/R waterfall, 90/10 bounty split (fund slice), tamper-chain stub (no KMS).

ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS g_cents BIGINT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS e_cents BIGINT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS r_cents BIGINT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS platform_25_cents BIGINT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS fund_75_cents BIGINT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS bounty_verified_cents BIGINT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS bounty_unverified_cents BIGINT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS chain_prev_hash TEXT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS chain_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_fund_periods_closed_end
  ON creator_fund_periods(period_end)
  WHERE status = 'closed';

CREATE TABLE IF NOT EXISTS creator_fund_opex_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  category VARCHAR(80) NOT NULL,
  note TEXT,
  effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_fund_opex_effective
  ON creator_fund_opex_events(effective_at DESC);
