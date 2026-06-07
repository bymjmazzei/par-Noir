import { hkdfSha3_384 } from './hkdf';
import { aesGcmEncrypt, aesGcmDecrypt } from './aes';
import { base64ToBytes, bytesToBase64, utf8ToBytes } from './encoding';

/** Wrap key for distributing chatKey to a member (owner + pairwise connection). */
export function deriveGroupWrapKey(
  ownerPn: string,
  connectionKeyB64: string,
  groupId: string
): Uint8Array {
  const ikm = base64ToBytes(connectionKeyB64);
  const salt = utf8ToBytes(ownerPn);
  return hkdfSha3_384(ikm, `par-noir-group-wrap-v1:${groupId}`, salt);
}

export async function wrapChatKey(chatKeyB64: string, wrapKey: Uint8Array): Promise<string> {
  return aesGcmEncrypt(base64ToBytes(chatKeyB64), wrapKey);
}

export async function unwrapChatKey(wrappedB64: string, wrapKey: Uint8Array): Promise<string> {
  const raw = await aesGcmDecrypt(wrappedB64, wrapKey);
  return bytesToBase64(raw);
}

/** Owner self-wrap using ML-KEM secret (no pairwise session to self). */
export function deriveOwnerSelfWrapKey(mlKemSecretKeyB64: string, groupId: string): Uint8Array {
  const ikm = base64ToBytes(mlKemSecretKeyB64);
  return hkdfSha3_384(ikm, `par-noir-group-owner-wrap-v1:${groupId}`, utf8ToBytes('owner'));
}

export async function wrapChatKeyForOwner(
  chatKeyB64: string,
  mlKemSecretKeyB64: string,
  groupId: string
): Promise<string> {
  const wrapKey = deriveOwnerSelfWrapKey(mlKemSecretKeyB64, groupId);
  return wrapChatKey(chatKeyB64, wrapKey);
}

export async function unwrapChatKeyForOwner(
  wrappedB64: string,
  mlKemSecretKeyB64: string,
  groupId: string
): Promise<string> {
  const wrapKey = deriveOwnerSelfWrapKey(mlKemSecretKeyB64, groupId);
  return unwrapChatKey(wrappedB64, wrapKey);
}

/** 32-byte random chat key (base64). */
export function generateChatKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes);
}

export function generateGroupId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `grp_${bytesToBase64(bytes).replace(/[+/=]/g, '').slice(0, 22)}`;
}
