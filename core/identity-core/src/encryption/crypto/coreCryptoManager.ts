import { cryptoWorkerManager } from '../cryptoWorkerManager';
// Core Crypto Manager - Handles core crypto management functionality
import { CryptoConfig, HardwareConfig, KeyPair, EncryptedData, SecurityEvent, KeyStoreInfo, ComplianceReport, QuantumResistanceStatus, HSMStatus } from './types/crypto';
import { CRYPTO_CONFIG_DEFAULTS, HARDWARE_CONFIG_DEFAULTS } from './constants/cryptoConstants';
import { HSMManager } from './hsmManager';
import { KeyManager } from './keyManager';
import { CryptoOperationsManager } from './cryptoOperationsManager';
import { SecurityManager } from './securityManager';
import { ComplianceManager } from './complianceManager';

export class CoreCryptoManager {
  private config: CryptoConfig;
  private hardwareConfig: HardwareConfig;
  private keyStore: Map<string, KeyPair> = new Map();
  private encryptionCache: Map<string, EncryptedData> = new Map();
  private securityAuditLog: SecurityEvent[] = [];
  private hsmManager: HSMManager;
  private keyManager: KeyManager;
  private cryptoOperationsManager: CryptoOperationsManager;
  private securityManager: SecurityManager;
  private complianceManager: ComplianceManager;
  private keyRotationTimer?: NodeJS.Timeout;

  constructor(config: Partial<CryptoConfig> = {}, hardwareConfig: Partial<HardwareConfig> = {}) {
    this.config = { ...CRYPTO_CONFIG_DEFAULTS, ...config };
    this.hardwareConfig = { ...HARDWARE_CONFIG_DEFAULTS, ...hardwareConfig };
    
    // Initialize sub-managers
    this.hsmManager = new HSMManager();
    this.keyManager = new KeyManager(this.config);
    this.cryptoOperationsManager = new CryptoOperationsManager(this.config);
    this.securityManager = new SecurityManager();
    this.complianceManager = new ComplianceManager();
    
    this.initializeSecurity();
  }

