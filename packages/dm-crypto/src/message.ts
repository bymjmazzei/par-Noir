import { hkdfSha3_384 } from './hkdf.js';
import { aesGcmEncrypt, aesGcmDecrypt, isDmEnvelope, DM_CRYPTO_VERSION } from './aes.js';
import { base64ToBytes, utf8ToBytes, bytesToUtf8 } from './encoding.js';

export { DM_CRYPTO_VERSION, isDmEnvelope as isDmCiphertext };

export function deriveMessageKey(messageRootKeyB64: string, connectionId: string): Uint8Array {
  const ikm = base64ToBytes(messageRootKeyB64);
  return hkdfSha3_384(ikm, `par-noir-dm-v1:${connectionId}`);
}

export async function encryptDmMessage(plaintext: string, messageKey: Uint8Array): Promise<string> {
  return aesGcmEncrypt(utf8ToBytes(plaintext), messageKey);
}

export async function decryptDmMessage(encryptedContent: string, messageKey: Uint8Array): Promise<string> {
  const bytes = await aesGcmDecrypt(encryptedContent, messageKey);
  return bytesToUtf8(bytes);
}
