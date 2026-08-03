/**
 * Decrypt identity encryptedData (same PBKDF2 params as id-dashboard IdentityCrypto).
 * Browser-only; requires Web Crypto.
 */

import { base64ToBytes, bytesToUtf8 } from './encoding.js';
import { deriveMlKemPublicKeyFromSecretKey } from './session.js';

export interface EncryptedIdentityPayload {
  encryptedData: string;
  iv: string;
  salt: string;
  publicKey?: string;
  mlKemPublicKey?: string;
}

export interface DecryptedIdentitySecrets {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
  publicKey?: string;
  pnName?: string;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bytes = base64ToBytes(b64);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function deriveIdentityKey(pnName: string, passcode: string, saltB64: string): Promise<CryptoKey> {
  const keyMaterial = `${pnName}:${passcode}`;
  const encoder = new TextEncoder();
  const keyMaterialKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToArrayBuffer(saltB64),
      iterations: 1_000_000,
      hash: 'SHA-512',
    },
    keyMaterialKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/** Decrypt encrypted identity JSON and extract ML-KEM secret (base64). */
export async function unlockIdentityMlKemSecret(
  payload: EncryptedIdentityPayload,
  pnName: string,
  passcode: string
): Promise<DecryptedIdentitySecrets> {
  const key = await deriveIdentityKey(pnName, passcode, payload.salt);
  const iv = base64ToArrayBuffer(payload.iv);
  const data = base64ToArrayBuffer(payload.encryptedData);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  const json = bytesToUtf8(new Uint8Array(decrypted));
  const identity = JSON.parse(json) as {
    username?: string;
    pnName?: string;
    pqcSecrets?: { mlKemSecretKey?: string; mlKemPublicKey?: string };
    publicKey?: string;
    mlKemPublicKey?: string;
  };

  const username = identity.username ?? identity.pnName;
  if (username && username !== pnName) {
    throw new Error('Authentication failed: username mismatch');
  }

  const mlKemSecretKey =
    identity.pqcSecrets?.mlKemSecretKey ??
    (identity as { mlKemSecretKey?: string }).mlKemSecretKey;
  if (!mlKemSecretKey) {
    throw new Error('Identity has no ML-KEM secret key');
  }

  return {
    mlKemSecretKey,
    mlKemPublicKey: deriveMlKemPublicKeyFromSecretKey(mlKemSecretKey),
    publicKey: payload.publicKey ?? identity.publicKey,
    pnName: username ?? pnName,
  };
}
