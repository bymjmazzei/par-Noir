-- Migration: Add Bot Detection and Verification Tracking
-- Adds bot detection columns to engagement table and creates supporting tables

-- Add bot detection columns to engagement table
DO $$
BEGIN
  -- Add is_verified column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='engagement' AND column_name='is_verified') THEN
    ALTER TABLE engagement ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add bot_score column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='engagement' AND column_name='bot_score') THEN
    ALTER TABLE engagement ADD COLUMN bot_score DECIMAL(3,2) DEFAULT 0.0;
  END IF;

  -- Add engagement_quality_score column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='engagement' AND column_name='engagement_quality_score') THEN
    ALTER TABLE engagement ADD COLUMN engagement_quality_score DECIMAL(3,2) DEFAULT 1.0;
  END IF;
END $$;

-- Create indexes for efficient bot detection queries
CREATE INDEX IF NOT EXISTS idx_engagement_verified 
ON engagement(file_id, type, is_verified) 
WHERE is_verified = TRUE;

CREATE INDEX IF NOT EXISTS idx_engagement_bot_score 
ON engagement(file_id, bot_score) 
WHERE bot_score < 0.5;

CREATE INDEX IF NOT EXISTS idx_engagement_user_bot_score
ON engagement(user_did, bot_score, created_at);

-- Create verified_identities table for quick verification lookup
CREATE TABLE IF NOT EXISTS verified_identities (
  identity_id VARCHAR(255) PRIMARY KEY,
  verification_id VARCHAR(255) NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  verification_level VARCHAR(20) DEFAULT 'verified'
);

-- Create index on verified_identities for active verifications
CREATE INDEX IF NOT EXISTS idx_verified_identities_active 
ON verified_identities(identity_id, is_active) 
WHERE is_active = TRUE;

-- Create file_views table for viewing behavior tracking
CREATE TABLE IF NOT EXISTS file_views (
  view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id VARCHAR(255) NOT NULL,
  user_did VARCHAR(255) NOT NULL,
  view_duration DECIMAL(10,2), -- seconds
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index for conflict resolution (one view per file per user per UTC day)
-- Note: use an immutable UTC day bucket expression to avoid timestamptz/date mutability issues.
CREATE UNIQUE INDEX IF NOT EXISTS file_views_file_user_date_unique 
ON file_views(file_id, user_did, DATE_TRUNC('day', viewed_at AT TIME ZONE 'UTC'));

-- Create indexes for file_views
CREATE INDEX IF NOT EXISTS idx_file_views_user_did 
ON file_views(user_did, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_file_views_file_id 
ON file_views(file_id);

CREATE INDEX IF NOT EXISTS idx_file_views_user_file
ON file_views(user_did, file_id, viewed_at DESC);

-- Create user_sessions table for session pattern analysis
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_did VARCHAR(255) NOT NULL,
  session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_end TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Create index on user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_did 
ON user_sessions(user_did, session_start DESC);

