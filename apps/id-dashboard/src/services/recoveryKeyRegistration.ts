/**
 * Register a recovery key from the Recovery tab's unlocked .pn.
 * No custodians: key-only mode, with recovery data sealed to the key itself.
 * With custodians: the key only starts custodian approval.
 */
import {
  buildRecoveryPayload,
  encryptKeyRecoveryEnvelope,
  type KeyRecoveryEnvelope,
} from '@par-noir/recovery-crypto';
import type { RecoveryAuthSession } from './recoveryAuthSession';
import { hashRecoveryKey, registerRecoveryFailsafe, type RecoveryFailsafeMode } from './recoveryApiService';
import { ensureRecoveryDriveProof } from './recoveryRelayFlows';
import { decryptRecoverySessionIdentity, signRecoverySetupChallenge } from './recoverySetupProof';

export async function registerRecoveryKey(params: {
  apiToken: string;
  pnIdentifier: string;
  auth: RecoveryAuthSession;
  recoveryKey: string;
  custodiansConfigured: boolean;
  isKeyedSession: boolean;
}): Promise<{ mode: RecoveryFailsafeMode }> {
  const { auth } = params;
  const identityFile = auth.encryptedIdentity;
  const envelope = identityFile.recoveryEnvelope;
  if (params.custodiansConfigured && !envelope) {
    throw new Error('This .pn file has no recovery envelope. Rotate your pN to add one, then create a recovery key.');
  }

  const decrypted =
    !params.custodiansConfigured || !params.isKeyedSession ? await decryptRecoverySessionIdentity(auth) : undefined;

  let keyEnvelope: KeyRecoveryEnvelope | undefined;
  if (!params.custodiansConfigured) {
    const mlDsaSecretKey = decrypted?.pqcSecrets?.mlDsaSecretKey;
    const mlKemSecretKey = decrypted?.pqcSecrets?.mlKemSecretKey;
    if (!decrypted?.id || !mlDsaSecretKey || !mlKemSecretKey || !identityFile.mlKemPublicKey) {
      throw new Error('This .pn file is missing its keys. Rotate your pN, then create a recovery key.');
    }
    keyEnvelope = await encryptKeyRecoveryEnvelope(
      params.recoveryKey,
      buildRecoveryPayload({
        publicKey: identityFile.publicKey,
        mlKemPublicKey: identityFile.mlKemPublicKey,
        mlKemSecretKey,
        mlDsaSecretKey,
        identityId: decrypted.id,
        // Restoring sets a new Key 1; whoever holds the recovery key never learns the old one.
        pnName: '',
        recoveryConfig: {
          threshold: decrypted.recoveryConfig?.threshold ?? 2,
          totalShares: decrypted.recoveryConfig?.totalShares ?? 5,
          version: 1,
          createdAt: decrypted.recoveryConfig?.createdAt ?? new Date().toISOString(),
        },
      })
    );
  }

  const keyHash = await hashRecoveryKey(params.recoveryKey);
  const driveProofHash = await ensureRecoveryDriveProof(params.pnIdentifier);
  const ownerProof = params.isKeyedSession
    ? undefined
    : await signRecoverySetupChallenge(params.apiToken, auth, decrypted);
  try {
    await registerRecoveryFailsafe(params.apiToken, {
      userPnIdentifier: params.pnIdentifier,
      publicKey: identityFile.publicKey,
      envelope,
      keyEnvelope,
      keyHash,
      driveProofHash,
      ownerProof,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'custodians_configured') {
      throw new Error('Custodians are set up for this pN. Reload the Recovery tab, then create the key again.');
    }
    if (message === 'device_key_required') {
      throw new Error('This pN has a keyed device, so only a keyed device can change recovery.');
    }
    throw err;
  }
  return { mode: params.custodiansConfigured ? 'custodians' : 'key_only' };
}
