-- OAuth clients (persistent registry; seeded by app on init)
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  redirect_uris JSONB NOT NULL DEFAULT '[]'::jsonb,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  client_secret_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_is_active ON oauth_clients(is_active) WHERE is_active = true;

-- API keys for /api/v1 (hashed at rest)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_id VARCHAR(255) NOT NULL,
  owner_type VARCHAR(32) NOT NULL DEFAULT 'pn_user',
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activated_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  verification_id VARCHAR(255),
  scopes TEXT[] NOT NULL DEFAULT ARRAY['oauth', 'data_points', 'content']::TEXT[],
  requests_per_minute INT NOT NULL DEFAULT 60,
  requests_per_day INT NOT NULL DEFAULT 10000
);

CREATE INDEX IF NOT EXISTS idx_api_keys_pn_id ON api_keys(pn_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active) WHERE is_active = true;
