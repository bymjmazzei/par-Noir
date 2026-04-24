-- Music allocation buckets + optional GCP KMS signature on closed fund periods.

ALTER TABLE creator_fund_period_creator_allocations DROP CONSTRAINT IF EXISTS creator_fund_period_creator_allocations_bucket_check;
ALTER TABLE creator_fund_period_creator_allocations ADD CONSTRAINT creator_fund_period_creator_allocations_bucket_check CHECK (
  bucket IN ('verified', 'unverified', 'music_verified', 'music_unverified')
);

ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS period_attestation_kms_signature TEXT;
ALTER TABLE creator_fund_periods ADD COLUMN IF NOT EXISTS period_attestation_kms_key_version TEXT;
