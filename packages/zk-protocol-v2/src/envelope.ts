export const ZK_PROOF_TYPE_V2 = 'stark_genstark_sha256_ml_dsa_binding_v2' as const;

export interface ZkProofEnvelopeV2 {
  format_version: 2;
  zk_proof_version: 2;
  zk_proof_type: typeof ZK_PROOF_TYPE_V2;
  hash_policy: 'SHA3-384';
  stark_iop_hash: 'sha256';
  context: string;
  nonce: string;
  expires_at_ms: number;
  public_inputs: Record<string, unknown>;
  stark_binding_sha3_384_b64: string;
  stark_final_r0_decimal: string;
  stark_proof_b64: string;
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
export function canonicalJsonForSigning(env: Omit<ZkProofEnvelopeV2, 'ml_dsa_signature_b64'>): string {
  return JSON.stringify(sortKeysDeep(env));
}

export function isZkProofEnvelopeV2(x: unknown): x is ZkProofEnvelopeV2 {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    o.format_version === 2 &&
    o.zk_proof_version === 2 &&
    o.zk_proof_type === ZK_PROOF_TYPE_V2 &&
    o.hash_policy === 'SHA3-384' &&
    o.stark_iop_hash === 'sha256' &&
    typeof o.context === 'string' &&
    typeof o.nonce === 'string' &&
    typeof o.expires_at_ms === 'number' &&
    o.public_inputs !== null &&
    typeof o.public_inputs === 'object' &&
    typeof o.stark_binding_sha3_384_b64 === 'string' &&
    typeof o.stark_final_r0_decimal === 'string' &&
    typeof o.stark_proof_b64 === 'string' &&
    typeof o.ml_dsa_public_key_b64 === 'string' &&
    typeof o.ml_dsa_signature_b64 === 'string'
  );
}