  /**
   * Initialize security systems and perform self-checks
   */
  private async initializeSecurity(): Promise<void> {
    try {
      // Verify crypto capabilities
      await this.verifyCryptoCapabilities();
      
      // Initialize hardware-backed security if enabled
      if (this.hardwareConfig.enabled) {
        await this.initializeHardwareSecurity();
      }
      
      // Generate initial key pairs
      await this.generateInitialKeyPairs();
      
      // Start key rotation timer
      this.startKeyRotationTimer();
      
      this.logSecurityEvent('security_initialized', { config: this.config }, 'low');
    } catch (error) {
      this.logSecurityEvent('security_initialization_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'critical');
      throw error;
    }
  }

  /**
   * Verify that the system has required cryptographic capabilities
   */
  private async verifyCryptoCapabilities(): Promise<void> {
    const requiredAlgorithms = [
      '',
      'SHA-512',
      'ECDSA',
      'ECDH'
    ];

    for (const algorithm of requiredAlgorithms) {
      if (!crypto.subtle) {
        throw new Error('Web Crypto API not available');
      }
      
      try {
        if (algorithm.startsWith('AES')) {
          // Test AES key generation
          await cryptoWorkerManager.generateKey(
            { name: 'AES-GCM', length: 256 } as AesKeyGenParams,
            false,
            ['encrypt', 'decrypt']
          );
        } else if (algorithm.startsWith('SHA')) {
          // Test hashing
          const encoder = new TextEncoder();
          await await cryptoWorkerManager.hash(algorithm, encoder.encode('test'));
        } else if (algorithm.startsWith('ECD')) {
          // Test ECDSA key generation
          await cryptoWorkerManager.generateKey(
            { name: 'ECDSA', namedCurve: 'P-384' } as EcKeyGenParams,
            false,
            ['sign', 'verify']
          );
        }
      } catch (error) {
        throw new Error(`Required algorithm ${algorithm} not supported: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Initialize Hardware-Backed Security
   */
  private async initializeHardwareSecurity(): Promise<void> {
    try {
      // Test secure random generation
      const testRandom = await cryptoWorkerManager.generateRandom(new Uint8Array(32));
      if (testRandom.length !== 32) {
        throw new Error('Secure random generation failed');
      }
      
      // Test key generation in secure context
      const testKey = await cryptoWorkerManager.generateKey(
        { name: 'AES-GCM', length: 256 } as AesKeyGenParams,
        false, // extractable = false for hardware backing
        ['encrypt', 'decrypt']
      );
      
      if (!testKey) {
        throw new Error('Key generation failed');
      }

      // Test WebAuthn availability if enabled
      if (this.hardwareConfig.useWebAuthn) {
        if (!window.PublicKeyCredential) {
          // Console statement removed for production
          this.hardwareConfig.useWebAuthn = false;
        }
      }

      this.logSecurityEvent('hardware_security_initialized', { config: this.hardwareConfig }, 'low');
    } catch (error) {
      this.logSecurityEvent('hardware_security_initialization_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'high');
      // Fall back to software-only mode
      this.hardwareConfig.enabled = false;
    }
  }

  /**
   * Generate initial key pairs for the system
   */
  private async generateInitialKeyPairs(): Promise<void> {
    try {
      // Generate encryption key
      const encryptionKey = await this.keyManager.generateEncryptionKey();
      this.keyStore.set(encryptionKey.keyId, encryptionKey);

      // Generate signing key
      const signingKey = await this.keyManager.generateSigningKey();
      this.keyStore.set(signingKey.keyId, signingKey);

      // Generate key exchange key
      const exchangeKey = await this.keyManager.generateKeyExchangeKey();
      this.keyStore.set(exchangeKey.keyId, exchangeKey);

      this.logSecurityEvent('initial_keys_generated', { keyCount: 3 }, 'low');
    } catch (error) {
      this.logSecurityEvent('initial_key_generation_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'critical');
      throw error;
    }
  }

  /**
   * Start key rotation timer
   */
  private startKeyRotationTimer(): void {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
    }

    this.keyRotationTimer = setInterval(async () => {
      try {
        await this.rotateKeys();
      } catch (error) {
        this.logSecurityEvent('key_rotation_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'high');
      }
    }, this.config.keyRotationInterval);
  }

  /**
   * Rotate cryptographic keys
   */
  private async rotateKeys(): Promise<void> {
    try {
      const keysToRotate = Array.from(this.keyStore.values()).filter(key => {
        const expiresAt = new Date(key.expiresAt);
        const now = new Date();
        return expiresAt <= now;
      });

      for (const key of keysToRotate) {
        await this.keyManager.rotateKey(key.keyId);
      }

      if (keysToRotate.length > 0) {
        this.logSecurityEvent('keys_rotated', { rotatedCount: keysToRotate.length }, 'low');
      }
    } catch (error) {
      this.logSecurityEvent('key_rotation_failed', { error: error instanceof Error ? error.message : 'Unknown error' }, 'high');
      throw error;
    }
  }

  /**
   * Log security events
   */
  private logSecurityEvent(event: string, details: any, riskLevel: 'low' | 'medium' | 'high' | 'critical'): void {
    const securityEvent: SecurityEvent = {
      timestamp: new Date().toISOString(),
      event,
      details,
      riskLevel
    };

    this.securityAuditLog.push(securityEvent);
    
    // Keep only last 1000 events
    if (this.securityAuditLog.length > 1000) {
      this.securityAuditLog = this.securityAuditLog.slice(-1000);
    }

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      // Console statement removed for production
    }
  }

  /**
   * Get key store information
   */
  getKeyStoreInfo(): KeyStoreInfo {
    const now = new Date();
    const totalKeys = this.keyStore.size;
    const hardwareBackedKeys = Array.from(this.keyStore.values()).filter(key => key.hardwareBacked).length;
    const quantumResistantKeys = Array.from(this.keyStore.values()).filter(key => key.quantumResistant).length;
    const expiredKeys = Array.from(this.keyStore.values()).filter(key => new Date(key.expiresAt) <= now).length;

    return {
      totalKeys,
      hardwareBackedKeys,
      quantumResistantKeys,
      expiredKeys,
      lastRotation: new Date().toISOString(),
      nextRotation: new Date(Date.now() + this.config.keyRotationInterval).toISOString(),
      securityLevel: this.config.securityLevel
    };
  }

  /**
   * Get hardware-backed security status
   */
  getHardwareSecurityStatus(): {
    enabled: boolean;
    features: string[];
    status: string;
    recommendations: string[];
  } {
    const keyStoreInfo = this.getKeyStoreInfo();
    const coverage = keyStoreInfo.totalKeys > 0 ? (keyStoreInfo.hardwareBackedKeys / keyStoreInfo.totalKeys) * 100 : 0;
    
    const recommendations: string[] = [];
    if (coverage < 100) {
      recommendations.push('Enable hardware-backed security for all critical keys');
      recommendations.push('Use WebAuthn for biometric authentication');
      recommendations.push('Enable secure enclaves and TPM where available');
    }

    return {
      enabled: this.hardwareConfig.enabled,
      features: [
        this.hardwareConfig.useSecureEnclave ? 'Secure Enclave' : '',
        this.hardwareConfig.useTPM ? 'TPM' : '',
        this.hardwareConfig.useWebAuthn ? 'WebAuthn' : ''
      ].filter(Boolean),
      status: this.hardwareConfig.enabled ? 'Active' : 'Disabled',
      recommendations
    };
  }

  /**
   * Get security audit log
   */
  getSecurityAuditLog(): SecurityEvent[] {
    return [...this.securityAuditLog];
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
    this.logSecurityEvent('config_updated', { newConfig }, 'low');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
    }
    this.keyStore.clear();
    this.encryptionCache.clear();
    this.securityAuditLog.length = 0;
  }
}
