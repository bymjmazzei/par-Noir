import { ML_DSA_65_PUBLIC_KEY_LENGTH } from '@par-noir/pqc-crypto/constants';
import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import { canonicalJsonForSigning, isZkProofEnvelopeV1, type ZkProofEnvelopeV1 } from './envelope';
import { verifySigmaProof } from './modpSchnorr';

export interface ZkVerifyResult {
  ok: boolean;
  reason?: string;
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
 * Full verification: ML-DSA signature + Fiat–Shamir Schnorr (RFC5114).
 */
export function verifyZkProofEnvelopeV1(
  zkpProof: string,
  opts?: { nowMs?: number }
): ZkVerifyResult {
  const now = opts?.nowMs ?? Date.now();
  const env = decodeEnvelopeFromProofString(zkpProof);
  if (env === null) {
    return { ok: false, reason: 'invalid_base64_or_json' };
  }
  if (!isZkProofEnvelopeV1(env)) {
    return { ok: false, reason: 'not_zk_proof_v1_envelope' };
  }
  if (now > env.expires_at_ms) {
    return { ok: false, reason: 'expired' };
  }

  const pkBytes = base64ToBytes(env.ml_dsa_public_key_b64);
  if (pkBytes.length !== ML_DSA_65_PUBLIC_KEY_LENGTH) {
    return { ok: false, reason: 'invalid_ml_dsa_public_key_length' };
  }

  const { ml_dsa_signature_b64, ...rest } = env;
  const signing = rest as Omit<ZkProofEnvelopeV1, 'ml_dsa_signature_b64'>;
  const msg = new TextEncoder().encode(canonicalJsonForSigning(signing));
  const sig = base64ToBytes(ml_dsa_signature_b64);
  if (!mlDsa65Verify(sig, msg, pkBytes)) {
    return { ok: false, reason: 'ml_dsa_verify_failed' };
  }

  const okSigma = verifySigmaProof({
    context: env.context,
    nonce: env.nonce,
    publicInputs: env.public_inputs as Record<string, unknown>,
    sigma: env.sigma,
  });
  if (!okSigma) {
    return { ok: false, reason: 'sigma_verify_failed' };
  }

  return { ok: true };
}

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

/**
 * Verify age predicate `age >= n` using public_inputs.age_bucket (dashboard bucket strings).
 */
export function ageBucketMeetsMinimum(ageBucket: string, minAge: number): boolean {
  const floor = BUCKET_MIN_AGE[ageBucket];
  if (floor === undefined) return false;
  return floor >= minAge;
}
