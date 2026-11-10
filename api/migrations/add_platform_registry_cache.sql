-- Platform registry: developer applications, OAuth clients and commercial licenses live in Postgres.

ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commercial_license_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS registry_source VARCHAR(32) DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS registry_status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS registry_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_oauth_clients_verified ON oauth_clients(verified) WHERE verified = true;

CREATE TABLE IF NOT EXISTS platform_commercial_licenses (
  license_id VARCHAR(128) PRIMARY KEY,
  grantee_pn_id VARCHAR(255) NOT NULL,
  grantee_client_id VARCHAR(255),
  tier VARCHAR(32) NOT NULL DEFAULT 'commercial',
  license_type VARCHAR(32) NOT NULL DEFAULT 'annual',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  requests_per_minute INT NOT NULL DEFAULT 60,
  requests_per_day INT NOT NULL DEFAULT 10000,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_licenses_grantee_pn ON platform_commercial_licenses(grantee_pn_id);
CREATE INDEX IF NOT EXISTS idx_platform_licenses_grantee_client ON platform_commercial_licenses(grantee_client_id)
  WHERE grantee_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_licenses_active ON platform_commercial_licenses(status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS platform_applications (
  application_id VARCHAR(128) PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL,
  owner_pn_id VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  application JSONB NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_applications_owner ON platform_applications(owner_pn_id);
CREATE INDEX IF NOT EXISTS idx_platform_applications_client ON platform_applications(client_id);

DROP TABLE IF EXISTS platform_registry_sync_meta;
