/**
 * Client-side group key wrap using owner pairwise messageRootKey.
 */

import {
  deriveGroupWrapKey,
  wrapChatKey,
  unwrapChatKey,
  generateChatKey,
  generateGroupId,
  encryptDmMessage,
  decryptDmMessage
} from '@par-noir/dm-crypto';
import { ensureMessageRootKey } from './dmCryptoClient';

export { generateChatKey, generateGroupId };

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function wrapChatKeyForMember(
  chatKeyB64: string,
  ownerPnIdentifier: string,
  connectionId: string,
  kemCiphertext: string | undefined,
  groupId: string
): Promise<string> {
  const messageRootKey = await ensureMessageRootKey(connectionId, kemCiphertext);
  const wrapKey = deriveGroupWrapKey(ownerPnIdentifier, messageRootKey, groupId);
  return wrapChatKey(chatKeyB64, wrapKey);
}

export async function unwrapGroupChatKey(
  wrappedChatKey: string,
  ownerPnIdentifier: string,
  connectionId: string,
  kemCiphertext: string | undefined,
  groupId: string
): Promise<string> {
  const messageRootKey = await ensureMessageRootKey(connectionId, kemCiphertext);
  const wrapKey = deriveGroupWrapKey(ownerPnIdentifier, messageRootKey, groupId);
  return unwrapChatKey(wrappedChatKey, wrapKey);
}

export async function encryptGroupMessage(plaintext: string, chatKeyB64: string): Promise<string> {
  return encryptDmMessage(plaintext, b64ToBytes(chatKeyB64));
}

export async function decryptGroupMessage(encrypted: string, chatKeyB64: string): Promise<string> {
  return decryptDmMessage(encrypted, b64ToBytes(chatKeyB64));
}
