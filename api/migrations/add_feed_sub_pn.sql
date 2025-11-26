-- Migration: Add sub-pN support for feeds
-- Feeds get their own sub-pN identifier with owner set to creator's pN

-- Add sub-pN identifier and owner pN identifier columns
DO $$
BEGIN
  -- Add sub_pn_identifier column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feeds' AND column_name='sub_pn_identifier') THEN
    ALTER TABLE feeds ADD COLUMN sub_pn_identifier VARCHAR(255);
  END IF;

  -- Add owner_pn_identifier column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feeds' AND column_name='owner_pn_identifier') THEN
    ALTER TABLE feeds ADD COLUMN owner_pn_identifier VARCHAR(255);
  END IF;

  -- Add status column if it doesn't exist (pending_verification, active, inactive)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feeds' AND column_name='status') THEN
    ALTER TABLE feeds ADD COLUMN status VARCHAR(50) DEFAULT 'pending_verification';
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_feeds_sub_pn_identifier ON feeds(sub_pn_identifier);
CREATE INDEX IF NOT EXISTS idx_feeds_owner_pn_identifier ON feeds(owner_pn_identifier);
CREATE INDEX IF NOT EXISTS idx_feeds_status ON feeds(status);

