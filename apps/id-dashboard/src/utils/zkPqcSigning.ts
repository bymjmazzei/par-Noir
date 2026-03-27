import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import type { EncryptedIdentity } from '../types/crypto';
import { IdentityCrypto } from './crypto';
import { SecureCredentialManager } from './secureCredentialManager';

/**
 * Load ML-DSA-65 key material from an encrypted identity using in-memory pnName/passcode.
 * Used only for ZKP v1 envelope signing (dashboard).
 */
export async function loadMlDsaKeypairForZk(
  identityId: string,
  encryptedIdentity: EncryptedIdentity
): Promise<{ mlDsaSecretKey: Uint8Array; mlDsaPublicKey: Uint8Array }> {
  const creds = SecureCredentialManager.getCredentials(identityId);
  if (!creds?.pnName || !creds.passcode) {
    throw new Error('Session credentials unavailable for ZKP signing.');
  }
  const raw = await IdentityCrypto.decryptData(
    {
      encrypted: encryptedIdentity.encryptedData,
      iv: encryptedIdentity.iv,
      salt: encryptedIdentity.salt,
    },
    creds.pnName,
    creds.passcode
  );
  const identity = JSON.parse(raw) as { pqcSecrets?: { mlDsaSecretKey?: string } };
  const skB64 = identity.pqcSecrets?.mlDsaSecretKey;
  if (!skB64) {
    throw new Error('This identity does not include ML-DSA signing keys.');
  }
  return {
    mlDsaSecretKey: base64ToBytes(skB64),
    mlDsaPublicKey: base64ToBytes(encryptedIdentity.publicKey),
  };
}
