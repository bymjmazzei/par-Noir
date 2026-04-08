import { ML_DSA_65_PUBLIC_KEY_LENGTH } from '@par-noir/pqc-crypto/constants';
import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import { bindingDigest384, digestToStarkLimbs } from './binding';
import { canonicalJsonForSigning, isZkProofEnvelopeV2, type ZkProofEnvelopeV2 } from './envelope';
import { getBindMixStark, starkProofFromBase64 } from './stark';

export interface ZkVerifyResultV2 {
  ok: boolean;
  reason?: string;
}

function digestsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function decodeEnvelopeFromProofString(zkpProof: string): unknown {
  try {
    const bytes = base64ToBytes(zkpProof.trim());
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Full verification: binding digest, ML-DSA signature, genSTARK verify.
 */
export function verifyZkProofEnvelopeV2(zkpProof: string, opts?: { nowMs?: number }): ZkVerifyResultV2 {
  const now = opts?.nowMs ?? Date.now();
  const env = decodeEnvelopeFromProofString(zkpProof);
  if (env === null) {
    return { ok: false, reason: 'invalid_base64_or_json' };
  }
  if (!isZkProofEnvelopeV2(env)) {
    return { ok: false, reason: 'not_zk_proof_v2_envelope' };
  }
  if (now > env.expires_at_ms) {
    return { ok: false, reason: 'expired' };
  }

  const expectedDigest = bindingDigest384(env.public_inputs as Record<string, unknown>, env.context, env.nonce);
  let claimedDigest: Uint8Array;
  try {
    claimedDigest = base64ToBytes(env.stark_binding_sha3_384_b64.trim());
  } catch {
    return { ok: false, reason: 'invalid_binding_b64' };
  }
  if (!digestsEqual(expectedDigest, claimedDigest)) {
    return { ok: false, reason: 'binding_digest_mismatch' };
  }

  const pkBytes = base64ToBytes(env.ml_dsa_public_key_b64);
  if (pkBytes.length !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    return { ok: false, reason: 'invalid_ml_dsa_public_key_length' };
  }

  const { ml_dsa_signature_b64, ...rest } = env;
  const signing = rest as Omit<ZkProofEnvelopeV2, 'ml_dsa_signature_b64'>;
  const msg = new TextEncoder().encode(canonicalJsonForSigning(signing));
  const sig = base64ToBytes(ml_dsa_signature_b64);
  if (!mlDsa65Verify(sig, msg, pkBytes)) {
    return { ok: false, reason: 'ml_dsa_verify_failed' };
  }

  const limbs = digestToStarkLimbs(expectedDigest);
  let finalR0: bigint;
  try {
    finalR0 = BigInt(env.stark_final_r0_decimal);
  } catch {
    return { ok: false, reason: 'invalid_stark_final_r0' };
  }

  const stark = getBindMixStark();
  let starkProof;
  try {
    starkProof = starkProofFromBase64(env.stark_proof_b64);
  } catch {
    return { ok: false, reason: 'invalid_stark_proof' };
  }

  const assertions = [
    { register: 0, step: 63, value: finalR0 },
    { register: 1, step: 63, value: limbs[0]! },
  ];
  const publicLimbs = limbs.map((l) => [l]);

  try {
    const ok = stark.verify(assertions, starkProof, publicLimbs);
    if (!ok) return { ok: false, reason: 'stark_verify_failed' };
  } catch {
    return { ok: false, reason: 'stark_verify_threw' };
  }

  return { ok: true };
}

/** Re-export v1 age predicate helper pattern — same buckets as v1. */
const BUCKET_MIN_AGE: Record<string, number> = {
  under_18: 0,
  '18_20': 18,
  '21_24': 21,
  '25_29': 25,
  '30_39': 30,
  '40_49': 40,
  '50_59': 50,
  '60_plus': 60,
};

export function ageBucketMeetsMinimum(bucket: string, minAge: number): boolean {
  const b = BUCKET_MIN_AGE[bucket];
  if (b === undefined) return false;
  return b >= minAge;
}
