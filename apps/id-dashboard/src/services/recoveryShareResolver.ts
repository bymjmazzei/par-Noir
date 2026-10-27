import type { ShamirShare, RecoverySharesSealed } from '@par-noir/recovery-crypto';
import { unsealRecoveryShares } from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import { getPendingRecoverySharesBuffer } from './recoveryVaultService';

export class RecoverySharesUnavailableError extends Error {
  constructor(message = 'No recovery shares available. Re-create your pN or use a .pn file with recoverySharesSealed.') {
    super(message);
    this.name = 'RecoverySharesUnavailableError';
  }
}

export async function resolveRecoveryShares(params: {
  encryptedIdentity: EncryptedIdentity;
  key1?: string;
  key2?: string;
  publicKey?: string;
}): Promise<ShamirShare[]> {
  const { encryptedIdentity, key1, key2, publicKey } = params;

  if (encryptedIdentity.recoverySharesSealed && key1 && key2) {
    return unsealRecoveryShares(encryptedIdentity.recoverySharesSealed as RecoverySharesSealed, key1, key2);
  }

  const buffer = getPendingRecoverySharesBuffer();
  const pk = publicKey || encryptedIdentity.publicKey;
  if (buffer?.shares?.length && buffer.publicKey === pk) {
    return [...buffer.shares];
  }

  throw new RecoverySharesUnavailableError();
}
