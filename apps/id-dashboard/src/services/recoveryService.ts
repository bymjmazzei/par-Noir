/**
 * Finish recovery on the claimant device: open the recovered data (Shamir shares + envelope, or
 * the key envelope) and re-wrap the identity with new Key 1 + Key 2.
 * Cryptographic secrets and publicKey stay the same (continuity, not succession).
 */
import {
  combineShares,
  decryptKeyRecoveryEnvelope,
  decryptRecoveryEnvelope,
  normalizeShare,
  sealRecoveryShares,
  type KeyRecoveryEnvelope,
  type RecoveryEnvelope,
  type ShamirShare
} from '@par-noir/recovery-crypto';
import { IdentityCrypto, type EncryptedIdentity } from '@par-noir/identity-crypto';
import { KEYS_REQUIRED } from '../constants/credentialLabels';

export interface RecoveryCompletionInput {
  envelope: RecoveryEnvelope;
  shares: ShamirShare[];
  /** New Key 1 (internal: Key 1) */
  newKey1: string;
  /** New Key 2 (internal: Key 2) */
  newKey2: string;
  /** Identity public key the relay released shares for. */
  expectedPublicKey: string;
}

export interface RecoveryCompletionResult {
  identity: EncryptedIdentity;
  key1: string;
}

function assertNewKeys(newKey1: string, newKey2: string): void {
  if (!newKey1 || !newKey2) throw new Error(KEYS_REQUIRED);
}

/**
 * Key-only recovery: open the key envelope with the recovery key, then re-seal the pN under new
 * Key 1 + Key 2 the same way a new pN is created (same keys, fresh recovery envelope).
 */
export async function completeKeyRecovery(input: {
  keyEnvelope: KeyRecoveryEnvelope;
  recoveryKey: string;
  newKey1: string;
  newKey2: string;
  expectedPublicKey: string;
}): Promise<RecoveryCompletionResult> {
  const newKey1 = input.newKey1.trim();
  assertNewKeys(newKey1, input.newKey2);
  const payload = await decryptKeyRecoveryEnvelope(input.recoveryKey, input.keyEnvelope);
  if (payload.publicKey !== input.expectedPublicKey) {
    throw new Error('Recovery data does not match this pN');
  }
  const { identity } = await IdentityCrypto.restoreIdentity({
    payload,
    key1: newKey1,
    key2: input.newKey2,
  });
  return { identity, key1: newKey1 };
}

export async function completeRecoveryWithShares(
  input: RecoveryCompletionInput
): Promise<RecoveryCompletionResult> {
  const newKey1 = input.newKey1.trim();
  assertNewKeys(newKey1, input.newKey2);

  const master = combineShares(input.shares.map((s) => normalizeShare(s)));
  const payload = await decryptRecoveryEnvelope(master, input.envelope);

  if (payload.publicKey !== input.expectedPublicKey) {
    throw new Error('Recovery envelope does not match this pN');
  }

  const identityData: Record<string, unknown> = {
    id: payload.identityId,
    key1: newKey1,
    recoveryConfig: payload.recoveryConfig,
    custodiansRequired: true,
    custodiansSetup: true,
    status: 'active',
    pqcSecrets: {
      mlDsaSecretKey: payload.mlDsaSecretKey,
      mlKemSecretKey: payload.mlKemSecretKey
    }
  };

  const encryptedData = await IdentityCrypto.encryptData(
    JSON.stringify(identityData),
    newKey1,
    input.newKey2
  );

  const recoverySharesSealed = await sealRecoveryShares(
    input.shares.map((s) => normalizeShare(s)),
    newKey1,
    input.newKey2
  );

  return {
    key1: newKey1,
    identity: {
      publicKey: payload.publicKey,
      mlKemPublicKey: payload.mlKemPublicKey,
      encryptedData: encryptedData.encrypted,
      iv: encryptedData.iv,
      salt: encryptedData.salt,
      recoveryEnvelope: input.envelope,
      recoverySharesSealed
    }
  };
}
