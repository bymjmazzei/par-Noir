/** HKDF context for optional device-bound .pn export (v2). */
export const DEVICE_BOUND_HKDF_SALT = 'pn-device-bound-v1';

export interface DeviceBoundPnBinding {
  type: 'device';
  deviceId: string;
  devicePublicKey: string;
}

export interface DeviceBoundPnEnvelope {
  version?: string;
  timestamp?: string;
  binding?: DeviceBoundPnBinding;
  identities: Array<Record<string, unknown>>;
}

export function isDeviceBoundPnEnvelope(data: unknown): data is DeviceBoundPnEnvelope {
  if (!data || typeof data !== 'object') return false;
  const binding = (data as DeviceBoundPnBinding & { binding?: unknown }).binding
    ?? (data as { binding?: unknown }).binding;
  if (!binding || typeof binding !== 'object') return false;
  const b = binding as DeviceBoundPnBinding;
  return b.type === 'device' && typeof b.deviceId === 'string' && typeof b.devicePublicKey === 'string';
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

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function hkdfSha256(ikm: Uint8Array, salt: string, info: string, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      info: new TextEncoder().encode(info),
    },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

/**
 * Stable binding factor for encryptDataWithBinding / decryptDataWithBinding.
 * Never store or transmit this string — derive locally from the device private key only.
 */
export async function deriveDeviceBindingFactor(
  privateKeyPkcs8Base64: string,
  deviceId: string
): Promise<string> {
  const ikm = base64ToBytes(privateKeyPkcs8Base64);
  const derived = await hkdfSha256(ikm, DEVICE_BOUND_HKDF_SALT, deviceId);
  return bytesToBase64(derived);
}
