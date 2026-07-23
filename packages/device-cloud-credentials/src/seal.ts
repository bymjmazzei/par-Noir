import type { SealSession, SealedEnvelope } from './types.js';

const SALT = 'device_cloud_credentials_salt_v1';

async function deriveKey(session: SealSession, saltBytes: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${session.sessionId}::${session.pnName}::${session.passcode}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100_000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function sealCredentials(
  plaintext: unknown,
  session: SealSession,
  expiresAt?: string | null
): Promise<SealedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(session, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    encryptedData: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    expiresAt: expiresAt ?? null,
    updatedAt: new Date().toISOString()
  };
}

export async function unsealCredentials<T = unknown>(
  envelope: SealedEnvelope,
  session: SealSession
): Promise<T> {
  if (envelope.expiresAt) {
    const exp = Date.parse(envelope.expiresAt);
    if (!Number.isNaN(exp) && Date.now() > exp) {
      throw new Error('Sealed cloud credentials expired (web grace TTL)');
    }
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveKey(session, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBytes(envelope.encryptedData)
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
