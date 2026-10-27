/**
 * Recovery setup on a pN with no keyed device: prove the root key by signing a server
 * challenge with the ML-DSA secret from the Recovery tab's unlocked .pn.
 */
import { IdentityCrypto } from '@par-noir/identity-crypto';
import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { deriveCanonicalPnIdentifier, signRecoverySetupProof } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import type { RecoveryAuthSession } from './recoveryAuthSession';
import { fetchRecoverySetupChallenge, type RecoverySetupOwnerProof } from './recoveryApiService';

export interface RecoverySessionIdentity {
  id: string;
  username?: string;
  recoveryConfig?: { threshold: number; totalShares: number; version?: 1; createdAt?: string };
  pqcSecrets?: { mlDsaSecretKey?: string; mlKemSecretKey?: string };
}

/** Decrypt the Recovery tab's .pn with the keys entered there. */
export async function decryptRecoverySessionIdentity(auth: RecoveryAuthSession): Promise<RecoverySessionIdentity> {
  const raw = await IdentityCrypto.decryptData(
    {
      encrypted: auth.encryptedIdentity.encryptedData,
      iv: auth.encryptedIdentity.iv,
      salt: auth.encryptedIdentity.salt,
    },
    auth.pnName,
    auth.passcode
  );
  return JSON.parse(raw) as RecoverySessionIdentity;
}

export async function signRecoverySetupChallenge(
  authToken: string,
  auth: RecoveryAuthSession,
  decrypted?: RecoverySessionIdentity
): Promise<RecoverySetupOwnerProof> {
  const identity = decrypted ?? (await decryptRecoverySessionIdentity(auth));
  const secretB64 = identity.pqcSecrets?.mlDsaSecretKey;
  if (!secretB64) {
    throw new Error('This .pn file has no signing key. Rotate your pN, then set up recovery.');
  }
  const publicKey = auth.encryptedIdentity.publicKey;
  const { challengeId, challenge } = await fetchRecoverySetupChallenge(authToken);
  const signature = signRecoverySetupProof(
    { challenge, pnIdentifier: deriveCanonicalPnIdentifier(publicKey), publicKey },
    base64ToBytes(secretB64)
  );
  return { challengeId, publicKey, signature };
}
