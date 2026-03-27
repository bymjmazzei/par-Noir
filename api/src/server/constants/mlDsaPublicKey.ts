/**
 * ML-DSA-65 raw public key length (bytes) for OAuth `public_key` validation.
 * Canonical definition: `packages/pqc-crypto` and `docs/standards/IDENTITY_WIRE_FORMAT.md`.
 * The API server only checks length; it does not run ML-DSA. This module avoids a `file:`
 * workspace dependency so `api/` can build standalone (e.g. Railway root = `api/`).
 */
export const ML_DSA_65_PUBLIC_KEY_LENGTH = 1952;
