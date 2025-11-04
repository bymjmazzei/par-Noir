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
   * Uses stable pN identity (id + publicKey) for consistent encryption across sessions
   */
  async encryptFileForUpload(
    file: File,
    session: AuthSession
  ): Promise<{ encryptedBlob: Blob; packageData: EncryptedFilePackage }> {
    console.log('🔐 [EncryptionService] encryptFileForUpload called', {
      hasId: !!session.id,
      idType: typeof session.id,
      idLength: session.id?.length,
      hasPublicKey: !!session.publicKey,
      publicKeyType: typeof session.publicKey,
      publicKeyLength: session.publicKey?.length,
      fileName: file.name,
      fileSize: file.size
    });
    
    if (!session.id || !session.publicKey) {
      const missing = [];
      if (!session.id) missing.push('id');
      if (!session.publicKey) missing.push('publicKey');
      console.error('❌ [EncryptionService] Missing session data:', missing);
      throw new Error(`Missing required session data: ${missing.join(', ')} are required`);
    }

    try {
      const fileArrayBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileArrayBuffer);

      // Encrypt using stable pN identity (id + publicKey)
      // The id (DID) is stable and doesn't change between sessions, ensuring consistent encryption
      const encryptionManager = new EncryptionManager();
      const encrypted = await encryptionManager.encrypt(
        fileData,
        session.id,
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

      console.log('✅ [EncryptionService] File encrypted successfully', {
        encryptedSize: encryptedBlob.size,
        originalSize: file.size
      });

      return { encryptedBlob, packageData };
    } catch (error: any) {
      console.error('❌ [EncryptionService] Encryption error:', {
        error: error?.message || error,
        errorName: error?.name,
        stack: error?.stack
      });
      throw error;
    }
  }

  /**
   * Decrypt file from download
   * Uses stable pN identity (id + publicKey) for consistent decryption across sessions
   */
  async decryptFileFromDownload(
    encryptedPackage: EncryptedFilePackage,
    session: AuthSession
  ): Promise<{ decryptedBlob: Blob; metadata: any }> {
    if (!session.id || !session.publicKey) {
      throw new Error('Missing required session data: id and publicKey are required');
    }

    // Decrypt using stable pN identity (id + publicKey)
    // The id (DID) is stable and doesn't change between sessions, ensuring consistent decryption
    const encryptionManager = new EncryptionManager();
    const decrypted = await encryptionManager.decrypt(
      encryptedPackage.encrypted,
      encryptedPackage.iv,
      encryptedPackage.salt,
      session.id,
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

