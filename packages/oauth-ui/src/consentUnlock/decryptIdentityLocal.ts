/**
 * Decrypt a portable pN identity row with Key 1 + Key 2 (local only).
 * Matches oauth-physical-unlock.js / IdentityCrypto key derivation (browser WebCrypto).
 * Does not import @par-noir/identity-crypto (avoids Node recovery/shamir in the unlock SPA).
 */

import { extractMlDsaSecretKeyB64, type DecryptedIdentityRecord } from './extractMlDsa';

export type { DecryptedIdentityRecord } from './extractMlDsa';
export { extractMlDsaSecretKeyB64 } from './extractMlDsa';

export type EncryptedIdentityRow = {
  publicKey: string;
  encryptedData: string;
  iv: string;
  salt: string;
};

export type UnlockedIdentityBundle = {
  encryptedIdentity: EncryptedIdentityRow;
  publicKey: string;
  did: string;
  decryptedIdentity: DecryptedIdentityRecord;
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKeyWithBinding(
  pnName: string,
  passcode: string,
  saltB64: string,
  uid?: string
): Promise<CryptoKey> {
  const keyMaterialStr = uid ? `${pnName}:${passcode}:${uid}` : `${pnName}:${passcode}`;
  const encoder = new TextEncoder();
  const keyMaterialBuffer = encoder.encode(keyMaterialStr);
  const saltBuffer = base64ToArrayBuffer(saltB64);
  const keyMaterialKey = await crypto.subtle.importKey(
    'raw',
    keyMaterialBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 1_000_000,
      hash: 'SHA-512',
    },
    keyMaterialKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function asEncryptedIdentity(row: Record<string, unknown>): EncryptedIdentityRow {
  const encryptedData = (row.encryptedData ?? row.encrypted) as string | undefined;
  const iv = row.iv as string | undefined;
  const salt = row.salt as string | undefined;
  const publicKey = row.publicKey as string | undefined;
  if (!encryptedData || !iv || !salt) {
    throw new Error('Invalid identity file: missing encrypted data');
  }
  return {
    publicKey: publicKey || '',
    encryptedData,
    iv,
    salt,
  };
}

/** Parse .pn / backup JSON into a single identity row. */
export function parseIdentityFileJson(raw: unknown): EncryptedIdentityRow {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid identity file');
  }
  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.identities)) {
    if (data.identities.length === 0) {
      throw new Error('Invalid pN file: No identities found in backup file');
    }
    if (data.identities.length > 1) {
      throw new Error('Invalid pN file: Multiple identities found. Please use a single identity file.');
    }
    return asEncryptedIdentity(data.identities[0] as Record<string, unknown>);
  }
  if (data.publicKey && (data.encryptedData || data.encrypted)) {
    return asEncryptedIdentity(data);
  }
  throw new Error('Invalid identity file: missing public key or encrypted data');
}

/**
 * Local three-factor decrypt. Never sends pnName/passcode off-device.
 */
export async function decryptIdentityFileLocal(
  identityRow: EncryptedIdentityRow | Record<string, unknown>,
  pnName: string,
  passcode: string
): Promise<UnlockedIdentityBundle> {
  const encryptedIdentity = asEncryptedIdentity(identityRow as Record<string, unknown>);
  if (!encryptedIdentity.publicKey) {
    throw new Error('Invalid identity file: missing public key');
  }
  try {
    const key = await deriveKeyWithBinding(pnName, passcode, encryptedIdentity.salt);
    const iv = base64ToArrayBuffer(encryptedIdentity.iv);
    const data = base64ToArrayBuffer(encryptedIdentity.encryptedData);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, data);
    const plaintext = new TextDecoder().decode(decryptedBuffer);
    const decryptedIdentity = JSON.parse(plaintext) as DecryptedIdentityRecord;
    if (decryptedIdentity.username !== pnName) {
      throw new Error('Authentication failed: pN name does not match identity file');
    }
    const did = typeof decryptedIdentity.id === 'string' ? decryptedIdentity.id : '';
    if (!did) throw new Error('Identity file does not contain a DID');
    const publicKey = encryptedIdentity.publicKey || (decryptedIdentity.publicKey as string);
    if (!publicKey) throw new Error('Invalid pN file: missing public key');
    return {
      encryptedIdentity: { ...encryptedIdentity, publicKey },
      publicKey,
      did,
      decryptedIdentity,
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Authentication failed')) throw e;
    if (e instanceof Error && e.message.includes('DID')) throw e;
    throw new Error('Failed to unlock. Check your Key 1, Key 2, and identity file.');
  }
}
