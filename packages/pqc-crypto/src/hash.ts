import { sha3_384 } from '@noble/hashes/sha3.js';

/** Protocol-level digest per IDENTITY_PQC_DECISIONS.md §4 (SHA3-384). */
export function sha3_384_digest(data: Uint8Array): Uint8Array {
  return sha3_384(data);
}
