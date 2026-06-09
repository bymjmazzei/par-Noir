-- Integrator webhook subscriptions for data-point and other L5 events
CREATE TABLE IF NOT EXISTS integrator_webhook_subscriptions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  client_id VARCHAR(255) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrator_webhook_subs_client
  ON integrator_webhook_subscriptions(client_id);

CREATE INDEX IF NOT EXISTS idx_integrator_webhook_subs_active
  ON integrator_webhook_subscriptions(client_id, is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS integrator_webhook_events (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  client_id VARCHAR(255) NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrator_webhook_events_client
  ON integrator_webhook_events(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integrator_webhook_deliveries (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  subscription_id TEXT NOT NULL REFERENCES integrator_webhook_subscriptions(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES integrator_webhook_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  response_code INTEGER,
  response_body TEXT,
  next_retry_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrator_webhook_deliveries_pending
  ON integrator_webhook_deliveries(status, next_retry_at)
  WHERE status = 'pending';
