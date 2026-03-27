import * as cborg from 'cborg';
import {
  HASH_POLICY_SHA3_384,
  KEM_ALG_ML_KEM_768,
  SIG_ALG_ML_DSA_65,
} from './constants';

/** Current identity blob format version (bump when fields change). */
export const PN_IDENTITY_FORMAT_VERSION = 1;

export type IdentityBlobV1 = {
  formatVersion: number;
  sigAlgId: string;
  kemAlgId: string;
  hashPolicyId: string;
  mlDsaPublicKey: Uint8Array;
  mlKemPublicKey: Uint8Array;
  /** Optional application metadata (non-secret). */
  metadata?: Record<string, string>;
};

function toRecord(obj: unknown): Record<string, string> | undefined {
  if (obj == null) return undefined;
  if (typeof obj !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Encode identity public material to canonical CBOR bytes. */
export function encodeIdentityBlobV1(blob: IdentityBlobV1): Uint8Array {
  const { mlDsaPublicKey, mlKemPublicKey, metadata, ...rest } = blob;
  const payload = {
    ...rest,
    mlDsaPublicKey: new Uint8Array(mlDsaPublicKey),
    mlKemPublicKey: new Uint8Array(mlKemPublicKey),
    ...(metadata ? { metadata } : {}),
  };
  return cborg.encode(payload);
}

export function decodeIdentityBlobV1(bytes: Uint8Array): IdentityBlobV1 {
  const decoded = cborg.decode(bytes) as Record<string, unknown>;
  const formatVersion = decoded.formatVersion;
  if (formatVersion !== PN_IDENTITY_FORMAT_VERSION) {
    throw new Error(`Unsupported formatVersion: ${String(formatVersion)}`);
  }
  const sigAlgId = decoded.sigAlgId;
  const kemAlgId = decoded.kemAlgId;
  const hashPolicyId = decoded.hashPolicyId;
  if (typeof sigAlgId !== 'string' || typeof kemAlgId !== 'string' || typeof hashPolicyId !== 'string') {
    throw new Error('Invalid identity blob: missing algorithm ids');
  }
  const dsa = decoded.mlDsaPublicKey;
  const kem = decoded.mlKemPublicKey;
  if (!(dsa instanceof Uint8Array) || !(kem instanceof Uint8Array)) {
    throw new Error('Invalid identity blob: missing public keys');
  }
  return {
    formatVersion: PN_IDENTITY_FORMAT_VERSION,
    sigAlgId,
    kemAlgId,
    hashPolicyId,
    mlDsaPublicKey: new Uint8Array(dsa),
    mlKemPublicKey: new Uint8Array(kem),
    metadata: toRecord(decoded.metadata),
  };
}

/** Build a minimal v1 blob with fixed algorithm IDs from decisions doc. */
export function createIdentityBlobV1(
  mlDsaPublicKey: Uint8Array,
  mlKemPublicKey: Uint8Array,
  metadata?: Record<string, string>
): Uint8Array {
  return encodeIdentityBlobV1({
    formatVersion: PN_IDENTITY_FORMAT_VERSION,
    sigAlgId: SIG_ALG_ML_DSA_65,
    kemAlgId: KEM_ALG_ML_KEM_768,
    hashPolicyId: HASH_POLICY_SHA3_384,
    mlDsaPublicKey,
    mlKemPublicKey,
    metadata,
  });
}
