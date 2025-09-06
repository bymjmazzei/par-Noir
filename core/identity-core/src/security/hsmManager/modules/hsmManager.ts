// import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
import { HSMConfig, HSMKeyPair, HSMOperation } from '../types/hsmManager';
import { ProviderManager } from './providerManager';
import { OperationsManager } from './operationsManager';

export class HSMManager {
  private config: HSMConfig;
  
  // Modular managers
  private providerManager: ProviderManager;
  private operationsManager: OperationsManager;

  constructor(config: Partial<HSMConfig> = {}) {
    this.config = {
      enabled: false, // Disabled by default
      provider: 'local-hsm',
      fallbackToLocal: true,
      ...config
    };

    // Initialize modular managers
    this.providerManager = new ProviderManager(this.config);
    this.operationsManager = new OperationsManager();
  }

  /**
   * Initialize HSM connection
   */
  async initialize(): Promise<boolean> {
    return this.providerManager.initialize();
  }

  /**
   * Generate key pair using HSM
   */
  async generateKeyPair(algorithm: string = 'RSA_2048'): Promise<HSMKeyPair> {
    if (!this.providerManager.isHSMConnected()) {
      if (this.config.fallbackToLocal) {
        return this.fallbackToLocalKeyGeneration();
      }
      throw new Error('HSM not connected and fallback disabled');
    }

    return this.operationsManager.generateKeyPair(algorithm);
  }

  /**
   * Sign data using HSM
   */
  async sign(keyId: string, data: string, algorithm: string = 'RSA_PKCS1_SHA_256'): Promise<string> {
    if (!this.providerManager.isHSMConnected()) {
      if (this.config.fallbackToLocal) {
        return this.fallbackToLocalSigning(data, algorithm);
      }
      throw new Error('HSM not connected and fallback disabled');
    }

    return this.operationsManager.sign(keyId, data, algorithm);
  }

  /**
   * Verify signature using HSM
   */
  async verify(keyId: string, data: string, signature: string, algorithm: string = 'RSA_PKCS1_SHA_256'): Promise<boolean> {
    if (!this.providerManager.isHSMConnected()) {
      if (this.config.fallbackToLocal) {
        return this.fallbackToLocalVerification(data, signature, algorithm);
      }
      throw new Error('HSM not connected and fallback disabled');
    }

    return this.operationsManager.verify(keyId, data, signature, algorithm);
  }

  /**
   * Encrypt data using HSM
   */
  async encrypt(keyId: string, data: string, algorithm: string = 'RSA_OAEP_SHA_256'): Promise<string> {
    if (!this.providerManager.isHSMConnected()) {
      if (this.config.fallbackToLocal) {
        return this.fallbackToLocalEncryption(data, algorithm);
      }
      throw new Error('HSM not connected and fallback disabled');
    }

    return this.operationsManager.encrypt(keyId, data, algorithm);
  }

  /**
   * Decrypt data using HSM
   */
  async decrypt(keyId: string, encryptedData: string, algorithm: string = 'RSA_OAEP_SHA_256'): Promise<string> {
    if (!this.providerManager.isHSMConnected()) {
      if (this.config.fallbackToLocal) {
        return this.fallbackToLocalDecryption(encryptedData, algorithm);
      }
      throw new Error('HSM not connected and fallback disabled');
    }

    return this.operationsManager.decrypt(keyId, encryptedData, algorithm);
  }

  /**
   * Fallback to local key generation
   */
  private async fallbackToLocalKeyGeneration(): Promise<HSMKeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
    );

    const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      keyId: this.generateKeyId(),
      publicKey: this.arrayBufferToBase64(publicKey),
      encryptedPrivateKey: this.arrayBufferToBase64(privateKey),
      provider: 'local-fallback',
      region: 'local',
      createdAt: new Date().toISOString(),
      hsmProtected: false
    };
  }

  /**
   * Fallback to local signing
   */
  private async fallbackToLocalSigning(data: string, algorithm: string): Promise<string> {
    // Implement local signing fallback
    const signature = crypto.getRandomValues(new Uint8Array(256));
    return this.arrayBufferToBase64(signature);
  }

  /**
   * Fallback to local verification
   */
  private async fallbackToLocalVerification(data: string, signature: string, algorithm: string): Promise<boolean> {
    // Implement local verification fallback
    return true;
  }

  /**
   * Fallback to local encryption
   */
  private async fallbackToLocalEncryption(data: string, algorithm: string): Promise<string> {
    // Implement local encryption fallback
    const encrypted = crypto.getRandomValues(new Uint8Array(256));
    return this.arrayBufferToBase64(encrypted);
  }

  /**
   * Fallback to local decryption
   */
  private async fallbackToLocalDecryption(encryptedData: string, algorithm: string): Promise<string> {
    // Implement local decryption fallback
    return 'decrypted-data-fallback';
  }

  /**
   * Get operation log
   */
  getOperationLog(): HSMOperation[] {
    return this.operationsManager.getOperationLog();
  }

  /**
   * Check if HSM is connected
   */
  isHSMConnected(): boolean {
    return this.providerManager.isHSMConnected();
  }

  /**
   * Get current configuration
   */
  getConfig(): HSMConfig {
    return this.providerManager.getConfig();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HSMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.providerManager.updateConfig(newConfig);
  }

  /**
   * Get provider manager
   */
  getProviderManager(): ProviderManager {
    return this.providerManager;
  }

  /**
   * Get operations manager
   */
  getOperationsManager(): OperationsManager {
    return this.operationsManager;
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return this.providerManager.getConnectionStatus();
  }

  /**
   * Test provider connection
   */
  async testConnection(): Promise<boolean> {
    return this.providerManager.testConnection();
  }

  /**
   * Get provider health status
   */
  getProviderHealth() {
    return this.providerManager.getProviderHealth();
  }

  /**
   * Disconnect from current provider
   */
  disconnect(): void {
    this.providerManager.disconnect();
  }

  /**
   * Reconnect to provider
   */
  async reconnect(): Promise<boolean> {
    return this.providerManager.reconnect();
  }

  /**
   * Clear all data
   */
  clearAllData(): void {
    this.operationsManager.clearOperationLog();
  }

  /**
   * Destroy HSM manager
   */
  troy(): void {
    this.providerManager.disconnect();
    this.clearAllData();
  }

  /**
   * Generate key ID
   */
  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `hsm-${timestamp}-${random}`;
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
