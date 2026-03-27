import type { SigmaProof } from './modpSchnorr';

export const ZK_PROOF_TYPE_V1 = 'modp_fs_nizk_ml_dsa_binding_v1' as const;

export interface ZkProofEnvelopeV1 {
  format_version: 1;
  zk_proof_version: 1;
  zk_proof_type: typeof ZK_PROOF_TYPE_V1;
  hash_policy: 'SHA3-384';
  context: string;
  nonce: string;
  expires_at_ms: number;
  public_inputs: Record<string, unknown>;
  sigma: SigmaProof;
  ml_dsa_public_key_b64: string;
  ml_dsa_signature_b64: string;
}

export function sortKeysDeep(x: unknown): unknown {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  const o = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    out[k] = sortKeysDeep(o[k]);
  }
  return out;
}

/** Canonical UTF-8 string signed by ML-DSA (excludes only ml_dsa_signature_b64). */
export function canonicalJsonForSigning(env: Omit<ZkProofEnvelopeV1, 'ml_dsa_signature_b64'>): string {
  return JSON.stringify(sortKeysDeep(env));
}

export function parseEnvelopeJson(json: string): unknown {
  return JSON.parse(json);
}

export function isZkProofEnvelopeV1(x: unknown): x is ZkProofEnvelopeV1 {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    o.format_version === 1 &&
    o.zk_proof_version === 1 &&
    o.zk_proof_type === ZK_PROOF_TYPE_V1 &&
    o.hash_policy === 'SHA3-384' &&
    typeof o.context === 'string' &&
    typeof o.nonce === 'string' &&
    typeof o.expires_at_ms === 'number' &&
    o.public_inputs !== null &&
    typeof o.public_inputs === 'object' &&
    o.sigma !== null &&
    typeof o.sigma === 'object' &&
    typeof o.ml_dsa_public_key_b64 === 'string' &&
    typeof o.ml_dsa_signature_b64 === 'string'
  );
}
