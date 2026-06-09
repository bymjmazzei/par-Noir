/**
 * Encrypt Shamir shares for custodian storage (pre-shared passcode channel).
 * Share plaintext never stored on Drive or API in cleartext.
 */

import type { ShamirShare } from './shamir';

export interface EncryptedCustodianShare {
  v: 1;
  index: number;
  ciphertext: string;
  iv: string;
  salt: string;
}

async function deriveKey(passcode: string, salt: Uint8Array, identityPublicKey: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = enc.encode(`${passcode}:${identityPublicKey}`);
  const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptCustodianShare(
  share: ShamirShare,
  custodianPasscode: string,
  identityPublicKey: string
): Promise<EncryptedCustodianShare> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(custodianPasscode, salt, identityPublicKey);
  const plaintext = new TextEncoder().encode(JSON.stringify({ index: share.index, share: share.share }));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    v: 1,
    index: share.index,
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt))
  };
}

export async function decryptCustodianShare(
  encrypted: EncryptedCustodianShare,
  custodianPasscode: string,
  identityPublicKey: string
): Promise<ShamirShare> {
  const salt = Uint8Array.from(atob(encrypted.salt), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
  const key = await deriveKey(custodianPasscode, salt, identityPublicKey);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as { index: number; share: string };
  return { index: parsed.index, share: parsed.share };
}

export function serializeEncryptedShare(encrypted: EncryptedCustodianShare): string {
  return JSON.stringify(encrypted);
}

export function parseEncryptedShare(raw: string): EncryptedCustodianShare {
  const parsed = JSON.parse(raw) as EncryptedCustodianShare;
  if (parsed.v !== 1 || !parsed.ciphertext || !parsed.iv || !parsed.salt) {
    throw new Error('Invalid encrypted custodian share');
  }
  return parsed;
}
