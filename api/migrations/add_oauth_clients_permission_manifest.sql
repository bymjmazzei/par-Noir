-- L5 integrator permission manifest (consent copy + operator review)
ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS permission_manifest JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb;
