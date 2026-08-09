-- Binds an opaque mailbox route to the identity entitled to drain it.
--
-- gateOwnerRoute proves the caller is who they claim, but nothing tied that
-- caller to the route_key they hand /pending and /ack. Every peer you connect
-- with holds your route key, so any of them could read and ack your mailbox.
--
-- owner_hash is peppered (mailboxOwnerHash), so this stays consistent with the
-- reason routes are opaque in the first place: a DB dump is not a clear
-- who->whom table.

CREATE TABLE IF NOT EXISTS mailbox_route_binding (
  route_key TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mailbox_route_binding_owner
  ON mailbox_route_binding (owner_hash);
