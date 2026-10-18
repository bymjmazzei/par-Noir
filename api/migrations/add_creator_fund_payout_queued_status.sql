ALTER TABLE creator_fund_payout_requests DROP CONSTRAINT IF EXISTS creator_fund_payout_requests_status_check;
ALTER TABLE creator_fund_payout_requests ADD CONSTRAINT creator_fund_payout_requests_status_check CHECK (
  status IN ('queued', 'processing', 'paid', 'failed', 'reversed')
);
