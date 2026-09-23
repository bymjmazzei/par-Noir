-- Micro allocation buckets + Pen music attach pointer on post uses.

ALTER TABLE creator_fund_period_creator_allocations
  DROP CONSTRAINT IF EXISTS creator_fund_period_creator_allocations_bucket_check;

ALTER TABLE creator_fund_period_creator_allocations
  ADD CONSTRAINT creator_fund_period_creator_allocations_bucket_check CHECK (
    bucket IN (
      'verified',
      'unverified',
      'music_verified',
      'music_unverified',
      'engager_verified',
      'engager_unverified',
      'content_rights_verified',
      'content_rights_unverified',
      'publisher_verified',
      'publisher_unverified'
    )
  );

ALTER TABLE music_registry_post_uses
  ADD COLUMN IF NOT EXISTS music_pen_doc_id TEXT;

ALTER TABLE music_registry_post_uses
  ADD COLUMN IF NOT EXISTS music_file_id TEXT;

-- Allow Pen-only attach (no legacy registry UUID).
ALTER TABLE music_registry_post_uses
  ALTER COLUMN registry_track_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_music_registry_post_uses_pen_doc
  ON music_registry_post_uses (music_pen_doc_id)
  WHERE music_pen_doc_id IS NOT NULL;
