-- AI agent sub-pNs: the agent's ML-DSA public key ties its OAuth refresh tokens to the
-- owned asset, so revoking the agent can delete them.
ALTER TABLE pn_owned_assets ADD COLUMN IF NOT EXISTS subject_public_key TEXT;

CREATE INDEX IF NOT EXISTS idx_pn_owned_assets_ai_agent_subject
  ON pn_owned_assets(subject_pn_identifier)
  WHERE kind = 'ai_agent';
