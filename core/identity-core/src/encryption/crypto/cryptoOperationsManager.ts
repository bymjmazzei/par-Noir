import { cryptoWorkerManager } from '../cryptoWorkerManager';
// Crypto Operations Manager - Handles core crypto operations
import { CryptoConfig, EncryptedData, SignatureResult } from './types/crypto';
import { CRYPTO_CONSTANTS } from './constants/cryptoConstants';

export class CryptoOperationsManager {
  private config: CryptoConfig;

  constructor(config: CryptoConfig) {
    this.config = config;
  }

  /**
   * Encrypt data using the configured algorithm
   */
  async encryptData(data: string, key: CryptoKey): Promise<EncryptedData> {
    const iv = await cryptoWorkerManager.generateRandom(new Uint8Array(12));
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    let encryptedBuffer: ArrayBuffer;
    let tag: string;

    if (this.config.algorithm === '') {
      encryptedBuffer = await cryptoWorkerManager.encrypt(
        { name: 'AES-GCM', iv } as AesGcmParams,
        key,
        dataBuffer
      );
      // For AES-GCM, the tag is included in the encrypted data
      tag = '';
    } else if (this.config.algorithm === 'ChaCha20-Poly1305') {
      encryptedBuffer = await cryptoWorkerManager.encrypt(
        { name: 'ChaCha20-Poly1305', iv } as any,
        key,
        dataBuffer
      );
      // For ChaCha20-Poly1305, the tag is included in the encrypted data
      tag = '';
    } else if (this.config.algorithm === 'AES-256-CCM') {
      encryptedBuffer = await cryptoWorkerManager.encrypt(
        { name: 'AES-CCM', iv, tagLength: 128 } as any,
        key,
        dataBuffer
      );
      // For AES-CCM, the tag is included in the encrypted data
      tag = '';
    } else {
      throw new Error(`Unsupported encryption algorithm: ${this.config.algorithm}`);
    }

    const keyId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      data: this.arrayBufferToBase64(encryptedBuffer),
      iv: this.arrayBufferToBase64(iv),
      tag,
      algorithm: this.config.algorithm,
      keyId,
      timestamp: new Date().toISOString(),
      securityLevel: this.config.securityLevel,
      quantumResistant: this.config.quantumResistant,
      hardwareBacked: false
    };
  }

  /**
   * Decrypt data using the configured algorithm
   */
  async decryptData(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
    const encryptedBuffer = this.base64ToArrayBuffer(encryptedData.data);
    const iv = this.base64ToArrayBuffer(encryptedData.iv);

    let decryptedBuffer: ArrayBuffer;

    if (encryptedData.algorithm === 'AES-GCM') {
      decryptedBuffer = await cryptoWorkerManager.decrypt(
        { name: 'AES-GCM', iv } as AesGcmParams,
        key,
        encryptedBuffer
      );
    } else if (encryptedData.algorithm === 'ChaCha20-Poly1305') {
      decryptedBuffer = await cryptoWorkerManager.decrypt(
        { name: 'ChaCha20-Poly1305', iv } as any,
        key,
        encryptedBuffer
      );
    } else if (encryptedData.algorithm === 'AES-256-CCM') {
      decryptedBuffer = await cryptoWorkerManager.decrypt(
        { name: 'AES-CCM', iv, tagLength: 128 } as any,
        key,
        encryptedBuffer
      );
    } else {
      throw new Error(`Unsupported decryption algorithm: ${encryptedData.algorithm}`);
    }

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Sign data using the configured algorithm
   */
  async signData(data: string, privateKey: CryptoKey): Promise<SignatureResult> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    let signature: ArrayBuffer;

    if (this.config.ellipticCurve === 'P-384') {
      signature = await cryptoWorkerManager.sign(
        { name: 'ECDSA', hash: 'SHA-512' } as EcdsaParams,
        privateKey,
        dataBuffer
      );
    } else if (this.config.ellipticCurve === 'P-521') {
      signature = await cryptoWorkerManager.sign(
        { name: 'ECDSA', hash: 'SHA-512' } as EcdsaParams,
        privateKey,
        dataBuffer
      );
    } else if (this.config.ellipticCurve === 'BLS12-381') {
      // BLS12-381 is not natively supported by Web Crypto API
      // In a real implementation, you would use a library like noble-bls
      // For now, we'll use ECDSA as a fallback
      signature = await cryptoWorkerManager.sign(
        { name: 'ECDSA', hash: 'SHA-512' } as EcdsaParams,
        privateKey,
        dataBuffer
      );
    } else {
      throw new Error(`Unsupported elliptic curve: ${this.config.ellipticCurve}`);
    }

    const keyId = `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      signature: this.arrayBufferToBase64(signature),
      publicKey: '', // This would be set by the caller
      algorithm: `ECDSA-${this.config.ellipticCurve}`,
      timestamp: new Date().toISOString(),
      keyId
    };
  }

  /**
   * Verify signature using the configured algorithm
   */
  async verifySignature(
    signature: string,
    publicKey: CryptoKey,
    data: string
  ): Promise<boolean> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const signatureBuffer = this.base64ToArrayBuffer(signature);

    if (this.config.ellipticCurve === 'P-384') {
      return await cryptoWorkerManager.verify(
        { name: 'ECDSA', hash: 'SHA-512' } as EcdsaParams,
        publicKey,
        signatureBuffer,
        dataBuffer
      );
    } else if (this.config.ellipticCurve === 'P-521') {
      return await cryptoWorkerManager.verify(
        { name: 'ECDSA', hash: 'SHA-512' } as EcdsaParams,
        publicKey,
        signatureBuffer,
        dataBuffer
      );
    } else if (this.config.ellipticCurve === 'BLS12-381') {
      // BLS12-381 is not natively supported by Web Crypto API
      // In a real implementation, you would use a library like noble-bls
      // For now, we'll use ECDSA as a fallback
      return await cryptoWorkerManager.verify(
        { name: 'ECDSA', hash: 'SHA-512' } as EcdsaParams,
        publicKey,
        signatureBuffer,
        dataBuffer
      );
    } else {
      throw new Error(`Unsupported elliptic curve: ${this.config.ellipticCurve}`);
    }
  }

  /**
   * Generate hash using the configured algorithm
   */
  async generateHash(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    let hashBuffer: ArrayBuffer;

    if (this.config.hashAlgorithm === 'SHA-384') {
      hashBuffer = await cryptoWorkerManager.hash('SHA-384', dataBuffer);
    } else if (this.config.hashAlgorithm === 'SHA-512') {
      hashBuffer = await cryptoWorkerManager.hash('SHA-512', dataBuffer);
    } else if (this.config.hashAlgorithm === 'SHAKE256') {
      // SHAKE256 is not natively supported by Web Crypto API
      // In a real implementation, you would use a library like js-sha3
      // For now, we'll use SHA-512 as a fallback
      hashBuffer = await cryptoWorkerManager.hash('SHA-512', dataBuffer);
    } else if (this.config.hashAlgorithm === 'Keccak-256') {
      // Keccak-256 is not natively supported by Web Crypto API
      // In a real implementation, you would use a library like js-sha3
      // For now, we'll use SHA-512 as a fallback
      hashBuffer = await cryptoWorkerManager.hash('SHA-512', dataBuffer);
    } else {
      throw new Error(`Unsupported hash algorithm: ${this.config.hashAlgorithm}`);
    }

    return this.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number = CRYPTO_CONSTANTS.MILITARY_CONFIG.iterations
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const baseKey = await cryptoWorkerManager.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await cryptoWorkerManager.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-512'
      } as Pbkdf2Params,
      baseKey,
      { name: 'AES-GCM', length: this.config.keyLength } as AesKeyGenParams,
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate random bytes
   */
  generateRandomBytes(length: number): Uint8Array {
    return cryptoWorkerManager.generateRandom(new Uint8Array(length));
  }

  /**
   * Generate random salt
   */
  generateSalt(length: number = 32): Uint8Array {
    return cryptoWorkerManager.generateRandom(new Uint8Array(length));
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
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
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Get current configuration
   */
  getConfig(): CryptoConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CryptoConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
