/**
 * Passcode-bound seal for Shamir shares stored inside the portable .pn identity file.
 * Key derivation matches dashboard identity crypto (pnName:passcode, PBKDF2 1M / SHA-512, AES-GCM).
 */

import { normalizeShare, type ShamirShare } from './shamir';

export interface RecoverySharesSealed {
  v: 1;
  encrypted: string;
  iv: string;
  salt: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function deriveKey(pnName: string, passcode: string, saltB64: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`${pnName}:${passcode}`);
  const salt = base64ToArrayBuffer(saltB64);
  const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 1_000_000, hash: 'SHA-512' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function sealRecoveryShares(
  shares: ShamirShare[],
  pnName: string,
  passcode: string
): Promise<RecoverySharesSealed> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = arrayBufferToBase64(saltBytes.buffer);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pnName, passcode, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(shares));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext);
  return {
    v: 1,
    encrypted: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    salt,
  };
}

export async function unsealRecoveryShares(
  sealed: RecoverySharesSealed,
  pnName: string,
  passcode: string
): Promise<ShamirShare[]> {
  if (sealed.v !== 1) throw new Error('unsupported recovery shares seal version');
  const key = await deriveKey(pnName, passcode, sealed.salt);
  const iv = base64ToArrayBuffer(sealed.iv);
  const ciphertext = base64ToArrayBuffer(sealed.encrypted);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) as BufferSource },
      key,
      ciphertext as BufferSource
    );
  } catch {
    throw new Error('Failed to unseal recovery shares — check Key 1 and Key 2');
  }
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as Array<{ index: number; share?: string; data?: string }>;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Invalid sealed recovery shares payload');
  }
  return parsed.map((row) => normalizeShare(row));
}
