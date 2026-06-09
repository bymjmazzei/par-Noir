import type { EncryptedFilePackage, IdentityKeyMaterial } from './types';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return arrayBufferToBase64(salt.buffer);
}

function generateIV(): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(12)).buffer;
}

async function deriveIdentityFileKey(keyMaterial: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterialBuffer = encoder.encode(keyMaterial);
  const saltBuffer = base64ToArrayBuffer(salt);
  const importedKey = await crypto.subtle.importKey('raw', keyMaterialBuffer, 'PBKDF2', false, [
    'deriveBits',
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 1_000_000, hash: 'SHA-512' },
    importedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function hashIdentityKeyMaterial(pnId: string, publicKey: string): Promise<string> {
  const combined = `${pnId}:${publicKey}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(combined));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function decryptDriveFilePackage(
  pkg: EncryptedFilePackage,
  identity: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>
): Promise<Uint8Array> {
  const hashed = await hashIdentityKeyMaterial(identity.did, identity.publicKey);
  const key = await deriveIdentityFileKey(hashed, pkg.salt);
  const iv = base64ToArrayBuffer(pkg.iv);
  const data = base64ToArrayBuffer(pkg.encrypted);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new Uint8Array(decrypted);
}

export async function encryptDriveFilePackage(
  data: Uint8Array,
  identity: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>,
  metadata?: EncryptedFilePackage['metadata']
): Promise<EncryptedFilePackage> {
  const hashed = await hashIdentityKeyMaterial(identity.did, identity.publicKey);
  const salt = generateSalt();
  const key = await deriveIdentityFileKey(hashed, salt);
  const iv = generateIV();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
    salt,
    metadata,
  };
}

/** Decrypt with predecessor keys, re-encrypt with successor keys. */
export async function reencryptDriveFilePackage(
  pkg: EncryptedFilePackage,
  predecessor: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>,
  successor: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>
): Promise<EncryptedFilePackage> {
  const plaintext = await decryptDriveFilePackage(pkg, predecessor);
  return encryptDriveFilePackage(plaintext, successor, pkg.metadata);
}

export function parseEncryptedFilePackage(json: string): EncryptedFilePackage | null {
  try {
    const parsed = JSON.parse(json) as EncryptedFilePackage;
    if (!parsed.encrypted || !parsed.iv || !parsed.salt) return null;
    return parsed;
  } catch {
    return null;
  }
}
