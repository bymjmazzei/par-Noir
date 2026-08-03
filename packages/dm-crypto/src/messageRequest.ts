import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { hkdfSha3_384 } from './hkdf.js';
import { aesGcmEncrypt, aesGcmDecrypt } from './aes.js';
import { base64ToBytes, bytesToBase64, utf8ToBytes, bytesToUtf8 } from './encoding.js';

/** One-shot encrypt a cold message request to recipient ML-KEM public key. */
export async function encryptMessageRequest(
  plaintext: string,
  recipientMlKemPublicKeyB64: string
): Promise<{ encryptedContent: string; kemCiphertext: string }> {
  const peerPk = base64ToBytes(recipientMlKemPublicKeyB64);
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(peerPk);
  const key = hkdfSha3_384(sharedSecret, 'par-noir-message-request-v1', utf8ToBytes('request'));
  const encryptedContent = await aesGcmEncrypt(utf8ToBytes(plaintext), key);
  return {
    encryptedContent,
    kemCiphertext: bytesToBase64(cipherText)
  };
}

/** Recipient decrypts with ML-KEM secret key. */
export async function decryptMessageRequest(
  encryptedContent: string,
  kemCiphertextB64: string,
  mlKemSecretKeyB64: string
): Promise<string> {
  const ct = base64ToBytes(kemCiphertextB64);
  const sk = base64ToBytes(mlKemSecretKeyB64);
  const shared = ml_kem768.decapsulate(ct, sk);
  const key = hkdfSha3_384(shared, 'par-noir-message-request-v1', utf8ToBytes('request'));
  const bytes = await aesGcmDecrypt(encryptedContent, key);
  return bytesToUtf8(bytes);
}
