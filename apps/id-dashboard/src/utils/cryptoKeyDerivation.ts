import { cryptoWorkerManager } from '@par-noir/identity-crypto';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** PBKDF2 key derivation via shared identity-crypto worker. */
export class KeyDerivation {
  static async deriveKey(passcode: string, salt: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passcodeBuffer = encoder.encode(passcode);
    const saltBuffer = base64ToArrayBuffer(salt);

    const keyMaterial = await cryptoWorkerManager.importKey(
      'raw',
      passcodeBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return cryptoWorkerManager.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 1000000,
        hash: 'SHA-512',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async generateSignature(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await cryptoWorkerManager.hash('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
  }
}

export const deriveKey = KeyDerivation.deriveKey;
