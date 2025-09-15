import { cryptoWorkerManager } from '../cryptoWorkerManager';
// Main MilitaryGradeCrypto Class - Maintains backward compatibility while using modular components
import { CryptoConfig, HardwareConfig, KeyPair, EncryptedData, SignatureResult, SecurityEvent, KeyStoreInfo, ComplianceReport, QuantumResistanceStatus, HSMStatus, FailedAttempt } from './types/crypto';
import { CRYPTO_CONFIG_DEFAULTS, HARDWARE_CONFIG_DEFAULTS } from './constants/cryptoConstants';
import { CoreCryptoManager } from './coreCryptoManager';
import { HSMManager } from './hsmManager';
import { KeyManager } from './keyManager';
import { CryptoOperationsManager } from './cryptoOperationsManager';
import { SecurityManager } from './securityManager';
import { ComplianceManager } from './complianceManager';

export class MilitaryGradeCrypto {
  private coreManager: CoreCryptoManager;
  private hsmManager: HSMManager;
  private keyManager: KeyManager;
  private cryptoOperationsManager: CryptoOperationsManager;
  private securityManager: SecurityManager;
  private complianceManager: ComplianceManager;

  constructor(config: Partial<CryptoConfig> = {}, hardwareConfig: Partial<HardwareConfig> = {}) {
    const defaultConfig: CryptoConfig = {
      algorithm: 'ChaCha20-Poly1305',
      keyLength: 256,
      hashAlgorithm: 'SHA-384',
      ellipticCurve: 'P-384',
      quantumResistant: true,
      keyRotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days in milliseconds
      postQuantumEnabled: true,
      securityLevel: 'military'
    };
    
    const fullConfig = { ...defaultConfig, ...config };
    this.coreManager = new CoreCryptoManager(fullConfig, hardwareConfig);
    this.hsmManager = new HSMManager();
    this.keyManager = new KeyManager(fullConfig);
    this.cryptoOperationsManager = new CryptoOperationsManager(fullConfig);
    this.securityManager = new SecurityManager();
    this.complianceManager = new ComplianceManager();
  }

