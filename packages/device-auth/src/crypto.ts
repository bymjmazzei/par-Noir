import type { DeviceProofPayload } from './types';
import { serializeDeviceProofPayload } from './proof';

export interface DeviceKeypair {
  deviceId: string;
  publicKey: string;
  privateKey: CryptoKey;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function generateDeviceKeypair(): Promise<DeviceKeypair> {
  const deviceId = crypto.randomUUID();
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  return {
    deviceId,
    publicKey: bytesToBase64(new Uint8Array(spki)),
    privateKey: keyPair.privateKey,
  };
}

export async function importDevicePrivateKey(privateKeyPkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(privateKeyPkcs8Base64),
    { name: 'Ed25519' },
    false,
    ['sign']
  );
}

export async function exportDevicePrivateKey(privateKey: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  return bytesToBase64(new Uint8Array(pkcs8));
}

export async function importDevicePublicKey(publicKeySpkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    base64ToBytes(publicKeySpkiBase64),
    { name: 'Ed25519' },
    true,
    ['verify']
  );
}

export async function signDeviceProof(
  privateKey: CryptoKey,
  payload: DeviceProofPayload
): Promise<string> {
  const message = serializeDeviceProofPayload(payload);
  const sig = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    new TextEncoder().encode(message)
  );
  return bytesToBase64(new Uint8Array(sig));
}

export async function verifyDeviceProof(
  publicKeySpkiBase64: string,
  payload: DeviceProofPayload,
  signatureBase64: string
): Promise<boolean> {
  try {
    const publicKey = await importDevicePublicKey(publicKeySpkiBase64);
    const message = serializeDeviceProofPayload(payload);
    return crypto.subtle.verify(
      'Ed25519',
      publicKey,
      base64ToBytes(signatureBase64),
      new TextEncoder().encode(message)
    );
  } catch {
    return false;
  }
}
