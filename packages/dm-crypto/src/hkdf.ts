import { hkdf } from '@noble/hashes/hkdf.js';
import { sha3_384 } from '@noble/hashes/sha3.js';

/** HKDF-SHA3-384 → 32-byte key (AES-256). */
export function hkdfSha3_384(ikm: Uint8Array, info: string, salt?: Uint8Array): Uint8Array {
  const infoBytes = new TextEncoder().encode(info);
  return hkdf(sha3_384, ikm, salt, infoBytes, 32);
}
