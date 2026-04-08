import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Sign } from '@par-noir/pqc-crypto/ml-dsa';
import {
  bindingDigest384,
  computeStarkFinalR0,
  digestToStarkLimbs,
  randomWitnessScalar,
} from './binding';
import { canonicalJsonForSigning, type ZkProofEnvelopeV2, ZK_PROOF_TYPE_V2 } from './envelope';
import { getBindMixStark, starkProofToBase64 } from './stark';

function getWebCrypto(): Crypto {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c;
  throw new Error('crypto.getRandomValues is not available');
}

/**
 * Build a v2 ZK envelope: genSTARK inner proof + ML-DSA-65 binding.
 * `proof` string for storage is base64(JSON.stringify(envelope)).
 */
export function generateZkProofEnvelopeV2(params: {
  mlDsaSecretKey: Uint8Array;
  mlDsaPublicKey: Uint8Array;
  context: string;
  public_inputs: Record<string, unknown>;
  expiresAtMs: number;
}): string {
  const nonce = getWebCrypto().randomUUID();
  const digest = bindingDigest384(params.public_inputs, params.context, nonce);
  const limbs = digestToStarkLimbs(digest);
  const w = randomWitnessScalar();
  const finalR0 = computeStarkFinalR0(w, limbs);

  const stark = getBindMixStark();
  const limbInputs = limbs.map((l) => [l]);
  const assertions = [
    { register: 0, step: 63, value: finalR0 },
    { register: 1, step: 63, value: limbs[0]! },
  ];
  const proof = stark.prove(assertions, [...limbInputs, [w]]);

  const body: Omit<ZkProofEnvelopeV2, 'ml_dsa_signature_b64'> = {
    format_version: 2,
    zk_proof_version: 2,
    zk_proof_type: ZK_PROOF_TYPE_V2,
    hash_policy: 'SHA3-384',
    stark_iop_hash: 'sha256',
    context: params.context,
    nonce,
    expires_at_ms: params.expiresAtMs,
    public_inputs: params.public_inputs,
    stark_binding_sha3_384_b64: bytesToBase64(digest),
    stark_final_r0_decimal: finalR0.toString(10),
    stark_proof_b64: starkProofToBase64(proof),
    ml_dsa_public_key_b64: bytesToBase64(params.mlDsaPublicKey),
  };

  const msg = new TextEncoder().encode(canonicalJsonForSigning(body));
  const sig = mlDsa65Sign(msg, params.mlDsaSecretKey);
  const full: ZkProofEnvelopeV2 = {
    ...body,
    ml_dsa_signature_b64: bytesToBase64(sig),
  };

  return bytesToBase64(new TextEncoder().encode(JSON.stringify(full)));
}
