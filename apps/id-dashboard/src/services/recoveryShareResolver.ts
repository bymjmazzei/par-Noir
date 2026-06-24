import type { ShamirShare, RecoverySharesSealed } from '@par-noir/recovery-crypto';
import { unsealRecoveryShares } from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '../utils/crypto';
import { getPendingRecoverySharesBuffer } from './recoveryVaultService';

export class RecoverySharesUnavailableError extends Error {
  constructor(message = 'No recovery shares available. Re-create your pN or use a .pn file with recoverySharesSealed.') {
    super(message);
    this.name = 'RecoverySharesUnavailableError';
  }
}

export async function resolveRecoveryShares(params: {
  encryptedIdentity: EncryptedIdentity;
  pnName: string;
  passcode: string;
  publicKey?: string;
}): Promise<ShamirShare[]> {
  const { encryptedIdentity, pnName, passcode, publicKey } = params;

  if (encryptedIdentity.recoverySharesSealed) {
    return unsealRecoveryShares(encryptedIdentity.recoverySharesSealed as RecoverySharesSealed, pnName, passcode);
  }

  const buffer = getPendingRecoverySharesBuffer();
  const pk = publicKey || encryptedIdentity.publicKey;
  if (buffer?.shares?.length && buffer.publicKey === pk) {
    return [...buffer.shares];
  }

  throw new RecoverySharesUnavailableError();
}
