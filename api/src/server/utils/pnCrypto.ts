/**
 * pN Identity Crypto Utilities for Backend
 * Decrypts and verifies pN identity files using the same algorithm as the frontend
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
 * Decrypt pN identity file using passcode
 */
export async function decryptIdentity(
  encryptedIdentity: EncryptedIdentity,
  passcode: string
): Promise<DecryptedIdentity> {
  try {
    // Decrypt the encrypted data
    const decryptedData = await decrypt(
      {
        encrypted: encryptedIdentity.encryptedData,
        iv: encryptedIdentity.iv,
        salt: encryptedIdentity.salt
      },
      passcode
    );

    // Parse the decrypted identity
    const identity = JSON.parse(decryptedData);
    
    return identity;
  } catch (error: any) {
    throw new Error(`Failed to decrypt identity: ${error.message}`);
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
 * Decrypt encrypted data using passcode
 * Matches the frontend implementation using PBKDF2 and AES-GCM
 */
async function decrypt(
  encryptedData: { encrypted: string; iv: string; salt: string },
  passcode: string
): Promise<string> {
  try {
    // Convert base64 strings to buffers
    const encryptedBuffer = Buffer.from(encryptedData.encrypted, 'base64');
    const ivBuffer = Buffer.from(encryptedData.iv, 'base64');
    const saltBuffer = Buffer.from(encryptedData.salt, 'base64');

    // Derive key using PBKDF2 (same as frontend)
    // Frontend uses 1000000 iterations with SHA-512 (military-grade)
    const key = crypto.pbkdf2Sync(
      passcode,
      saltBuffer,
      1000000, // Same iterations as frontend (military-grade: 1M iterations)
      32, // 256 bits = 32 bytes for AES-256
      'sha512' // Same hash as frontend (military-grade: SHA-512)
    );

    // Decrypt using AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    
    // Extract auth tag (last 16 bytes of encrypted data)
    const authTagLength = 16;
    const ciphertext = encryptedBuffer.slice(0, -authTagLength);
    const authTag = encryptedBuffer.slice(-authTagLength);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error: any) {
    // If decryption fails, the passcode is wrong
    throw new Error('Invalid passcode or corrupted identity file');
  }
}

