import type { UnlockedIdentityBundle } from './decryptIdentityLocal';
import type { ConsentVaultEnrollMaterial } from './ConsentUnlockApp';

/** Build vault enroll payload after a successful local decrypt (host seals this). */
export function toUnlockVaultEnrollMaterial(
  unlocked: UnlockedIdentityBundle,
  pnName: string,
  passcode: string
): ConsentVaultEnrollMaterial {
  return {
    identityId: unlocked.did,
    publicKey: unlocked.publicKey,
    pnName,
    passcode,
    encryptedIdentityJson: JSON.stringify(unlocked.encryptedIdentity),
  };
}

/** Assert mint/authenticate wire objects never carry vault secrets. */
export function assertNoVaultSecretsOnWire(body: Record<string, unknown>): void {
  const banned = ['passcode', 'pn_name', 'pnName', 'password', 'encryptedIdentityJson'];
  for (const key of banned) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new Error(`Vault secret key "${key}" must not appear on OAuth wire`);
    }
  }
}
