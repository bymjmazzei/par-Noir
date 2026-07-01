-- Allow multiple comments per user per file; keep one row per user for toggle engagement types.

ALTER TABLE engagement DROP CONSTRAINT IF EXISTS engagement_file_id_user_did_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS engagement_file_user_type_toggle_unique
  ON engagement (file_id, user_did, type)
  WHERE type IN ('like', 'dislike', 'share', 'save');
