-- Perceptual fingerprints of public feed previews. Private: never served, never acted on in v1.
-- They measure stripped reposting and let v2 recover credit for content from day one.
CREATE TABLE IF NOT EXISTS media_fingerprints (
  file_id VARCHAR(255) NOT NULL,
  variant VARCHAR(16) NOT NULL,
  uploader_pn VARCHAR(255) NOT NULL,
  algorithm VARCHAR(64) NOT NULL,
  -- Image: one 64-bit hash. Video: one hash per second of the sd rendition (hex strings).
  hashes TEXT[] NOT NULL,
  has_verified_manifest BOOLEAN NOT NULL DEFAULT FALSE,
  -- authorKeyId or CAWG display of the credited creator, when the post had credentials.
  credited_creator TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (file_id, variant)
);
CREATE INDEX IF NOT EXISTS idx_media_fingerprints_algorithm ON media_fingerprints(algorithm);
