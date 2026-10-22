-- Which kind of OAuth client a row is. 'agent_connector' rows come only from dynamic client
-- registration (POST /oauth/register) by hosted AI apps, and only ever sign in AI agent sub-pNs.
ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS client_type VARCHAR(32) NOT NULL DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_oauth_clients_agent_connector
  ON oauth_clients(client_id) WHERE client_type = 'agent_connector';
