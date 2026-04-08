/**
 * ZK proof envelope v1 (mod-p Schnorr sigma). Prefer `@par-noir/zk-protocol-v2` for new issuance;
 * this module remains for verifying legacy proofs and tests.
 */
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';
import {
  canonicalJsonForSigning,
  type ZkProofEnvelopeV1,
  ZK_PROOF_TYPE_V1,
} from './envelope';
import { generateSigmaProof } from './modpSchnorr';

function getWebCrypto(): Crypto {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c;
  throw new Error('crypto.getRandomValues is not available');
}

/**
 * Build a v1 ZK envelope: RFC5114 Fiat–Shamir Schnorr + ML-DSA-65 binding.
 * `proof` string for storage is base64(JSON.stringify(envelope)).
 */
export function generateZkProofEnvelopeV1(params: {
  mlDsaSecretKey: Uint8Array;
  mlDsaPublicKey: Uint8Array;
  context: string;
  public_inputs: Record<string, unknown>;
  expiresAtMs: number;
}): string {
  const nonce = getWebCrypto().randomUUID();
  const sigma = generateSigmaProof({
    context: params.context,
    nonce,
    publicInputs: params.public_inputs,
  });

  const body: Omit<ZkProofEnvelopeV1, 'ml_dsa_signature_b64'> = {
    format_version: 1,
    zk_proof_version: 1,
    zk_proof_type: ZK_PROOF_TYPE_V1,
    hash_policy: 'SHA3-384',
    context: params.context,
    nonce,
    expires_at_ms: params.expiresAtMs,
    public_inputs: params.public_inputs,
    sigma,
    ml_dsa_public_key_b64: bytesToBase64(params.mlDsaPublicKey),
  };

  const msg = new TextEncoder().encode(canonicalJsonForSigning(body));
  const sig = mlDsa65Sign(msg, params.mlDsaSecretKey);
  const full: ZkProofEnvelopeV1 = {
    ...body,
    ml_dsa_signature_b64: bytesToBase64(sig),
  };

  return bytesToBase64(new TextEncoder().encode(JSON.stringify(full)));
}
