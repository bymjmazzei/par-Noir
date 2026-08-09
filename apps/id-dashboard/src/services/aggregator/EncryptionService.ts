/**
 * Encryption Service
 * Handles file encryption/decryption and share token generation
 */

import { ShareToken, EncryptedFilePackage, AuthSession } from '../../types/aggregator';
import { EncryptionManager, cryptoWorkerManager } from '@par-noir/identity-crypto';

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
        version: '1',
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
        salt: encrypted.salt,
        metadata: {
          originalName: file.name,
          originalSize: file.size,
          originalMimeType: file.type,
          encryptedAt: new Date().toISOString(),
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
    session: Pick<AuthSession, 'id' | 'publicKey'>
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
   * Generate public share material: slim token (API) + ciphertext envelope (cloud only).
   * Never embed shareEncrypted in the API token.
   */
  async generateShareToken(
    encryptedPackage: EncryptedFilePackage,
    session: AuthSession
  ): Promise<import('@par-noir/aggregator-domain').PublicShareGenerationResult> {
    if (!session.id || !session.publicKey) {
      throw new Error('Missing required session data: id and publicKey are required');
    }

    const encryptionManager = new EncryptionManager();
    const decrypted = await encryptionManager.decrypt(
      encryptedPackage.encrypted,
      encryptedPackage.iv,
      encryptedPackage.salt,
      session.id,
      session.publicKey
    );

    const shareKeyArray = crypto.getRandomValues(new Uint8Array(32));
    const shareKeyBase64 = btoa(Array.from(shareKeyArray).map(b => String.fromCharCode(b)).join(''));

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

    const shareEncryptedUint8 = new Uint8Array(shareEncrypted);
    const shareEncryptedBase64 = btoa(Array.from(shareEncryptedUint8).map(b => String.fromCharCode(b)).join(''));
    const shareIvBase64 = btoa(Array.from(shareIv).map(b => String.fromCharCode(b)).join(''));
    const saltArray = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = btoa(Array.from(saltArray).map(b => String.fromCharCode(b)).join(''));

    const envelope = {
      encrypted: shareEncryptedBase64,
      iv: shareIvBase64,
      salt: saltBase64,
    };

    const token: ShareToken = {
      fileId: encryptedPackage.metadata?.originalName || '',
      contentKey: {
        encrypted: '',
        wrappedWith: '',
        iv: ''
      },
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      permissions: ['read'],
      metadata: {
        title: encryptedPackage.metadata?.originalName,
        description: encryptedPackage.metadata?.description
      },
      shareKey: shareKeyBase64,
    };

    return { token, envelope };
  }
}

let encryptionServiceInstance: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EncryptionService();
  }
  return encryptionServiceInstance;
}

