import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToBase64 } from './encoding';
import { mlDsa65Keygen } from './mlDsa';
import { deriveCanonicalPnIdentifier } from './oauthUnlockProof';

export const PERSONAL_FEED_HKDF_SALT = 'par-noir-personal-feed-v1';

export type PersonalFeedKeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyB64: string;
  subjectPnIdentifier: string;
};

/**
 * The one personal feed of a root pN. Same root key always yields the same feed key,
 * so the feed needs no backup of its own. Never equal to the root key.
 */
export function derivePersonalFeedKeyPair(
  rootMlDsaSecretKey: Uint8Array,
  rootPnIdentifier: string
): PersonalFeedKeyPair {
  if (!(rootMlDsaSecretKey instanceof Uint8Array) || rootMlDsaSecretKey.length === 0) {
    throw new Error('Root ML-DSA secret key required');
  }
  const root = String(rootPnIdentifier || '').trim();
  if (!root) throw new Error('Root pN identifier required');
  const enc = new TextEncoder();
  const seed = hkdf(sha256, rootMlDsaSecretKey, enc.encode(PERSONAL_FEED_HKDF_SALT), enc.encode(root), 32);
  const { publicKey, secretKey } = mlDsa65Keygen(seed);
  const publicKeyB64 = bytesToBase64(publicKey);
  return {
    publicKey,
    secretKey,
    publicKeyB64,
    subjectPnIdentifier: deriveCanonicalPnIdentifier(publicKeyB64),
  };
}
