-- Drive migration progress + pinned folder for resume

ALTER TABLE pn_identity_migration
  ADD COLUMN IF NOT EXISTS drive_progress JSONB,
  ADD COLUMN IF NOT EXISTS pinned_drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS migration_report JSONB;
