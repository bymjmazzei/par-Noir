-- Migration: Add feed tokens table
-- Stores encrypted pnName and passcode tokens for feeds (owned by creator's pN)

CREATE TABLE IF NOT EXISTS feed_tokens (
  feed_id VARCHAR(255) PRIMARY KEY,
  owner_pn_identifier VARCHAR(255) NOT NULL,
  encrypted_pn_name TEXT NOT NULL, -- Encrypted pnName token
  encrypted_passcode TEXT NOT NULL, -- Encrypted passcode token
  public_key TEXT NOT NULL, -- Public key for the feed sub-pN
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_tokens_owner_pn ON feed_tokens(owner_pn_identifier);

