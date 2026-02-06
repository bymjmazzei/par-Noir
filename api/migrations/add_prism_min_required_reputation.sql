-- Migration: Add min_required_reputation to prism_review_queue
-- For escalation: 3 skips or tiebreaker (1 approve, 1 deny) require higher-rep Rays

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'prism_review_queue' AND column_name = 'min_required_reputation') THEN
    ALTER TABLE prism_review_queue ADD COLUMN min_required_reputation INT DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prism_review_queue_min_rep ON prism_review_queue(min_required_reputation)
WHERE min_required_reputation IS NOT NULL;
