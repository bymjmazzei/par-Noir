-- Owned-asset registry: root human pN + optional subject + kind + links to feature rows
CREATE TABLE IF NOT EXISTS pn_owned_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_pn_identifier VARCHAR(255) NOT NULL,
  subject_pn_identifier VARCHAR(255),
  kind VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE
);
-- Sub-principals should use unique subject_pn_identifier; human api_key rows may share subject or leave null (app-enforced)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pn_owned_assets_subject_unique
  ON pn_owned_assets(subject_pn_identifier)
  WHERE subject_pn_identifier IS NOT NULL AND kind <> 'api_key';

CREATE INDEX IF NOT EXISTS idx_pn_owned_assets_root ON pn_owned_assets(root_pn_identifier);
CREATE INDEX IF NOT EXISTS idx_pn_owned_assets_kind ON pn_owned_assets(kind);
CREATE INDEX IF NOT EXISTS idx_pn_owned_assets_status ON pn_owned_assets(status) WHERE status = 'active';

-- Per-asset delegations (delegatee is either a pN or an OAuth client id)
CREATE TABLE IF NOT EXISTS pn_asset_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owned_asset_id UUID NOT NULL REFERENCES pn_owned_assets(id) ON DELETE CASCADE,
  delegatee_pn_identifier VARCHAR(255),
  delegatee_client_id VARCHAR(255),
  scope TEXT NOT NULL DEFAULT '*',
  expires_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT pn_asset_delegations_one_delegatee CHECK (
    (delegatee_pn_identifier IS NOT NULL AND delegatee_client_id IS NULL)
    OR (delegatee_pn_identifier IS NULL AND delegatee_client_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pn_asset_delegations_asset ON pn_asset_delegations(owned_asset_id);
CREATE INDEX IF NOT EXISTS idx_pn_asset_delegations_delegatee_pn ON pn_asset_delegations(delegatee_pn_identifier)
  WHERE delegatee_pn_identifier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pn_asset_delegations_delegatee_client ON pn_asset_delegations(delegatee_client_id)
  WHERE delegatee_client_id IS NOT NULL;

-- Optional: latest IPFS manifest CID per root (reconciliation / pointer)
CREATE TABLE IF NOT EXISTS pn_ipfs_manifest_pointers (
  root_pn_identifier VARCHAR(255) PRIMARY KEY,
  latest_metadata_cid VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link api_keys to registry (nullable for legacy rows until backfill)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS root_pn_id VARCHAR(255);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS owned_asset_id UUID REFERENCES pn_owned_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_root_pn_id ON api_keys(root_pn_id) WHERE root_pn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_owned_asset_id ON api_keys(owned_asset_id) WHERE owned_asset_id IS NOT NULL;
