/** Raw ML-DSA-65 public key length (bytes). */
export const ML_DSA_65_PUBLIC_KEY_LENGTH = 1952;
/** Raw ML-KEM-768 public key length (bytes). */
export const ML_KEM_768_PUBLIC_KEY_LENGTH = 1184;

/** Algorithm identifiers for identity wire format (explicit versioning per IDENTITY_PQC_DECISIONS.md §5). */
export const SIG_ALG_ML_DSA_65 = 'ML-DSA-65' as const;
export const KEM_ALG_ML_KEM_768 = 'ML-KEM-768' as const;
export const HASH_POLICY_SHA3_384 = 'SHA3-384' as const;

export type SigAlgId = typeof SIG_ALG_ML_DSA_65;
export type KemAlgId = typeof KEM_ALG_ML_KEM_768;
export type HashPolicyId = typeof HASH_POLICY_SHA3_384;
