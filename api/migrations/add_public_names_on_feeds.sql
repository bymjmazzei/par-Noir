-- Public names on feeds: personal feed per pN, handle registry with proof ladder,
-- protected names, disputes, transfers, signed receipts, verified legal-name hook.

-- Feeds: owner + sub-pN columns (also in add_feed_sub_pn.sql), personal tier, verified label.
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS sub_pn_identifier VARCHAR(255);
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS owner_pn_identifier VARCHAR(255);
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending_verification';
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS verified_display_name VARCHAR(255);
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_feeds_one_personal_per_owner
  ON feeds (owner_pn_identifier) WHERE creator_tier = 'personal';
CREATE INDEX IF NOT EXISTS idx_feeds_sub_pn_identifier ON feeds (sub_pn_identifier);
CREATE INDEX IF NOT EXISTS idx_feeds_owner_pn_identifier ON feeds (owner_pn_identifier);

-- Handles live in public_names; feed subdomains were a second namespace.
DROP INDEX IF EXISTS idx_feeds_subdomain;
ALTER TABLE feeds DROP COLUMN IF EXISTS subdomain;

-- Handle registry columns.
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS feed_id TEXT;
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS skeleton VARCHAR(255);
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS strength SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS priority_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS released_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS proof_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public_names ADD COLUMN IF NOT EXISTS receipt_hash VARCHAR(128);

UPDATE public_names SET priority_at = created_at WHERE priority_at IS NULL;
UPDATE public_names SET strength = CASE proof_type WHEN 'dns' THEN 3 WHEN 'youtube' THEN 2 ELSE 1 END;
UPDATE public_names SET skeleton = public_name WHERE skeleton IS NULL;

-- One holder per name (listed or frozen in a dispute), compared by confusable skeleton.
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_names_held_skeleton
  ON public_names (skeleton) WHERE status IN ('listed', 'disputed');
-- One active first-come claim per pN.
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_names_one_claim_per_pn
  ON public_names (pn_identifier) WHERE proof_type = 'claim' AND status IN ('listed', 'disputed');
-- Vanity is per feed now, not per pN.
DROP INDEX IF EXISTS idx_public_names_vanity_per_pn;
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_names_vanity_per_feed
  ON public_names (feed_id) WHERE is_vanity = true;
CREATE INDEX IF NOT EXISTS idx_public_names_feed ON public_names (feed_id);
CREATE INDEX IF NOT EXISTS idx_public_names_released
  ON public_names (skeleton) WHERE status = 'released';

-- Reserved names from public sources. A claim on one needs a listed domain or channel proof.
CREATE TABLE IF NOT EXISTS protected_names (
  skeleton VARCHAR(255) PRIMARY KEY,
  display VARCHAR(255) NOT NULL,
  source VARCHAR(32) NOT NULL,
  source_ref VARCHAR(255),
  required_domains TEXT[] NOT NULL DEFAULT '{}',
  required_youtube_channel_ids TEXT[] NOT NULL DEFAULT '{}',
  refreshed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cases the date rule cannot settle. The holder keeps the name while open.
CREATE TABLE IF NOT EXISTS public_name_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skeleton VARCHAR(255) NOT NULL,
  public_name VARCHAR(255) NOT NULL,
  holder_pn_identifier VARCHAR(255),
  challenger_pn_identifier VARCHAR(255) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_public_name_disputes_open
  ON public_name_disputes (skeleton) WHERE status = 'open';

-- Root-signed handle transfers awaiting the recipient.
CREATE TABLE IF NOT EXISTS public_name_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_name VARCHAR(255) NOT NULL,
  from_pn_identifier VARCHAR(255) NOT NULL,
  to_pn_identifier VARCHAR(255) NOT NULL,
  statement JSONB NOT NULL,
  signature TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_name_transfers_pending
  ON public_name_transfers (public_name) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_public_name_transfers_to
  ON public_name_transfers (to_pn_identifier) WHERE status = 'pending';

-- Registry-signed receipts, hash-chained per handle.
CREATE TABLE IF NOT EXISTS public_name_receipts (
  receipt_hash VARCHAR(128) PRIMARY KEY,
  public_name VARCHAR(255) NOT NULL,
  owner_pn_identifier VARCHAR(255) NOT NULL,
  receipt JSONB NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_name_receipts_owner ON public_name_receipts (owner_pn_identifier);

-- Verified legal name: keyed hash only, never the name.
ALTER TABLE IF EXISTS verified_identities ADD COLUMN IF NOT EXISTS legal_name_hmac VARCHAR(128);
