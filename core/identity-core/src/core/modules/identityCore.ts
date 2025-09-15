import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';
import { 
  DID, 
  CreateDIDOptions, 
  AuthenticateOptions, 
  UpdateMetadataOptions,
  GrantToolAccessOptions,
  ChallengeResponse,
  SignatureVerification
} from '../../types';

import { IdentityCoreConfig, BackgroundSecurityConfig } from '../types/identityCore';
// Core managers removed - using distributed system instead
import { EventManager } from './eventManager';
import { IndexedDBStorage } from '../../storage/indexeddb';
import { PrivacyManager } from '../../utils/privacy-manager';
import { DeviceSecurityManager } from '../../security/device-security';
import { WebAuthnManager } from '../../security/webauthn';
import { SupplyChainSecurityManager } from '../../security/supply-chain-security';
import { SecureRandom } from '../../utils/secureRandom';
import { IdentityError, IdentityErrorCodes } from '../../types';

export class IdentityCore {
  private storage: IndexedDBStorage;
  private privacyManager: PrivacyManager;
  private deviceSecurity: DeviceSecurityManager;
  private webAuthn: WebAuthnManager;
  private supplyChainSecurity: SupplyChainSecurityManager;
  private config: IdentityCoreConfig;
  
  // Modular managers
  private eventManager: EventManager;

  constructor(config: Partial<IdentityCoreConfig> = {}) {
    this.config = {
      storageType: 'indexeddb',
      encryptionLevel: 'high',
      backupEnabled: false,
      biometricEnabled: false,
      securityMonitoringEnabled: true,
      auditLoggingEnabled: true,
      eventHandlingEnabled: true,
      ...config
    };

    // Initialize storage and security modules
    this.storage = new IndexedDBStorage();
    this.privacyManager = new PrivacyManager();
    this.deviceSecurity = new DeviceSecurityManager();
    this.webAuthn = new WebAuthnManager();
    this.supplyChainSecurity = new SupplyChainSecurityManager();

    // Initialize modular managers
    this.eventManager = new EventManager();

    // Start background security monitoring
    this.startBackgroundSecurity();
  }

  /**
   * Initialize the identity core
   */
  async initialize(): Promise<void> {
    try {
      // Initialize storage
      await this.storage.initialize();
      
      // Initialize security modules
      await this.deviceSecurity.initialize();
      await this.supplyChainSecurity.initialize();
      
      // Check WebAuthn support
      if (WebAuthnManager.isSupported()) {
        this.eventManager.emit('webauthn_supported', { supported: true });
      }
      
      this.eventManager.emit('initialized', {});
    } catch (error) {
      throw new IdentityError(
        'Failed to initialize Identity Core',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Create a new DID - Use distributed identity system instead
   */
  async createDID(options: CreateDIDOptions): Promise<DID> {
    throw new IdentityError(
      'Use distributed identity system for DID creation',
      IdentityErrorCodes.CREATION_ERROR
    );
  }

  /**
   * Authenticate DID - Use distributed authentication system instead
   */
  async authenticate(options: AuthenticateOptions): Promise<DID> {
    throw new IdentityError(
      'Use distributed authentication system for authentication',
      IdentityErrorCodes.AUTHENTICATION_ERROR
    );
  }

  /**
   * All DID and authentication operations should use the distributed system
   * This core module provides only basic infrastructure and event management
   */

  /**
   * Get audit log
   */
  getAuditLog(didId: string): any[] {
    return this.privacyManager.getAuditLog(didId);
  }

  /**
   * Update privacy settings
   */
  updatePrivacySettings(did: DID, settings: any): void {
    this.privacyManager.updatePrivacySettings(did, settings);
    this.eventManager.emit('privacy_settings_updated', { didId: did.id, settings });
  }

  /**
   * Event handling
   */
  on<T extends any>(event: any, handler: any): void {
    this.eventManager.on(event, handler);
  }

  /**
   * Remove event handler
   */
  off<T extends any>(event: any, handler: any): void {
    this.eventManager.off(event, handler);
  }

  /**
   * Get event statistics
   */
  getEventStats(): any {
    return this.eventManager.getEventStats();
  }

  /**
   * Start background security monitoring
   */
  private async startBackgroundSecurity(): Promise<void> {
    if (!this.config.securityMonitoringEnabled) {
      return;
    }

    try {
      const { BackgroundMonitor } = await import('../../security/background-monitor');
      BackgroundMonitor.start({
        enabled: true,
        checkInterval: 5 * 60 * 1000, // 5 minutes
        cleanupInterval: 60 * 60 * 1000, // 1 hour
        logLevel: 'warn'
      });
    } catch (error) {
      // Silently fail if security monitoring can't be started
      // Console statement removed for production
    }
  }

  /**
   * Cleanup
   */
  troy(): void {
    this.storage.close();
    this.eventManager.clearAllEventHandlers();
  }

  /**
   * Get configuration
   */
  getConfig(): IdentityCoreConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<IdentityCoreConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
