/**
 * Sealed payloads for private peer delivery over the mailbox rail.
 *
 * The mailbox is a durable Postgres throughway, and sanitizeMailboxPayload
 * strips every clear pn field from it by design. A connection request still has
 * to carry the requester's pn, their ML-KEM public key, and their route key, so
 * that content rides as ciphertext only the recipient can open.
 *
 * Same ML-KEM-768 primitives as DM session setup: encapsulate to the peer's
 * published public key, derive an AES key from the shared secret.
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { bytesToBase64, base64ToBytes } from './encoding.js';
import { deriveMessageKey, encryptDmMessage, decryptDmMessage } from './message.js';

export interface SocialEnvelope {
  kemCiphertext: string;
  ciphertext: string;
}

/**
 * contextId binds the ciphertext to one logical event (a connectionId, a follow
 * pair, a group message id), so a payload lifted onto a different job does not
 * decrypt.
 */
export async function sealSocialEnvelope(
  peerMlKemPublicKeyB64: string,
  contextId: string,
  payload: unknown
): Promise<SocialEnvelope> {
  const peerPk = base64ToBytes(peerMlKemPublicKeyB64);
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(peerPk);
  const messageKey = deriveMessageKey(bytesToBase64(sharedSecret), contextId);
  return {
    kemCiphertext: bytesToBase64(cipherText),
    ciphertext: await encryptDmMessage(JSON.stringify(payload), messageKey)
  };
}

export async function openSocialEnvelope<T>(
  envelope: SocialEnvelope,
  myMlKemSecretKeyB64: string,
  contextId: string
): Promise<T> {
  const ct = base64ToBytes(envelope.kemCiphertext);
  const sk = base64ToBytes(myMlKemSecretKeyB64);
  const shared = ml_kem768.decapsulate(ct, sk);
  const messageKey = deriveMessageKey(bytesToBase64(shared), contextId);
  const plaintext = await decryptDmMessage(envelope.ciphertext, messageKey);
  return JSON.parse(plaintext) as T;
}

export function isSocialEnvelope(value: unknown): value is SocialEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.kemCiphertext === 'string' && typeof v.ciphertext === 'string';
}
