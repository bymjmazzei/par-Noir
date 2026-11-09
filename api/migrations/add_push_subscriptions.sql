-- Content-free push targets (Web Push endpoints and FCM tokens).
-- Kept across lock; removed on unsubscribe, device revoke, or a 404/410 from the push service.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_identifier VARCHAR(255) NOT NULL,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('web', 'fcm')),
  app_id VARCHAR(32) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  platform VARCHAR(16),
  device_id TEXT,
  browser_id TEXT,
  categories TEXT[] NOT NULL DEFAULT ARRAY['messages', 'social', 'security'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_success_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (pn_identifier, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_pn ON push_subscriptions(pn_identifier);
