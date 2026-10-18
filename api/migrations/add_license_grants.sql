CREATE TABLE IF NOT EXISTS license_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(512) NOT NULL,
  seller_pn VARCHAR(255) NOT NULL,
  buyer_pn VARCHAR(255) NOT NULL,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('personal', 'commercial')),
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  stripe_payment_ref TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_proof',
  proof TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT license_grants_status_check CHECK (
    status IN ('pending_proof', 'active', 'revoked')
  )
);

CREATE INDEX IF NOT EXISTS idx_license_grants_buyer_asset
  ON license_grants(buyer_pn, asset_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_license_grants_buyer_asset_scope_active
  ON license_grants(buyer_pn, asset_id, scope)
  WHERE status IN ('pending_proof', 'active');
