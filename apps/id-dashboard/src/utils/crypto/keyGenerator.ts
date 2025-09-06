// Key Generation for DIDs
import { cryptoWorkerManager } from '../cryptoWorkerManager';
import { CryptoUtils } from './cryptoUtils';

export class KeyGenerator {
  /**
   * Generate a new key pair for DID using Ed25519 (more secure than RSA-2048)
   */
  static async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      // Use Web Worker for non-blocking key generation
      const keyPair = await cryptoWorkerManager.generateKey('Ed25519', true, ['sign', 'verify']);

      const publicKeyBuffer = await cryptoWorkerManager.exportKey('spki', keyPair.publicKey);
      const privateKeyBuffer = await cryptoWorkerManager.exportKey('pkcs8', keyPair.privateKey);

      return {
        publicKey: CryptoUtils.arrayBufferToBase64(publicKeyBuffer),
        privateKey: CryptoUtils.arrayBufferToBase64(privateKeyBuffer),
      };
    } catch (error) {
      // Fallback to main thread if worker fails
      try {
        const keyPair = await cryptoWorkerManager.generateKey(
          {
            name: 'Ed25519',
          },
          true,
          ['sign', 'verify']
        );

        const publicKeyBuffer = await cryptoWorkerManager.exportKey('spki', keyPair.publicKey);
        const privateKeyBuffer = await cryptoWorkerManager.exportKey('pkcs8', keyPair.privateKey);

        return {
          publicKey: CryptoUtils.arrayBufferToBase64(publicKeyBuffer),
          privateKey: CryptoUtils.arrayBufferToBase64(privateKeyBuffer),
        };
      } catch (fallbackError) {
        throw new Error(`Failed to generate Ed25519 key pair: ${fallbackError}. Please ensure your browser supports Ed25519.`);
      }
    }
  }
}
