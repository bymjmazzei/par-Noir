-- Creator fund: monetization maintenance (Stripe) + internal balance + revenue events + Connect stub + fund periods (allocator).

CREATE TABLE IF NOT EXISTS monetization_subscriptions (
  pn_identifier VARCHAR(255) PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monetization_subscriptions_stripe_sub
  ON monetization_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS creator_fund_balances (
  pn_identifier VARCHAR(255) PRIMARY KEY,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_fund_revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_identifier VARCHAR(255) NOT NULL,
  source VARCHAR(32) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  stripe_event_id TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_fund_revenue_pn_created
  ON creator_fund_revenue_events(pn_identifier, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_fund_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_identifier VARCHAR(255) NOT NULL,
  delta_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  reason VARCHAR(64) NOT NULL,
  ref_type VARCHAR(40),
  ref_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_fund_ledger_pn_created
  ON creator_fund_ledger_entries(pn_identifier, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_fund_connect_accounts (
  pn_identifier VARCHAR(255) PRIMARY KEY,
  stripe_account_id TEXT NOT NULL,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  details_submitted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_fund_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_fund_periods_status
  ON creator_fund_periods(status, period_end DESC);
