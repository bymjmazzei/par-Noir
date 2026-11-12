-- The ML-DSA-65 key a pN's handle receipts name (receipts v2). Registered with a root-signed
-- statement; content signed by this key is attributed to the pN's handles.
CREATE TABLE IF NOT EXISTS pn_signing_keys (
  pn_identifier VARCHAR(255) PRIMARY KEY,
  signing_public_key TEXT NOT NULL,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- v1 receipts named the owner pN; v2 names the signing key. No users yet, so drop the v1 log.
DELETE FROM public_name_receipts WHERE (receipt->>'v')::int = 1;
UPDATE public_names SET receipt_hash = NULL
  WHERE receipt_hash IS NOT NULL
    AND receipt_hash NOT IN (SELECT receipt_hash FROM public_name_receipts);
