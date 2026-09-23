import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import type { PenSession } from './penSession';

/** Prefer session ML-DSA keys from messaging handoff. No ephemeral fallback. */
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
      throw new Error('signing_keys_invalid');
    }
  }
  throw new Error(
    'signing_keys_required — unlock again so ML-DSA keys are included in the messaging handoff'
  );
}