  /**
   * Initialize the crypto system
   */
  async initialize(): Promise<void> {
    try {
      // Core manager is already initialized in constructor
      await this.hsmManager.initializeHSM();
      this.securityManager.logSecurityEvent('crypto_system_initialized', {}, 'low');
    } catch (error) {
      this.securityManager.logSecurityEvent('crypto_system_initialization_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'critical');
      throw error;
    }
  }

  /**
   * Encrypt data
   */
  async encrypt(data: string, key?: CryptoKey): Promise<EncryptedData> {
    try {
      if (!key) {
        // Generate a new encryption key if none provided
        const encryptionKey = await this.keyManager.generateEncryptionKey();
        key = encryptionKey.privateKey;
      }

      const result = await this.cryptoOperationsManager.encryptData(data, key);
      
      this.securityManager.logSecurityEvent('data_encrypted', {
        algorithm: result.algorithm,
        securityLevel: result.securityLevel,
        dataSize: data.length
      }, 'low');

      return result;
    } catch (error) {
      this.securityManager.logSecurityEvent('encryption_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'high');
      throw error;
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
    try {
      const result = await this.cryptoOperationsManager.decryptData(encryptedData, key);
      
      this.securityManager.logSecurityEvent('data_decrypted', {
        algorithm: encryptedData.algorithm,
        securityLevel: encryptedData.securityLevel
      }, 'low');

      return result;
    } catch (error) {
      this.securityManager.logSecurityEvent('decryption_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'high');
      throw error;
    }
  }

  /**
   * Sign data
   */
  async sign(data: string, privateKey?: CryptoKey): Promise<SignatureResult> {
    try {
      if (!privateKey) {
        // Generate a new signing key if none provided
        const signingKey = await this.keyManager.generateSigningKey();
        privateKey = signingKey.privateKey;
      }

      const result = await this.cryptoOperationsManager.signData(data, privateKey);
      
      this.securityManager.logSecurityEvent('data_signed', {
        algorithm: result.algorithm,
        dataSize: data.length
      }, 'low');

      return result;
    } catch (error) {
      this.securityManager.logSecurityEvent('signing_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'high');
      throw error;
    }
  }

  /**
   * Verify signature
   */
  async verify(signature: string, publicKey: CryptoKey, data: string): Promise<boolean> {
    try {
      const result = await this.cryptoOperationsManager.verifySignature(signature, publicKey, data);
      
      this.securityManager.logSecurityEvent('signature_verified', {
        isValid: result,
        dataSize: data.length
      }, 'low');

      return result;
    } catch (error) {
      this.securityManager.logSecurityEvent('signature_verification_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'high');
      throw error;
    }
  }

  /**
   * Generate hash
   */
  async generateHash(data: string): Promise<string> {
    try {
      const result = await this.cryptoOperationsManager.generateHash(data);
      
      this.securityManager.logSecurityEvent('hash_generated', {
        algorithm: this.coreManager.getConfig().hashAlgorithm,
        dataSize: data.length
      }, 'low');

      return result;
    } catch (error) {
      this.securityManager.logSecurityEvent('hash_generation_failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'high');
      throw error;
    }
  }

  /**
   * Generate key pair
   */
  async generateKeyPair(type: 'encryption' | 'signing' | 'exchange' = 'signing'): Promise<KeyPair> {
    try {
      let result: KeyPair;

      switch (type) {
        case 'encryption':
          result = await this.keyManager.generateEncryptionKey();
          break;
        case 'signing':
          result = await this.keyManager.generateSigningKey();
          break;
        case 'exchange':
          result = await this.keyManager.generateKeyExchangeKey();
          break;
        default:
          throw new Error(`Unknown key type: ${type}`);
      }

      this.securityManager.logSecurityEvent('key_pair_generated', {
        type,
        algorithm: result.algorithm,
        securityLevel: result.securityLevel
      }, 'low');

      return result;
    } catch (error) {
      this.securityManager.logSecurityEvent('key_generation_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        type
      }, 'high');
      throw error;
    }
  }

  /**
   * Generate Ed25519 key pair
   */
  static async generateEd25519KeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
    keyType: string;
    keyUsage: string[];
  }> {
    return KeyManager.generateEd25519KeyPair();
  }

  /**
   * Generate X25519 key pair
   */
  static async generateX25519KeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
    keyType: string;
    keyUsage: string[];
  }> {
    return KeyManager.generateX25519KeyPair();
  }

  /**
   * Generate P-384 key pair
   */
  static async generateP384KeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
    keyType: string;
    keyUsage: string[];
  }> {
    return KeyManager.generateP384KeyPair();
  }

  /**
   * Generate P-521 key pair
   */
  static async generateP521KeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
    keyType: string;
    keyUsage: string[];
  }> {
    return KeyManager.generateP521KeyPair();
  }

  /**
   * Generate BLS12-381 key pair
   */
  static async generateBLS12_381KeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
    keyType: string;
    keyUsage: string[];
  }> {
    return KeyManager.generateBLS12_381KeyPair();
  }

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(
    userId: string,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      timestamp?: number;
    } = {}
  ): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
    return this.securityManager.recordFailedAttempt(userId, metadata);
  }

  /**
   * Check if user is locked
   */
  isUserLocked(userId: string): { isLocked: boolean; remainingAttempts: number; lockoutEnd?: Date } {
    return this.securityManager.isUserLocked(userId);
  }

  /**
   * Reset failed attempts for a user
   */
  resetFailedAttempts(userId: string): void {
    this.securityManager.resetFailedAttempts(userId);
  }

  /**
   * Get key store information
   */
  getKeyStoreInfo(): KeyStoreInfo {
    return this.coreManager.getKeyStoreInfo();
  }

  /**
   * Get hardware security status
   */
  getHardwareSecurityStatus(): {
    enabled: boolean;
    features: string[];
    status: string;
    recommendations: string[];
  } {
    return this.coreManager.getHardwareSecurityStatus();
  }

  /**
   * Get HSM status
   */
  async getHSMStatus(): Promise<HSMStatus> {
    return this.hsmManager.getStatus();
  }

  /**
   * Get security audit log
   */
  getSecurityAuditLog(): SecurityEvent[] {
    return this.securityManager.getSecurityAuditLog();
  }

  /**
   * Get compliance report
   */
  async getComplianceReport(): Promise<ComplianceReport> {
    const keyStoreInfo = this.getKeyStoreInfo();
    const hsmStatus = await this.getHSMStatus();
    const securityEvents = this.getSecurityAuditLog();
    
    // Get actual quantum resistance status from configuration
    const config = this.coreManager.getConfig();
    const quantumResistanceStatus: QuantumResistanceStatus = {
      enabled: config.quantumResistant,
      algorithms: config.quantumResistant ? ['CRYSTALS-Kyber', 'NTRU', 'FALCON', 'Dilithium', 'SPHINCS+'] : [],
      keySizes: config.quantumResistant ? [768, 1024, 1280] : [],
      securityLevel: config.quantumResistant ? '256' : '128',
      lastUpdated: new Date().toISOString()
    };

    return this.complianceManager.generateComplianceReport(
      keyStoreInfo,
      quantumResistanceStatus,
      hsmStatus,
      securityEvents
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): CryptoConfig {
    return this.coreManager.getConfig();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CryptoConfig>): void {
    this.coreManager.updateConfig(newConfig);
    this.keyManager.updateConfig(newConfig);
    this.cryptoOperationsManager.updateConfig(newConfig);
  }

  /**
   * Get HSM configuration
   */
  getHSMConfig(): any {
    return this.hsmManager.getConfig();
  }

  /**
   * Update HSM configuration
   */
  updateHSMConfig(newConfig: any): void {
    this.hsmManager.updateConfig(newConfig);
  }

  /**
   * Check if HSM is enabled
   */
  isHSMEnabled(): boolean {
    return this.hsmManager.isEnabled();
  }

  /**
   * Check if quantum resistance is enabled
   */
  isQuantumResistantEnabled(): boolean {
    return this.coreManager.getConfig().quantumResistant;
  }

  /**
   * Get security constants
   */
  static getConstants() {
    return {
      MIN_PASSCODE_LENGTH: CRYPTO_CONFIG_DEFAULTS.keyLength,
      MAX_LOGIN_ATTEMPTS: CRYPTO_CONFIG_DEFAULTS.keyLength,
      LOCKOUT_DURATION: CRYPTO_CONFIG_DEFAULTS.keyRotationInterval
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.coreManager.cleanup();
    this.hsmManager.cleanup();
    this.keyManager.cleanup();
    this.securityManager.cleanup();
    this.complianceManager.cleanup();
  }
}

// Export alias for backward compatibility
export { MilitaryGradeCrypto as CryptoManager };
