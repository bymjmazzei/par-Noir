import { establishDmSession, openDmSession } from '@par-noir/dm-crypto';
import type { ConnectionRef, IdentityKeyMaterial } from './types';

export interface DmRekeyResult {
  connectionId: string;
  newKemCiphertext?: string;
  newMessageRootKey: string;
  legacyMessageRootKey?: string;
}

/**
 * Re-key a DM connection where the migrating user was the requester.
 * Self-encapsulates to new mlKem public key; caches legacy root for history decrypt.
 */
export function rekeyConnectionAsRequester(
  connection: ConnectionRef,
  predecessor: Pick<IdentityKeyMaterial, 'mlKemSecretKey' | 'mlKemPublicKey'>,
  successor: Pick<IdentityKeyMaterial, 'mlKemSecretKey' | 'mlKemPublicKey'>
): DmRekeyResult {
  let legacyMessageRootKey: string | undefined;
  if (connection.kemCiphertext) {
    try {
      legacyMessageRootKey = openDmSession(connection.kemCiphertext, predecessor.mlKemSecretKey);
    } catch {
      /* no legacy session */
    }
  }
  const { kemCiphertext, messageRootKey } = establishDmSession(successor.mlKemPublicKey, successor.mlKemSecretKey);
  const verified = openDmSession(kemCiphertext, successor.mlKemSecretKey);
  if (verified !== messageRootKey) {
    throw new Error('DM self-rekey verification failed');
  }
  return {
    connectionId: connection.connectionId,
    newKemCiphertext: kemCiphertext,
    newMessageRootKey: messageRootKey,
    legacyMessageRootKey,
  };
}

/**
 * Acceptor side: preserve legacy root from accept-time cache; no sheet kem update needed.
 */
export function preserveLegacyRootForAcceptor(
  connectionId: string,
  legacyMessageRootKey: string
): Pick<DmRekeyResult, 'connectionId' | 'legacyMessageRootKey'> {
  return { connectionId, legacyMessageRootKey };
}

export function resolveMessageRootKeyWithFallback(
  connectionId: string,
  kemCiphertext: string | undefined,
  mlKemSecretKey: string,
  legacyRoots: Record<string, string>,
  currentRoots: Record<string, string>
): string {
  const cached = currentRoots[connectionId];
  if (cached) return cached;
  if (kemCiphertext) {
    try {
      return openDmSession(kemCiphertext, mlKemSecretKey);
    } catch {
      /* fall through */
    }
  }
  const legacy = legacyRoots[connectionId];
  if (legacy) return legacy;
  throw new Error(`Missing message root key for connection ${connectionId}`);
}
