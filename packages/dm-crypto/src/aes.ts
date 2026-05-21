import { bytesToBase64, base64ToBytes, bytesToUtf8 } from './encoding';

export const DM_CRYPTO_VERSION = 2;

export interface AesGcmEnvelope {
  v: number;
  iv: string;
  ciphertext: string;
  authTag: string;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto subtle API is not available');
  }
  return subtle;
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return getSubtle().importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** AES-256-GCM; returns base64 JSON envelope with explicit auth tag. */
export async function aesGcmEncrypt(plaintext: Uint8Array, rawKey: Uint8Array): Promise<string> {
  const key = await importAesKey(rawKey);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const buf = new Uint8Array(encrypted);
  const ciphertext = buf.slice(0, -16);
  const authTag = buf.slice(-16);
  const payload: AesGcmEnvelope = {
    v: DM_CRYPTO_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    authTag: bytesToBase64(authTag),
  };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
}

export async function aesGcmDecrypt(envelopeB64: string, rawKey: Uint8Array): Promise<Uint8Array> {
  const payload = JSON.parse(bytesToUtf8(base64ToBytes(envelopeB64))) as AesGcmEnvelope;
  if (payload.v !== DM_CRYPTO_VERSION) {
    throw new Error(`Unsupported envelope version: ${payload.v}`);
  }
  const key = await importAesKey(rawKey);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const authTag = base64ToBytes(payload.authTag);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  const decrypted = await getSubtle().decrypt({ name: 'AES-GCM', iv }, key, combined);
  return new Uint8Array(decrypted);
}

export function isDmEnvelope(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const payload = JSON.parse(bytesToUtf8(base64ToBytes(value))) as { v?: number };
    return payload.v === DM_CRYPTO_VERSION;
  } catch {
    return false;
  }
}
