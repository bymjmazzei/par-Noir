/**
 * Crypto Worker Manager - Basic implementation for production readiness
 * This provides a simplified interface for cryptographic operations
 */

export class CryptoWorkerManager {
  private static instance: CryptoWorkerManager;

  private constructor() {}

  static getInstance(): CryptoWorkerManager {
    if (!CryptoWorkerManager.instance) {
      CryptoWorkerManager.instance = new CryptoWorkerManager();
    }
    return CryptoWorkerManager.instance;
  }

  async generateKey(
    algorithm: AlgorithmIdentifier,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey | CryptoKeyPair> {
    return crypto.subtle.generateKey(algorithm, extractable, keyUsages);
  }

  async importKey(
    format: Exclude<KeyFormat, 'jwk'>,
    keyData: BufferSource,
    algorithm: AlgorithmIdentifier,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    return crypto.subtle.importKey(format, keyData, algorithm, extractable, keyUsages);
  }

  async exportKey(format: Exclude<KeyFormat, 'jwk'>, key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey(format, key);
  }

  async encrypt(
    algorithm: AlgorithmIdentifier,
    key: CryptoKey,
    data: BufferSource
  ): Promise<ArrayBuffer> {
    return crypto.subtle.encrypt(algorithm, key, data);
  }

  async decrypt(
    algorithm: AlgorithmIdentifier,
    key: CryptoKey,
    data: BufferSource
  ): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(algorithm, key, data);
  }

  async sign(
    algorithm: AlgorithmIdentifier,
    key: CryptoKey,
    data: BufferSource
  ): Promise<ArrayBuffer> {
    return crypto.subtle.sign(algorithm, key, data);
  }

  async verify(
    algorithm: AlgorithmIdentifier,
    key: CryptoKey,
    signature: BufferSource,
    data: BufferSource
  ): Promise<boolean> {
    return crypto.subtle.verify(algorithm, key, signature, data);
  }

  async hash(algorithm: string, data: BufferSource): Promise<ArrayBuffer> {
    return crypto.subtle.digest(algorithm, data);
  }

  async deriveKey(
    algorithm: AlgorithmIdentifier,
    baseKey: CryptoKey,
    derivedKeyAlgorithm: AlgorithmIdentifier,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages);
  }

  generateRandom(array: Uint8Array): Uint8Array {
    return crypto.getRandomValues(array);
  }
}

// Export singleton instance
export const cryptoWorkerManager = CryptoWorkerManager.getInstance();
