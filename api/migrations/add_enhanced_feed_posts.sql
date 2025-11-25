-- Migration: Add Enhanced Feed Posts Support
-- Adds support for rich content posts with media, buttons, polls, and forms

-- Add new columns to feed_posts table for enhanced content
-- Note: If feed_posts table doesn't exist, create it first
-- If it exists with old schema, add these columns

-- Create feeds table if it doesn't exist (required for foreign key)
CREATE TABLE IF NOT EXISTS feeds (
  feed_id VARCHAR(255) PRIMARY KEY,
  feed_name VARCHAR(255) NOT NULL,
  feed_category VARCHAR(50),
  feed_description TEXT,
  creator_did VARCHAR(255) NOT NULL,
  creator_tier VARCHAR(50) DEFAULT 'free',
  branding JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  subscriber_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0
);

-- Check if feed_posts table exists, if not create it
CREATE TABLE IF NOT EXISTS feed_posts (
  post_id VARCHAR(255) PRIMARY KEY,
  feed_id VARCHAR(255) NOT NULL,
  file_id VARCHAR(255), -- Legacy: for file-based posts
  content TEXT, -- Rich text content (HTML)
  media JSONB, -- Array of media objects
  buttons JSONB, -- Array of button objects
  polls JSONB, -- Array of poll objects
  forms JSONB, -- Array of form objects
  is_top_post BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  added_at TIMESTAMP DEFAULT NOW(), -- Legacy: for file-based posts
  FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE
);

-- Add missing columns to feed_posts if table exists but columns don't
DO $$
BEGIN
  -- Add content column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='content') THEN
    ALTER TABLE feed_posts ADD COLUMN content TEXT;
  END IF;

  -- Add media column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='media') THEN
    ALTER TABLE feed_posts ADD COLUMN media JSONB;
  END IF;

  -- Add buttons column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='buttons') THEN
    ALTER TABLE feed_posts ADD COLUMN buttons JSONB;
  END IF;

  -- Add polls column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='polls') THEN
    ALTER TABLE feed_posts ADD COLUMN polls JSONB;
  END IF;

  -- Add forms column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='forms') THEN
    ALTER TABLE feed_posts ADD COLUMN forms JSONB;
  END IF;

  -- Add is_top_post column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='is_top_post') THEN
    ALTER TABLE feed_posts ADD COLUMN is_top_post BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='created_at') THEN
    ALTER TABLE feed_posts ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_posts' AND column_name='updated_at') THEN
    ALTER TABLE feed_posts ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- Create index for faster queries (only if column exists)
CREATE INDEX IF NOT EXISTS idx_feed_posts_feed_id ON feed_posts(feed_id);

-- Create index on is_top_post only if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='feed_posts' AND column_name='is_top_post') THEN
    CREATE INDEX IF NOT EXISTS idx_feed_posts_is_top_post ON feed_posts(is_top_post);
  END IF;
END $$;

-- Create index on created_at only if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='feed_posts' AND column_name='created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_feed_posts_created_at ON feed_posts(created_at DESC);
  END IF;
END $$;

-- Create feed_subscriptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS feed_subscriptions (
  subscription_id VARCHAR(255) PRIMARY KEY,
  feed_id VARCHAR(255) NOT NULL,
  user_did VARCHAR(255) NOT NULL,
  subscribed_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE,
  UNIQUE(feed_id, user_did)
);

-- Update feed_subscriptions table to support paid subscriptions
-- Add columns if they don't exist
DO $$ 
BEGIN
  -- Add billing_cycle column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='billing_cycle') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN billing_cycle VARCHAR(20) DEFAULT 'monthly';
  END IF;

  -- Add status column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='status') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;

  -- Add checkout_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='checkout_id') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN checkout_id VARCHAR(255);
  END IF;

  -- Add expires_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='expires_at') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN expires_at TIMESTAMP;
  END IF;

  -- Add next_billing_date column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='next_billing_date') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN next_billing_date TIMESTAMP;
  END IF;

  -- Add activated_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='activated_at') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN activated_at TIMESTAMP;
  END IF;

  -- Add cancelled_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='cancelled_at') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN cancelled_at TIMESTAMP;
  END IF;

  -- Add failed_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='failed_at') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN failed_at TIMESTAMP;
  END IF;

  -- Add expired_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='expired_at') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN expired_at TIMESTAMP;
  END IF;

  -- Add payment_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feed_subscriptions' AND column_name='payment_id') THEN
    ALTER TABLE feed_subscriptions ADD COLUMN payment_id VARCHAR(255);
  END IF;
END $$;

-- Update feeds table to support paid feeds
DO $$
BEGIN
  -- Add is_paid column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feeds' AND column_name='is_paid') THEN
    ALTER TABLE feeds ADD COLUMN is_paid BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add monthly_price column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feeds' AND column_name='monthly_price') THEN
    ALTER TABLE feeds ADD COLUMN monthly_price DECIMAL(10, 2);
  END IF;

  -- Add annual_price column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feeds' AND column_name='annual_price') THEN
    ALTER TABLE feeds ADD COLUMN annual_price DECIMAL(10, 2);
  END IF;

  -- Add subdomain column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='feeds' AND column_name='subdomain') THEN
    ALTER TABLE feeds ADD COLUMN subdomain VARCHAR(255);
  END IF;
END $$;

-- Create unique index on subdomain
CREATE UNIQUE INDEX IF NOT EXISTS idx_feeds_subdomain ON feeds(subdomain) WHERE subdomain IS NOT NULL;

