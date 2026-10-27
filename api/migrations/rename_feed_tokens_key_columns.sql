-- Rename feed_tokens synthetic credential columns to key1 / key2. Safe to run repeatedly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feed_tokens' AND column_name = 'encrypted_pn_name'
  ) THEN
    ALTER TABLE feed_tokens RENAME COLUMN encrypted_pn_name TO encrypted_key1;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feed_tokens' AND column_name = 'encrypted_passcode'
  ) THEN
    ALTER TABLE feed_tokens RENAME COLUMN encrypted_passcode TO encrypted_key2;
  END IF;
END $$;
