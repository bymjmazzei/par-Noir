-- Creator-fund crypto payouts (USDC on Base via Coinbase) next to Stripe Connect bank payouts.
-- Each payout row snapshots its rail and destination at request time, so changing the saved wallet
-- never redirects a payout that is already queued.
ALTER TABLE creator_fund_payout_requests
  ADD COLUMN IF NOT EXISTS payout_rail VARCHAR(32) NOT NULL DEFAULT 'stripe_connect';
ALTER TABLE creator_fund_payout_requests ADD COLUMN IF NOT EXISTS crypto_network VARCHAR(32);
ALTER TABLE creator_fund_payout_requests ADD COLUMN IF NOT EXISTS crypto_destination_address VARCHAR(128);
ALTER TABLE creator_fund_payout_requests ADD COLUMN IF NOT EXISTS crypto_transaction_id VARCHAR(128);

ALTER TABLE creator_fund_payout_requests DROP CONSTRAINT IF EXISTS creator_fund_payout_requests_rail_check;
ALTER TABLE creator_fund_payout_requests ADD CONSTRAINT creator_fund_payout_requests_rail_check CHECK (
  payout_rail IN ('stripe_connect', 'coinbase')
  AND (payout_rail <> 'coinbase' OR (crypto_network IS NOT NULL AND crypto_destination_address IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS creator_fund_crypto_destinations (
  pn_identifier VARCHAR(255) PRIMARY KEY,
  network VARCHAR(32) NOT NULL,
  address VARCHAR(128) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
