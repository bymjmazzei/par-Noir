import { IdentityCrypto } from '@par-noir/identity-crypto';
import { KEYS_INCORRECT, KEYS_REQUIRED } from '../constants/credentialLabels';
import { parsePortablePnBackup } from '../utils/parsePortablePnBackup';
import { RECOVERY_AUTH_TTL_MS, type RecoveryAuthSession } from './recoveryAuthSession';

/** Decrypts the .pn in this browser only. Nothing is sent or stored. */
export async function unlockRecoveryLocally(params: {
  file: File;
  key1: string;
  key2: string;
  expectedPublicKey: string;
}): Promise<RecoveryAuthSession> {
  const { file, key1, key2, expectedPublicKey } = params;
  if (!key1 || !key2) throw new Error(KEYS_REQUIRED);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not a readable .pn file.');
  }
  const encryptedIdentity = parsePortablePnBackup(parsed);
  if (encryptedIdentity.publicKey !== expectedPublicKey) {
    throw new Error('This .pn belongs to a different pN than the one signed in.');
  }

  try {
    await IdentityCrypto.authenticateIdentity(encryptedIdentity, key2, key1);
  } catch {
    throw new Error(KEYS_INCORRECT);
  }

  return {
    encryptedIdentity,
    key1,
    key2,
    expiresAt: Date.now() + RECOVERY_AUTH_TTL_MS,
  };
}
