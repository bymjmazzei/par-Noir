import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import type { PenSession } from '../App';

/** Prefer session ML-DSA keys from messaging handoff; ephemeral only as last resort. */
export function resolveSigningKeys(session: PenSession): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  ephemeral: boolean;
} {
  if (session.mlDsaSecretKey && session.mlDsaPublicKey) {
    try {
      return {
        publicKey: base64ToBytes(session.mlDsaPublicKey),
        secretKey: base64ToBytes(session.mlDsaSecretKey),
        ephemeral: false
      };
    } catch {
      /* fall through */
    }
  }
  const keys = mlDsa65Keygen();
  return { ...keys, ephemeral: true };
}
