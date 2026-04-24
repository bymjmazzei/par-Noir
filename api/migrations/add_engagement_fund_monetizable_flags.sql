-- Witness-time gates for creator-fund bounty weights (verified + current maintenance for actor and content owner).
ALTER TABLE engagement ADD COLUMN IF NOT EXISTS actor_fund_monetizable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE engagement ADD COLUMN IF NOT EXISTS content_owner_fund_monetizable BOOLEAN NOT NULL DEFAULT FALSE;
