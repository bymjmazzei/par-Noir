import { encryptDmMessage, decryptDmMessage } from './message';
import { base64ToBytes, bytesToBase64 } from './encoding';

/** Encrypt binary media with a 32-byte key (base64). */
export async function encryptMediaBytes(data: Uint8Array, keyB64: string): Promise<string> {
  return encryptDmMessage(bytesToBase64(data), base64ToBytes(keyB64));
}

/** Decrypt media envelope back to bytes. */
export async function decryptMediaBytes(encrypted: string, keyB64: string): Promise<Uint8Array> {
  const b64 = await decryptDmMessage(encrypted, base64ToBytes(keyB64));
  return base64ToBytes(b64);
}
