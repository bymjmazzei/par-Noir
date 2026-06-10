-- Subject-level succession (sub-pN rekey independent of root identity migration)

CREATE TABLE IF NOT EXISTS pn_subject_succession (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_subject_pn_identifier VARCHAR(255) NOT NULL UNIQUE,
  successor_subject_pn_identifier VARCHAR(255) NOT NULL,
  predecessor_asset_id UUID NOT NULL,
  successor_asset_id UUID NOT NULL,
  root_pn_identifier VARCHAR(255) NOT NULL,
  reason VARCHAR(64) NOT NULL DEFAULT 'rotation',
  effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pn_subject_succession_successor
  ON pn_subject_succession(successor_subject_pn_identifier);

CREATE INDEX IF NOT EXISTS idx_pn_subject_succession_root
  ON pn_subject_succession(root_pn_identifier);
