-- Owner-signed AI agent delegation: the canonical statement (scopes, yes/no attestations,
-- expiry) and the root pN's ML-DSA signature over it. Attestations carry no raw values.
ALTER TABLE pn_owned_assets ADD COLUMN IF NOT EXISTS delegation_statement JSONB;
ALTER TABLE pn_owned_assets ADD COLUMN IF NOT EXISTS delegation_signature TEXT;
