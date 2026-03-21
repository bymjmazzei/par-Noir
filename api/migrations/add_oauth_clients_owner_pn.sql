-- Link OAuth clients registered via developer portal to the registering pN identifier
ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS owner_pn_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_owner_pn_id ON oauth_clients(owner_pn_id)
  WHERE owner_pn_id IS NOT NULL;
