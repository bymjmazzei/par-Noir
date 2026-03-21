-- Device tokens for push notifications (FCM/APNs)
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_identifier VARCHAR(255) NOT NULL,
  device_token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(pn_identifier, device_token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_pn_identifier ON device_tokens(pn_identifier);
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform ON device_tokens(platform);
