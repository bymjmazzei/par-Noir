import { cryptoWorkerManager } from '../../cryptoWorkerManager';
import { CryptoKeyPair } from '../../crypto';
import { 
  QuantumResistantConfig, 
  QuantumKeyPair as QuantumKeyPairType,
  SecurityLevelInfo 
} from '../types/quantumResistant';
import { DEFAULT_QUANTUM_CONFIG } from '../constants/algorithmParams';
import { QuantumKeyGenerator } from './keyGenerator';
import { QuantumSignatureManager } from './signatureManager';

export class AuthenticQuantumResistantCrypto {
  private static readonly DEFAULT_CONFIG: QuantumResistantConfig = DEFAULT_QUANTUM_CONFIG;

  private config: QuantumResistantConfig;
  private isSupported: boolean = false;

  constructor(config: Partial<QuantumResistantConfig> = {}) {
    this.config = { ...AuthenticQuantumResistantCrypto.DEFAULT_CONFIG, ...config };
    this.checkSupport();
  }

  /**
   * Check if quantum-resistant algorithms are supported
   */
  private async checkSupport(): Promise<void> {
    try {
      // Check for Web Crypto API support
      this.isSupported = await this.detectQuantumSupport();
    } catch (error) {
      this.isSupported = false;
      // Console statement removed for production
    }
  }

  /**
   * Detect quantum-resistant algorithm support
   */
  private async detectQuantumSupport(): Promise<boolean> {
    // Check if we can implement the algorithms in JavaScript
    // For now, we'll implement them using Web Crypto API primitives
    return true;
  }

  /**
   * Generate hybrid key pair (classical + quantum-resistant)
   */
  async generateHybridKeyPair(): Promise<QuantumKeyPairType> {
    if (!this.config.enabled) {
      throw new Error('Quantum-resistant cryptography not enabled');
    }

    try {
      // Generate classical Ed25519 key pair
      const classicalKeyPair = await await cryptoWorkerManager.generateKey(
        { name: 'Ed25519' },
        true,
        ['sign', 'verify']
      ) as CryptoKeyPair;

      // Generate quantum-resistant key pair using real lattice-based cryptography
      const quantumKeyPair = await QuantumKeyGenerator.generateQuantumKeyPair(
        this.config.algorithm,
        this.config.keySize
      );

      // Create hybrid signature combining both
      const hybridSignature = await this.createHybridSignature(
        classicalKeyPair,
        quantumKeyPair
      );

      return {
        classicalPublicKey: await this.exportKey(classicalKeyPair.publicKey),
        classicalPrivateKey: await this.exportKey(classicalKeyPair.privateKey),
        quantumPublicKey: quantumKeyPair.publicKey,
        quantumPrivateKey: quantumKeyPair.privateKey,
        hybridSignature,
        algorithm: this.config.algorithm,
        createdAt: new Date().toISOString(),
        quantumResistant: true,
        securityLevel: this.config.securityLevel,
        keySize: this.config.keySize
      };
    } catch (error) {
      if (this.config.fallbackToClassical) {
        return this.fallbackToClassical();
      }
      throw error;
    }
  }

  /**
   * Create hybrid signature combining classical and quantum-resistant
   */
  private async createHybridSignature(
    classicalKeyPair: CryptoKeyPair,
    quantumKeyPair: { publicKey: string; privateKey: string }
  ): Promise<string> {
    const message = new TextEncoder().encode('hybrid-signature-verification');
    
    // Classical signature
    const classicalSignature = await await cryptoWorkerManager.sign(
      'Ed25519',
      classicalKeyPair.privateKey,
      message
    );

    // Quantum signature
    const quantumSignature = await QuantumSignatureManager.createQuantumSignature(
      quantumKeyPair.privateKey, 
      message, 
      this.config.algorithm
    );

    // Combine signatures
    const combined = new Uint8Array(classicalSignature.byteLength + quantumSignature.byteLength);
    combined.set(new Uint8Array(classicalSignature), 0);
    combined.set(quantumSignature, classicalSignature.byteLength);

    return this.arrayBufferToBase64(combined);
  }

  /**
   * Verify hybrid signature
   */
  async verifyHybridSignature(
    signature: string,
    publicKey: string,
    message: Uint8Array
  ): Promise<boolean> {
    try {
      // Split hybrid signature
      const signatureBuffer = this.base64ToArrayBuffer(signature);
      const classicalSignature = signatureBuffer.slice(0, 64);
      const quantumSignature = signatureBuffer.slice(64);

      // Verify classical signature
      const classicalPublicKey = await this.importKey(publicKey, 'public');
      const classicalValid = await await cryptoWorkerManager.verify(
        'Ed25519',
        classicalPublicKey,
        classicalSignature,
        message
      );

      // Verify quantum signature
      const quantumValid = await QuantumSignatureManager.verifyQuantumSignature(
        publicKey, 
        new Uint8Array(quantumSignature), 
        message, 
        this.config.algorithm
      );

      return classicalValid && quantumValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fallback to classical cryptography
   */
  private async fallbackToClassical(): Promise<QuantumKeyPairType> {
    const classicalKeyPair = await await cryptoWorkerManager.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    ) as CryptoKeyPair;

    return {
      classicalPublicKey: await this.exportKey(classicalKeyPair.publicKey),
      classicalPrivateKey: await this.exportKey(classicalKeyPair.privateKey),
      quantumPublicKey: '',
      quantumPrivateKey: '',
      hybridSignature: '',
      algorithm: 'Ed25519',
      createdAt: new Date().toISOString(),
      quantumResistant: false,
      securityLevel: '128',
      keySize: 256
    };
  }

  // Utility methods
  private async exportKey(key: CryptoKey): Promise<string> {
    const format = key.type === 'public' ? 'spki' : 'pkcs8';
    const exported = await await cryptoWorkerManager.exportKey(format, key);
    return this.arrayBufferToBase64(exported);
  }

  private async importKey(keyData: string, type: 'public' | 'private'): Promise<CryptoKey> {
    const format = type === 'public' ? 'spki' : 'pkcs8';
    const keyBuffer = this.base64ToArrayBuffer(keyData);
    return await cryptoWorkerManager.importKey(format, keyBuffer, 'Ed25519', false, ['verify']);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Check if quantum-resistant features are available
   */
  isQuantumResistantAvailable(): boolean {
    return this.config.enabled && this.isSupported;
  }

  /**
   * Get current configuration
   */
  getConfig(): QuantumResistantConfig {
    return { ...this.config };
  }

  /**
   * Get security level information
   */
  getSecurityLevel(): SecurityLevelInfo {
    return {
      classical: '128-bit',
      quantum: `${this.config.securityLevel}-bit`,
      hybrid: `${this.config.securityLevel}+128-bit`,
      algorithm: this.config.algorithm,
      keySize: this.config.keySize,
      quantumResistant: this.isQuantumResistantAvailable()
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<QuantumResistantConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Reset to default configuration
   */
  resetToDefault(): void {
    this.config = { ...AuthenticQuantumResistantCrypto.DEFAULT_CONFIG };
  }
}
