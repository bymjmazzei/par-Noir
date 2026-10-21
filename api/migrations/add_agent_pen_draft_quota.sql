-- Daily count of Pen drafts each AI agent has proposed. Keyed by a hash of the agent
-- sub-pN; holds no draft content and no owner id. Drafts themselves ride social_mailbox
-- as sealed envelopes.
CREATE TABLE IF NOT EXISTS agent_pen_draft_quota (
  agent_hash TEXT NOT NULL,
  day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_hash, day)
);
