-- Migration: Add feed tokens table
-- Stores the encrypted synthetic Key 1 / Key 2 for each feed sub-pN (owned by creator's pN)

CREATE TABLE IF NOT EXISTS feed_tokens (
  feed_id VARCHAR(255) PRIMARY KEY,
  owner_pn_identifier VARCHAR(255) NOT NULL,
  encrypted_key1 TEXT NOT NULL, -- Encrypted synthetic Key 1
  encrypted_key2 TEXT NOT NULL, -- Encrypted synthetic Key 2
  public_key TEXT NOT NULL, -- Public key for the feed sub-pN
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_tokens_owner_pn ON feed_tokens(owner_pn_identifier);

