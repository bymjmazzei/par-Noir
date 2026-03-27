/**
 * par Noir PQC identity helpers — delegates to @par-noir/pqc-crypto (ML-DSA-65, ML-KEM-768).
 */
export {
  SIG_ALG_ML_DSA_65,
  KEM_ALG_ML_KEM_768,
  HASH_POLICY_SHA3_384,
  PN_IDENTITY_FORMAT_VERSION,
  createIdentityBlobV1,
  decodeIdentityBlobV1,
  encodeIdentityBlobV1,
  mlDsa65Keygen,
  mlDsa65Sign,
  mlDsa65Verify,
  mlKem768Keygen,
  mlKem768Encapsulate,
  mlKem768Decapsulate,
  sha3_384_digest,
  type IdentityBlobV1,
} from '@par-noir/pqc-crypto';

import {
  createIdentityBlobV1,
  mlDsa65Keygen,
  mlKem768Keygen,
} from '@par-noir/pqc-crypto';

/** Generate fresh ML-DSA + ML-KEM keypairs and return raw public material + v1 CBOR blob. */
export function generateParNoirPqcPublicBundle(): {
  mlDsaPublicKey: Uint8Array;
  mlKemPublicKey: Uint8Array;
  identityBlobCbor: Uint8Array;
} {
  const dsa = mlDsa65Keygen();
  const kem = mlKem768Keygen();
  const identityBlobCbor = createIdentityBlobV1(dsa.publicKey, kem.publicKey);
  return {
    mlDsaPublicKey: dsa.publicKey,
    mlKemPublicKey: kem.publicKey,
    identityBlobCbor,
  };
}

export { bytesToBase64, base64ToBytes } from '@par-noir/pqc-crypto';
