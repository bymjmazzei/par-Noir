/**
 * Owner-hosted Shamir share vault encryption (at-rest on user Drive).
 * Key is derivable from identity publicKey + share index; API gates release on K approval ZKPs.
 */

import type { ShamirShare } from './shamir';

export interface OwnerVaultEncryptedShare {
  v: 1;
  index: number;
  ciphertext: string;
  iv: string;
  salt: string;
}

async function deriveVaultKey(identityPublicKey: string, shareIndex: number, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = enc.encode(`par-noir.recovery-vault:${identityPublicKey}:${shareIndex}`);
  const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptOwnerVaultShare(
  share: ShamirShare,
  identityPublicKey: string
): Promise<OwnerVaultEncryptedShare> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(identityPublicKey, share.index, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify({ index: share.index, share: share.share }));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    v: 1,
    index: share.index,
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
  };
}

export async function decryptOwnerVaultShare(
  encrypted: OwnerVaultEncryptedShare,
  identityPublicKey: string
): Promise<ShamirShare> {
  const salt = Uint8Array.from(atob(encrypted.salt), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
  const key = await deriveVaultKey(identityPublicKey, encrypted.index, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as { index: number; share: string };
  return { index: parsed.index, share: parsed.share };
}

export function serializeOwnerVaultShare(encrypted: OwnerVaultEncryptedShare): string {
  return JSON.stringify(encrypted);
}

export function parseOwnerVaultShare(serialized: string): OwnerVaultEncryptedShare {
  const parsed = JSON.parse(serialized) as OwnerVaultEncryptedShare;
  if (parsed.v !== 1 || typeof parsed.index !== 'number') {
    throw new Error('invalid owner vault share format');
  }
  return parsed;
}
