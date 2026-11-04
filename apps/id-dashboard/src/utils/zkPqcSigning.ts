import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import type { EncryptedIdentity } from '../types/crypto';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { readShellSigningKeys } from '../services/shellKeys';

export type MlDsaKeypair = { mlDsaSecretKey: Uint8Array; mlDsaPublicKey: Uint8Array };

/** ML-DSA pair the unlock app handed over at sign-in (same keys Pen signs with). */
export function shellMlDsaKeypair(ids: Array<string | null | undefined>): MlDsaKeypair | null {
  for (const id of ids) {
    const keys = readShellSigningKeys(id);
    if (keys) {
      return {
        mlDsaSecretKey: base64ToBytes(keys.mlDsaSecretKey),
        mlDsaPublicKey: base64ToBytes(keys.mlDsaPublicKey),
      };
    }
  }
  return null;
}

/**
 * ML-DSA-65 key material for ZK envelope signing. Prefers the unlock-app pair; rotation and
 * recovery hold the key file with Key 1/Key 2 in memory and decrypt it here.
 */
export async function loadMlDsaKeypairForZk(
  identityId: string,
  encryptedIdentity?: EncryptedIdentity | null,
  aliases: Array<string | null | undefined> = []
): Promise<MlDsaKeypair> {
  const shell = shellMlDsaKeypair([identityId, encryptedIdentity?.publicKey, ...aliases]);
  if (shell) return shell;
  const creds = SecureCredentialManager.getCredentials(identityId);
  if (!encryptedIdentity || !creds?.key1 || !creds.key2) {
    throw new Error('Signing key unavailable — unlock again with the unlock app.');
  }
  const raw = await IdentityCrypto.decryptData(
    {
      encrypted: encryptedIdentity.encryptedData,
      iv: encryptedIdentity.iv,
      salt: encryptedIdentity.salt,
    },
    creds.key1,
    creds.key2
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
