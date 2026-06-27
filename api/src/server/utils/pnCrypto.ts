/**
 * pN Identity Crypto Utilities for Backend
 * Decrypts and verifies pN identity files using the same algorithm as the dashboard
 */

import crypto from 'crypto';

export interface EncryptedIdentity {
  publicKey: string;
  encryptedData: string;
  iv: string;
  salt: string;
}

export interface DecryptedIdentity {
  id: string; // DID
  username: string;
  nickname?: string;
  pnName?: string;
  email?: string;
  phone?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  profilePicture?: string;
  createdAt: string;
  status: string;
  custodiansRequired: boolean;
  custodiansSetup: boolean;
}

/**
 * Decrypt pN identity file using pnName + passcode (both required for key derivation).
 */
export async function decryptIdentity(
  encryptedIdentity: EncryptedIdentity,
  pnName: string,
  passcode: string
): Promise<DecryptedIdentity> {
  try {
    const decryptedData = await decrypt(
      {
        encrypted: encryptedIdentity.encryptedData,
        iv: encryptedIdentity.iv,
        salt: encryptedIdentity.salt,
      },
      pnName,
      passcode
    );

    const identity = JSON.parse(decryptedData) as DecryptedIdentity;

    if (identity.username !== pnName) {
      throw new Error('Authentication failed: username mismatch');
    }

    return identity;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to decrypt identity: ${message}`);
  }
}

/**
 * Verify pN name matches decrypted identity
 */
export function verifyPnName(identity: DecryptedIdentity, expectedPnName: string): boolean {
  const resolvedPnName = identity.pnName || identity.username || identity.nickname || identity.id;
  return resolvedPnName === expectedPnName;
}

/**
 * Decrypt encrypted data using pnName + passcode (matches dashboard IdentityCrypto.deriveKey).
 */
async function decrypt(
  encryptedData: { encrypted: string; iv: string; salt: string },
  pnName: string,
  passcode: string
): Promise<string> {
  try {
    const encryptedBuffer = Buffer.from(encryptedData.encrypted, 'base64');
    const ivBuffer = Buffer.from(encryptedData.iv, 'base64');
    const saltBuffer = Buffer.from(encryptedData.salt, 'base64');

    const keyMaterial = `${pnName}:${passcode}`;
    const key = crypto.pbkdf2Sync(keyMaterial, saltBuffer, 1000000, 32, 'sha512');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);

    const authTagLength = 16;
    const ciphertext = encryptedBuffer.slice(0, -authTagLength);
    const authTag = encryptedBuffer.slice(-authTagLength);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    throw new Error('Invalid pN name, passcode, or corrupted identity file');
  }
}
