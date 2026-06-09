import {
  decryptOwnerVaultShare,
  encryptOwnerVaultShare,
  parseOwnerVaultShare,
  serializeOwnerVaultShare,
  type OwnerVaultEncryptedShare,
  type ShamirShare,
} from '@par-noir/recovery-crypto';
import type { IdentityKeyMaterial } from './types';

/** Decrypt vault share with predecessor public key, re-encrypt with successor public key. */
export async function migrateOwnerVaultShare(
  serialized: string,
  predecessorPublicKey: string,
  successorPublicKey: string
): Promise<string> {
  const encrypted = parseOwnerVaultShare(serialized);
  const share = await decryptOwnerVaultShare(encrypted, predecessorPublicKey);
  const reencrypted = await encryptOwnerVaultShare(share, successorPublicKey);
  return serializeOwnerVaultShare(reencrypted);
}

export async function migrateOwnerVaultShares(
  shares: Array<{ serialized: string }>,
  predecessor: Pick<IdentityKeyMaterial, 'publicKey'>,
  successor: Pick<IdentityKeyMaterial, 'publicKey'>
): Promise<string[]> {
  const out: string[] = [];
  for (const s of shares) {
    out.push(await migrateOwnerVaultShare(s.serialized, predecessor.publicKey, successor.publicKey));
  }
  return out;
}

export function shamirShareFromVault(serialized: string, identityPublicKey: string): Promise<ShamirShare> {
  const encrypted = parseOwnerVaultShare(serialized) as OwnerVaultEncryptedShare;
  return decryptOwnerVaultShare(encrypted, identityPublicKey);
}
