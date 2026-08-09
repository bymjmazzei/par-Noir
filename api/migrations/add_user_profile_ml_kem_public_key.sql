-- Publish each identity's ML-KEM public key so peers can seal payloads to it.
--
-- The key was only ever written to the owner's Drive profile, which means it was
-- readable with the owner's token and nobody else's. Under device cloud custody
-- that made it unreachable to the one party that needs it: a peer sealing a
-- connection request. It is a public key, so publishing it leaks nothing the
-- protocol protects, and it is the recipient's own device that writes it.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ml_kem_public_key TEXT;
