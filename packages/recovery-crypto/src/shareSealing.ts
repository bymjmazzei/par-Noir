/**
 * Seal a Shamir share to an ML-KEM-768 public key (custodian identity key or the
 * claimant's temporary recovery key). ML-KEM encapsulate → HKDF-SHA256 → AES-256-GCM.
 * The AAD binds the ciphertext to its purpose so a relay cannot replay it elsewhere.
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { b64ToBytes, bytesToB64, normalizeShare, type ShamirShare } from './shamir';

export const SEALED_SHARE_ALG = 'ML-KEM-768+HKDF-SHA256+AES-256-GCM';
const HKDF_INFO = 'par-noir.recovery-share.v1';

export interface SealedShare {
  v: 1;
  alg: typeof SEALED_SHARE_ALG;
  index: number;
  kem: string;
  iv: string;
  ct: string;
}

export interface RecoveryKeyPair {
  publicKey: string;
  secretKey: string;
}

export function generateRecoveryKeyPair(): RecoveryKeyPair {
  const { publicKey, secretKey } = ml_kem768.keygen();
  return { publicKey: bytesToB64(publicKey), secretKey: bytesToB64(secretKey) };
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Identity-recovery request id is the hash of the temporary public key, so approvals bind the key. */
export async function recoveryRequestIdFor(temporaryPublicKey: string): Promise<string> {
  return sha256Hex(temporaryPublicKey.trim());
}

export function custodyAad(params: {
  ownerPublicKey: string;
  custodianId: string;
  shareIndex: number;
  epoch: number;
}): string {
  return `custody|${params.ownerPublicKey}|${params.custodianId}|${params.shareIndex}|${params.epoch}`;
}

export function releaseAad(params: {
  requestId: string;
  custodianId: string;
  shareIndex: number;
  epoch: number;
}): string {
  return `release|${params.requestId}|${params.custodianId}|${params.shareIndex}|${params.epoch}`;
}

async function deriveAesKey(sharedSecret: Uint8Array, kemCiphertext: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', sharedSecret as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: kemCiphertext as BufferSource,
      info: new TextEncoder().encode(HKDF_INFO) as BufferSource,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function sealShareToKey(
  share: ShamirShare,
  recipientPublicKey: string,
  aad: string
): Promise<SealedShare> {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(b64ToBytes(recipientPublicKey));
  const key = await deriveAesKey(sharedSecret, cipherText);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ index: share.index, share: share.share }));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: new TextEncoder().encode(aad) as BufferSource },
    key,
    plaintext
  );
  return {
    v: 1,
    alg: SEALED_SHARE_ALG,
    index: share.index,
    kem: bytesToB64(cipherText),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
  };
}

export async function openSealedShare(
  sealed: SealedShare,
  recipientSecretKey: string,
  aad: string
): Promise<ShamirShare> {
  if (sealed.v !== 1 || sealed.alg !== SEALED_SHARE_ALG) {
    throw new Error('unsupported sealed share format');
  }
  const kem = b64ToBytes(sealed.kem);
  const sharedSecret = ml_kem768.decapsulate(kem, b64ToBytes(recipientSecretKey));
  const key = await deriveAesKey(sharedSecret, kem);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: b64ToBytes(sealed.iv) as BufferSource,
        additionalData: new TextEncoder().encode(aad) as BufferSource,
      },
      key,
      b64ToBytes(sealed.ct) as BufferSource
    );
  } catch {
    throw new Error('sealed share could not be opened');
  }
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as { index: number; share: string };
  const share = normalizeShare(parsed);
  if (share.index !== sealed.index) throw new Error('sealed share index mismatch');
  return share;
}

export function serializeSealedShare(sealed: SealedShare): string {
  return JSON.stringify(sealed);
}

export function parseSealedShare(raw: string | SealedShare): SealedShare {
  const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SealedShare;
  if (
    !parsed
    || parsed.v !== 1
    || parsed.alg !== SEALED_SHARE_ALG
    || typeof parsed.index !== 'number'
    || !parsed.kem
    || !parsed.iv
    || !parsed.ct
  ) {
    throw new Error('invalid sealed share');
  }
  return parsed;
}
