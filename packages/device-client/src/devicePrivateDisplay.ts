import type { DeviceType } from '@par-noir/device-auth';

export interface DevicePrivateDisplay {
  label: string;
  deviceType: DeviceType;
  lastSeenAt: string;
}

/** Same wire shape as identity-crypto EncryptedData (AES-GCM + PBKDF2). */
interface SealedBlob {
  encrypted: string;
  iv: string;
  salt: string;
}

const PBKDF2_ITERATIONS = 1_000_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(key1: string, key2: string, saltB64: string): Promise<CryptoKey> {
  const keyMaterial = `${key1}:${key2}`;
  const imported = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-512',
    },
    imported,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Seal display-only device fields with Key 1 + Key 2.
 * Compatible with EncryptionManager.encrypt(Key 1, Key 2) ciphertext shape.
 * API stores the returned opaque string without decrypting.
 */
export async function sealDevicePrivateDisplay(
  display: DevicePrivateDisplay,
  key1: string,
  key2: string
): Promise<string> {
  const payload = JSON.stringify({
    label: display.label,
    deviceType: display.deviceType,
    lastSeenAt: display.lastSeenAt,
  });
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(key1, key2, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload)
  );
  const sealed: SealedBlob = {
    encrypted: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt,
  };
  return JSON.stringify(sealed);
}

/**
 * Unseal opaque privateDisplay from the device registry.
 */
export async function unsealDevicePrivateDisplay(
  blob: string,
  key1: string,
  key2: string
): Promise<DevicePrivateDisplay> {
  let sealed: SealedBlob;
  try {
    sealed = JSON.parse(blob) as SealedBlob;
  } catch {
    throw new Error('Invalid privateDisplay blob');
  }
  if (!sealed?.encrypted || !sealed?.iv || !sealed?.salt) {
    throw new Error('Invalid privateDisplay blob');
  }
  const key = await deriveKey(key1, key2, sealed.salt);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(sealed.iv) },
      key,
      base64ToBytes(sealed.encrypted)
    );
  } catch {
    throw new Error('Failed to decrypt privateDisplay');
  }
  const parsed = JSON.parse(new TextDecoder().decode(plainBuf)) as Partial<DevicePrivateDisplay>;
  const deviceType = (parsed.deviceType || 'other') as DeviceType;
  return {
    label: typeof parsed.label === 'string' ? parsed.label : 'Device',
    deviceType:
      deviceType === 'mobile' ||
      deviceType === 'desktop' ||
      deviceType === 'tablet' ||
      deviceType === 'other'
        ? deviceType
        : 'other',
    lastSeenAt: typeof parsed.lastSeenAt === 'string' ? parsed.lastSeenAt : '',
  };
}
