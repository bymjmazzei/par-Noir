/**
 * Client-side E2E encrypt/decrypt for DMs.
 */

import {
  deriveMessageKey,
  encryptDmMessage,
  decryptDmMessage,
  establishDmSession,
  isDmCiphertext,
  resolveMessageRootKey,
  wrapMessageRootKey,
} from '@par-noir/dm-crypto';
import {
  getMessageRootKey,
  setMessageRootKey,
  getLegacyMessageRootKey,
  setLegacyMessageRootKey,
} from './dmSessionCache';
import { getDmIdentity } from './dmIdentitySession';

/** Recovery blobs from user Drive inbox (not localStorage). */
export interface DmSessionRecovery {
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
}

export async function ensureMessageRootKey(
  connectionId: string,
  recovery?: DmSessionRecovery,
  opts?: { allowLegacyFallback?: boolean }
): Promise<string> {
  const { mlKemSecretKey } = getDmIdentity();
  const legacy =
    opts?.allowLegacyFallback !== false ? getLegacyMessageRootKey(connectionId) : undefined;

  const root = await resolveMessageRootKey(connectionId, mlKemSecretKey, {
    kemCiphertext: recovery?.kemCiphertext,
    wrappedMessageRootKey: recovery?.wrappedMessageRootKey,
    legacyRoot: legacy,
  });

  setMessageRootKey(connectionId, root);
  return root;
}

export function cacheLegacyMessageRoot(connectionId: string, rootB64: string): void {
  setLegacyMessageRootKey(connectionId, rootB64);
}

export async function encryptOutgoingMessage(
  plaintext: string,
  connectionId: string,
  recovery?: DmSessionRecovery
): Promise<string> {
  const root = await ensureMessageRootKey(connectionId, recovery);
  const messageKey = deriveMessageKey(root, connectionId);
  return encryptDmMessage(plaintext, messageKey);
}

export async function decryptIncomingMessage(
  encryptedContent: string,
  connectionId: string,
  recovery?: DmSessionRecovery
): Promise<string> {
  if (!encryptedContent) return '';
  if (!isDmCiphertext(encryptedContent)) {
    return encryptedContent;
  }
  const root = await ensureMessageRootKey(connectionId, recovery, { allowLegacyFallback: true });
  const messageKey = deriveMessageKey(root, connectionId);
  return decryptDmMessage(encryptedContent, messageKey);
}

export function createKemSession(peerMlKemPublicKey: string): {
  kemCiphertext: string;
  messageRootKey: string;
} {
  const { mlKemSecretKey } = getDmIdentity();
  const { kemCiphertext, messageRootKey } = establishDmSession(peerMlKemPublicKey, mlKemSecretKey);
  return { kemCiphertext, messageRootKey };
}

export async function wrapAcceptorMessageRootKey(
  messageRootKey: string,
  connectionId: string
): Promise<string> {
  const { mlKemSecretKey } = getDmIdentity();
  return wrapMessageRootKey(messageRootKey, mlKemSecretKey, connectionId);
}
