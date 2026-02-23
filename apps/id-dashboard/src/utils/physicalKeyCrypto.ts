/**
 * Physical key crypto utilities for USB drive binding.
 * - UID generation for USB-bound pN files
 * - Encrypt/decrypt container for drive passcode protection
 */

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export interface DriveContainer {
  uid: string;
  boundPnBlob: string;
}

/**
 * Generate a random UID for USB binding (32 bytes).
 */
export function generateUid(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Convert UID to base64 for storage.
 */
export function uidToBase64(uid: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < uid.byteLength; i++) {
    binary += String.fromCharCode(uid[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 UID back to Uint8Array.
 */
export function base64ToUid(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt UID + bound pN blob with drive passcode.
 * Returns base64-encoded container for storage on drive.
 */
export async function encryptForDrive(
  uid: Uint8Array,
  boundPnBlob: string,
  drivePasscode: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveDriveKey(drivePasscode, salt);

  const container: DriveContainer = {
    uid: uidToBase64(uid),
    boundPnBlob
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(container));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Decrypt drive container with drive passcode.
 * Returns { uid, boundPnBlob }.
 */
export async function decryptFromDrive(
  encryptedBase64: string,
  drivePasscode: string
): Promise<DriveContainer> {
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveDriveKey(drivePasscode, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as DriveContainer;
}

async function deriveDriveKey(passcode: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-512'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
