/**
 * Encryption Service
 * Handles file encryption/decryption and share token generation
 */

import { ShareToken, EncryptedFilePackage, AuthSession } from '../../types/aggregator';
import { EncryptionManager } from '../../utils/crypto/encryptionManager';
import { cryptoWorkerManager } from '../../utils/crypto/cryptoWorkerManager';

export class EncryptionService {
  /**
   * Encrypt file for upload
   * Uses accessToken from authenticated session (pnName and passcode are secrets, never stored)
   */
  async encryptFileForUpload(
    file: File,
    session: AuthSession
  ): Promise<{ encryptedBlob: Blob; packageData: EncryptedFilePackage }> {
    if (!session.accessToken || !session.publicKey) {
      throw new Error('Missing required session data: accessToken and publicKey are required');
    }

    const fileArrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(fileArrayBuffer);

    // Encrypt using authenticated session token (accessToken + publicKey)
    // accessToken is derived from unlock secrets (pnName + passcode) but doesn't expose them
    const encryptionManager = new EncryptionManager();
    const encrypted = await encryptionManager.encrypt(
      fileData,
      session.accessToken,
      session.publicKey
    );

    // Create encrypted file package
    const packageData: EncryptedFilePackage = {
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      salt: encrypted.salt,
      metadata: {
        originalName: file.name,
        originalSize: file.size,
        originalMimeType: file.type,
      },
    };

    // Convert to Blob for upload
    const encryptedBlob = new Blob([JSON.stringify(packageData)], {
      type: 'application/json',
    });

    return { encryptedBlob, packageData };
  }

  /**
   * Decrypt file from download
   * Uses accessToken from authenticated session (pnName and passcode are secrets, never stored)
   */
  async decryptFileFromDownload(
    encryptedPackage: EncryptedFilePackage,
    session: AuthSession
  ): Promise<{ decryptedBlob: Blob; metadata: any }> {
    if (!session.accessToken || !session.publicKey) {
      throw new Error('Missing required session data: accessToken and publicKey are required');
    }

    // Decrypt using authenticated session token (accessToken + publicKey)
    // accessToken is derived from unlock secrets (pnName + passcode) but doesn't expose them
    const encryptionManager = new EncryptionManager();
    const decrypted = await encryptionManager.decrypt(
      encryptedPackage.encrypted,
      encryptedPackage.iv,
      encryptedPackage.salt,
      session.accessToken,
      session.publicKey
    );

    // Create Blob from decrypted data
    const decryptedBlob = new Blob([decrypted], {
      type: encryptedPackage.metadata.originalMimeType || 'application/octet-stream',
    });

    return { decryptedBlob, metadata: encryptedPackage.metadata };
  }

  /**
   * Generate share token for public file
   * Uses accessToken from authenticated session (pnName and passcode are secrets, never stored)
   */
  async generateShareToken(
    encryptedPackage: EncryptedFilePackage,
    session: AuthSession
  ): Promise<ShareToken> {
    if (!session.accessToken || !session.publicKey) {
      throw new Error('Missing required session data: accessToken and publicKey are required');
    }

    // First decrypt the original file using authenticated session token
    const encryptionManager = new EncryptionManager();
    const decrypted = await encryptionManager.decrypt(
      encryptedPackage.encrypted,
      encryptedPackage.iv,
      encryptedPackage.salt,
      session.accessToken,
      session.publicKey
    );

    // Generate a new symmetric key for sharing
    const shareKeyArray = crypto.getRandomValues(new Uint8Array(32));
    const shareKeyBase64 = btoa(String.fromCharCode(...shareKeyArray));

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

    // Convert to base64
    const shareEncryptedBase64 = btoa(
      String.fromCharCode(...new Uint8Array(shareEncrypted))
    );
    const shareIvBase64 = btoa(String.fromCharCode(...shareIv));

    return {
      shareKey: shareKeyBase64,
      shareEncrypted: JSON.stringify({
        encrypted: shareEncryptedBase64,
        iv: shareIvBase64,
        metadata: encryptedPackage.metadata,
      }),
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

