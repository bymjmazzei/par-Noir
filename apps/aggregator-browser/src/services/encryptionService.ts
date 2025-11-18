/**
 * Encryption Service for Browser App
 * Handles share token generation for public files
 * Matches dashboard's EncryptionService logic
 */

import { EncryptionManager } from '../utils/encryptionManager';

export interface ShareToken {
  fileId: string;
  contentKey: {
    encrypted: string;
    wrappedWith: string;
    iv: string;
  };
  expiresAt: string;
  permissions: string[];
  metadata?: {
    title?: string;
    description?: string;
  };
  shareKey?: string;
  shareEncrypted?: {
    encrypted: string;
    iv: string;
    salt: string;
  };
}

export interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata?: {
    originalName?: string;
    originalSize?: number;
    originalMimeType?: string;
    description?: string;
  };
}

export interface AuthSession {
  id: string; // DID
  publicKey: string;
}

export class EncryptionService {
  /**
   * Generate share token for public file
   * Uses stable pN identity (id + publicKey) for consistent decryption
   */
  async generateShareToken(
    encryptedPackage: EncryptedFilePackage,
    session: AuthSession
  ): Promise<ShareToken> {
    if (!session.id || !session.publicKey) {
      throw new Error('Missing required session data: id and publicKey are required');
    }

    // First decrypt the original file using stable pN identity
    const encryptionManager = new EncryptionManager();
    const decrypted = await encryptionManager.decrypt(
      encryptedPackage.encrypted,
      encryptedPackage.iv,
      encryptedPackage.salt,
      session.id,
      session.publicKey
    );

    // Generate a new symmetric key for sharing
    const shareKeyArray = crypto.getRandomValues(new Uint8Array(32));
    // Convert Uint8Array to base64 safely without spreading large arrays
    const shareKeyBase64 = btoa(Array.from(shareKeyArray).map(b => String.fromCharCode(b)).join(''));

    // Re-encrypt with share key
    const shareIv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      'raw',
      shareKeyArray,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const shareEncrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: shareIv },
      key,
      decrypted
    );

    // Convert to base64 safely without spreading large arrays
    const shareEncryptedUint8 = new Uint8Array(shareEncrypted);
    const shareEncryptedBase64 = btoa(Array.from(shareEncryptedUint8).map(b => String.fromCharCode(b)).join(''));
    const shareIvBase64 = btoa(Array.from(shareIv).map(b => String.fromCharCode(b)).join(''));

    // Generate a salt for the share token (for consistency with aggregator browser expectations)
    const saltArray = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = btoa(Array.from(saltArray).map(b => String.fromCharCode(b)).join(''));

    return {
      fileId: encryptedPackage.metadata?.originalName || '',
      contentKey: {
        encrypted: '',
        wrappedWith: '',
        iv: ''
      },
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year expiry
      permissions: ['read'],
      metadata: {
        title: encryptedPackage.metadata?.originalName,
        description: encryptedPackage.metadata?.description
      },
      shareKey: shareKeyBase64,
      shareEncrypted: {
        encrypted: shareEncryptedBase64,
        iv: shareIvBase64,
        salt: saltBase64
      }
    };
  }
}

let encryptionServiceInstance: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EncryptionService();
  }
  return encryptionServiceInstance;
}

