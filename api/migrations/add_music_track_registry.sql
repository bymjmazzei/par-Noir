-- Licensed library track registry (creator fund / music pool). Owner = pn_identifier from OAuth token.

CREATE TABLE IF NOT EXISTS music_registry_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_pn_identifier VARCHAR(255) NOT NULL,
  title VARCHAR(512) NOT NULL,
  display_artist VARCHAR(512),
  isrc VARCHAR(32),
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  splits_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT music_registry_tracks_status_check CHECK (
    status IN ('draft', 'active', 'retired')
  )
);

CREATE INDEX IF NOT EXISTS idx_music_registry_tracks_owner
  ON music_registry_tracks(owner_pn_identifier);

CREATE INDEX IF NOT EXISTS idx_music_registry_tracks_owner_status
  ON music_registry_tracks(owner_pn_identifier, status);

CREATE INDEX IF NOT EXISTS idx_music_registry_tracks_updated
  ON music_registry_tracks(updated_at DESC);
