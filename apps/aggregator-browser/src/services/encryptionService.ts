/**
 * Encryption Service for Browser App
 * Public share = slim token (API) + ciphertext envelope (owner cloud only).
 */

import { EncryptionManager } from '../utils/encryptionManager';
import type { PublicShareGenerationResult, ShareToken } from '@par-noir/aggregator-domain';

export type { ShareToken };

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
  id: string;
  publicKey: string;
}

export class EncryptionService {
  /**
   * Generate public share material: slim token (API) + envelope (cloud).
   */
  async generateShareToken(
    encryptedPackage: EncryptedFilePackage,
    session: AuthSession
  ): Promise<PublicShareGenerationResult> {
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
    const shareKeyBase64 = btoa(Array.from(shareKeyArray).map((b) => String.fromCharCode(b)).join(''));

    const shareIv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', shareKeyArray, { name: 'AES-GCM' }, false, ['encrypt']);

    const shareEncrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: shareIv }, key, decrypted);

    const shareEncryptedUint8 = new Uint8Array(shareEncrypted);
    const shareEncryptedBase64 = btoa(
      Array.from(shareEncryptedUint8)
        .map((b) => String.fromCharCode(b))
        .join('')
    );
    const shareIvBase64 = btoa(Array.from(shareIv).map((b) => String.fromCharCode(b)).join(''));
    const saltArray = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = btoa(Array.from(saltArray).map((b) => String.fromCharCode(b)).join(''));

    return {
      token: {
        fileId: encryptedPackage.metadata?.originalName || '',
        contentKey: { encrypted: '', wrappedWith: '', iv: '' },
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        permissions: ['read'],
        metadata: {
          title: encryptedPackage.metadata?.originalName,
          description: encryptedPackage.metadata?.description,
        },
        shareKey: shareKeyBase64,
      },
      envelope: {
        encrypted: shareEncryptedBase64,
        iv: shareIvBase64,
        salt: saltBase64,
      },
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
