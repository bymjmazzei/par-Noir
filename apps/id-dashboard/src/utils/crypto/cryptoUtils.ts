import { cryptoWorkerManager } from './cryptoWorkerManager';
// Crypto Utility Functions
export class CryptoUtils {
  /**
   * Generate salt for encryption
   */
  static async generateSalt(): Promise<string> {
    const salt = await cryptoWorkerManager.generateRandom(new Uint8Array(16));
    return this.arrayBufferToBase64(salt);
  }

  /**
   * Generate IV for encryption
   */
  static async generateIV(): Promise<Uint8Array> {
    return await cryptoWorkerManager.generateRandom(new Uint8Array(12));
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (error) {
      throw new Error(`Failed to convert base64 to ArrayBuffer: ${error}`);
    }
  }

  /**
   * Generate DID identifier from public key with cryptographic fallback
   */
  static async generateDIDIdentifier(publicKey: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const keyBuffer = encoder.encode(publicKey);
      
      // Generate a deterministic identifier from the public key
      const hashBuffer = await cryptoWorkerManager.hash('SHA-256', keyBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    } catch (error) {
      // Cryptographic fallback using await cryptoWorkerManager.generateRandom()
      const randomBytes = await cryptoWorkerManager.generateRandom(new Uint8Array(8));
      return Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }
}
