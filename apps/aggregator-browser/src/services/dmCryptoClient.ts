/**
 * Client-side E2E encrypt/decrypt for DMs.
 */

import {
  deriveMessageKey,
  encryptDmMessage,
  decryptDmMessage,
  openDmSession,
  establishDmSession,
  isDmCiphertext
} from '@par-noir/dm-crypto';
import { getMessageRootKey, setMessageRootKey } from './dmSessionCache';
import { getDmIdentity } from './dmIdentitySession';

export async function ensureMessageRootKey(
  connectionId: string,
  kemCiphertext?: string
): Promise<string> {
  const cached = getMessageRootKey(connectionId);
  if (cached) return cached;

  if (!kemCiphertext) {
    throw new Error('Missing KEM session data for this conversation');
  }

  const { mlKemSecretKey } = getDmIdentity();
  const root = openDmSession(kemCiphertext, mlKemSecretKey);
  setMessageRootKey(connectionId, root);
  return root;
}

export async function encryptOutgoingMessage(
  plaintext: string,
  connectionId: string,
  kemCiphertext?: string
): Promise<string> {
  const root = await ensureMessageRootKey(connectionId, kemCiphertext);
  const messageKey = deriveMessageKey(root, connectionId);
  return encryptDmMessage(plaintext, messageKey);
}

export async function decryptIncomingMessage(
  encryptedContent: string,
  connectionId: string,
  kemCiphertext?: string
): Promise<string> {
  if (!encryptedContent) return '';
  if (!isDmCiphertext(encryptedContent)) {
    return encryptedContent;
  }
  const root = await ensureMessageRootKey(connectionId, kemCiphertext);
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
