-- IANA zone used when computing window boundaries (non-UTC); see CREATOR_FUND_PERIOD_TZ.
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS period_tz TEXT;
