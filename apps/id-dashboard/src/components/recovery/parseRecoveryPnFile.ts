import type { RecoveryEnvelope } from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';

export interface ParsedRecoveryPnFile {
  identity: EncryptedIdentity;
  envelope: RecoveryEnvelope;
  publicKey: string;
}

export function parseRecoveryPnFile(raw: unknown): ParsedRecoveryPnFile {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const identity = (data?.encryptedData || data) as EncryptedIdentity;
  if (!identity?.publicKey || !identity?.recoveryEnvelope) {
    throw new Error('This .pn file does not include a recovery envelope. Use an identity created with custodian recovery enabled.');
  }
  return {
    identity,
    envelope: identity.recoveryEnvelope,
    publicKey: identity.publicKey
  };
}
