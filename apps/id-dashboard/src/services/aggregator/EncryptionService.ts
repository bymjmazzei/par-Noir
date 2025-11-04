/**
 * Encryption Service
 * Handles file encryption/decryption and share token generation
 */

import { ShareToken, EncryptedFilePackage } from '../../types/aggregator';
import { EncryptionManager } from '../../utils/crypto/encryptionManager';
import { cryptoWorkerManager } from '../../utils/crypto/cryptoWorkerManager';

export class EncryptionService {
  /**
   * Encrypt file for upload
   */
  async encryptFileForUpload(
    file: File,
    pnName: string,
    publicKey: string,
    passcode: string
  ): Promise<{ encryptedBlob: Blob; packageData: EncryptedFilePackage }> {
    const fileArrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(fileArrayBuffer);

    // Encrypt using 3-factor key derivation
    const encryptionManager = new EncryptionManager();
    const encrypted = await encryptionManager.encrypt(
      fileData,
      pnName,
      passcode,
      publicKey
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
   */
  async decryptFileFromDownload(
    encryptedPackage: EncryptedFilePackage,
    pnName: string,
    publicKey: string,
    passcode: string
  ): Promise<{ decryptedBlob: Blob; metadata: any }> {
    // Decrypt using 3-factor key derivation (pnName + passcode + publicKey)
    // All three factors are required and come from the authenticated session
    const encryptionManager = new EncryptionManager();
    const decrypted = await encryptionManager.decrypt(
      encryptedPackage.encrypted,
      encryptedPackage.iv,
      encryptedPackage.salt,
      pnName,
      passcode,
      publicKey
    );

    // Create Blob from decrypted data
    const decryptedBlob = new Blob([decrypted], {
      type: encryptedPackage.metadata.originalMimeType || 'application/octet-stream',
    });

    return { decryptedBlob, metadata: encryptedPackage.metadata };
  }

  /**
   * Generate share token for public file
   */
  async generateShareToken(
    encryptedPackage: EncryptedFilePackage,
    pnName: string,
    publicKey: string,
    passcode: string
  ): Promise<ShareToken> {
    // First decrypt the original file
    const encryptionManager = new EncryptionManager();
    const decrypted = await encryptionManager.decrypt(
      encryptedPackage.encrypted,
      encryptedPackage.iv,
      encryptedPackage.salt,
      pnName,
      passcode,
      publicKey
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

