-- One opaque inbox route per identity. Dashboard and browser must converge on
-- the same claimed route_key; a second mint for the same owner must adopt the
-- first binding instead of creating a parallel drain address.
--
-- Drop the non-unique owner index from add_mailbox_route_binding.sql if present,
-- then enforce uniqueness on owner_hash.

DROP INDEX IF EXISTS idx_mailbox_route_binding_owner;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_route_binding_owner_unique
  ON mailbox_route_binding (owner_hash);
