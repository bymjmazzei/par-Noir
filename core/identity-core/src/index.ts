/**
 * Identity Core - Main class for managing decentralized identities
 */

import { 
  DID, 
  CreateDIDOptions, 
  AuthenticateOptions, 
  UpdateMetadataOptions,
  GrantToolAccessOptions,
  ChallengeResponse,
  SignatureVerification,
  IdentityCoreConfig,
  IdentityCoreEventType,
  IdentityCoreEventHandler,
  IdentityError,
  IdentityErrorCodes
} from './types';

import { CryptoManager } from './encryption/crypto';
import { IndexedDBStorage } from './storage/indexeddb';
import { PrivacyManager, ToolAccessRequest } from './utils/privacy-manager';

export class IdentityCore {
  private storage: IndexedDBStorage;
  private privacyManager: PrivacyManager;
  private config: IdentityCoreConfig;
  private eventHandlers: Map<IdentityCoreEventType, Set<IdentityCoreEventHandler<any>>> = new Map();

  constructor(config: Partial<IdentityCoreConfig> = {}) {
    this.config = {
      storageType: 'indexeddb',
      encryptionLevel: 'high',
      backupEnabled: false,
      biometricEnabled: false,
      ...config
    };

    this.storage = new IndexedDBStorage();
    this.privacyManager = new PrivacyManager();

    // Start background security monitoring
    this.startBackgroundSecurity();
  }

  /**
   * Start background security monitoring
   */
  private async startBackgroundSecurity(): Promise<void> {
    try {
      const { BackgroundMonitor } = await import('./security/background-monitor');
      BackgroundMonitor.start({
        enabled: true,
        checkInterval: 5 * 60 * 1000, // 5 minutes
        cleanupInterval: 60 * 60 * 1000, // 1 hour
        logLevel: 'warn'
      });
    } catch (error) {
      // Silently fail if security monitoring can't be started
      console.warn('Background security monitoring not available:', error);
    }
  }

  /**
   * Initialize the identity core
   */
  async initialize(): Promise<void> {
    try {
      await this.storage.initialize();
      this.emit('initialized', {});
    } catch (error) {
      throw new IdentityError(
        'Failed to initialize Identity Core',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Create a new DID with enhanced security validation
   */
  async createDID(options: CreateDIDOptions): Promise<DID> {
    try {
      // Validate pN Name with enhanced security
      if (!options.pnName || options.pnName.length < 3) {
        throw new IdentityError(
          'pN Name must be at least 3 characters long',
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }

      // Validate pN Name format (alphanumeric and hyphens only)
      if (!/^[a-zA-Z0-9-]+$/.test(options.pnName)) {
        throw new IdentityError(
          'pN Name can only contain letters, numbers, and hyphens',
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }

      // Check for reserved pN Names
      const reservedUsernames = ['admin', 'root', 'system', 'test', 'guest', 'anonymous'];
      if (reservedUsernames.includes(options.pnName.toLowerCase())) {
        throw new IdentityError(
          'pN Name is reserved and cannot be used',
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }

      // Validate passcode strength
      const passcodeValidation = CryptoManager.validatePasscode(options.passcode);
      if (!passcodeValidation.isValid) {
        throw new IdentityError(
          `Weak passcode: ${passcodeValidation.errors.join(', ')}`,
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }

      // Check if username already exists
      const existingDID = await this.storage.getDIDByPNName(options.pnName);
      if (existingDID) {
        throw new IdentityError(
          'pN Name already exists',
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }

      // Generate key pair with enhanced security
      const keyPair = await CryptoManager.generateKeyPair();

      // Create DID with enhanced metadata
      const did: DID = {
        id: `did:key:${await CryptoManager.hash(keyPair.publicKey)}`,
        pnName: options.pnName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        metadata: {
          displayName: options.displayName || undefined,
          email: options.email || undefined,
          preferences: {
            privacy: 'medium',
            sharing: 'selective',
            notifications: true,
            backup: this.config.backupEnabled,
            ...options.preferences
          },
          security: {
            lastLoginAttempt: undefined,
            failedAttempts: 0,
            accountLockedUntil: undefined,
            ipAddress: undefined,
            userAgent: undefined,
            deviceFingerprint: undefined
          }
        },
        keys: {
          primary: keyPair.privateKey, // Encrypted private key
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
        },
        permissions: {}
      };

      // Store encrypted DID
      await this.storage.storeDID(did, options.passcode);

      // Log successful creation
      this.emit('did_created', { didId: did.id, pnName: did.pnName });
      return did;

    } catch (error) {
      throw new IdentityError(
        'Failed to create DID',
        IdentityErrorCodes.CREATION_ERROR,
        error
      );
    }
  }

  /**
   * Authenticate DID with enhanced security measures
   */
  async authenticate(options: AuthenticateOptions): Promise<DID> {
    try {
      // Check for account lockout
      if (CryptoManager.isAccountLocked(options.pnName)) {
        throw new IdentityError(
          'Account is temporarily locked due to too many failed attempts. Please try again later.',
          IdentityErrorCodes.AUTHENTICATION_ERROR
        );
      }

      // Validate passcode strength
      const passcodeValidation = CryptoManager.validatePasscode(options.passcode);
      if (!passcodeValidation.isValid) {
        CryptoManager.recordFailedAttempt(options.pnName);
        throw new IdentityError(
          `Weak passcode: ${passcodeValidation.errors.join(', ')}`,
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }

      // Retrieve and decrypt DID
      const did = await this.storage.getDID(options.pnName, options.passcode);
      
      if (!did) {
        // Record failed attempt
        CryptoManager.recordFailedAttempt(options.pnName);
        throw new IdentityError(
          'Invalid username or passcode',
          IdentityErrorCodes.AUTHENTICATION_ERROR
        );
      }

      // Check if account is locked in metadata
      if (did.metadata.security?.accountLockedUntil) {
        const lockUntil = new Date(did.metadata.security.accountLockedUntil);
        if (new Date() < lockUntil) {
          throw new IdentityError(
            'Account is locked until ' + lockUntil.toLocaleString(),
            IdentityErrorCodes.AUTHENTICATION_ERROR
          );
        }
      }

      // Clear failed attempts on successful authentication
      CryptoManager.clearFailedAttempts(options.pnName);

      // Update security metadata
      did.metadata.security = {
        ...did.metadata.security,
        lastLoginAttempt: new Date().toISOString(),
        failedAttempts: 0,
        accountLockedUntil: undefined
      };

      // Store updated DID
      await this.storage.updateDID(did, options.passcode);

      // Log successful authentication
      this.emit('did_authenticated', { didId: did.id, pnName: did.pnName });

      return did;

    } catch (error) {
      // Record failed attempt for authentication errors
      if (error instanceof IdentityError && error.code === IdentityErrorCodes.AUTHENTICATION_ERROR) {
        CryptoManager.recordFailedAttempt(options.pnName);
      }
      throw error;
    }
  }

  /**
   * Get all DIDs (without decryption)
   */
  async getAllDIDs(): Promise<Array<{ id: string; pnName: string; createdAt: string; status: string }>> {
    return this.storage.getAllDIDs();
  }

  /**
   * Update DID metadata with enhanced security validation
   */
  async updateMetadata(options: UpdateMetadataOptions): Promise<DID> {
    try {
      // Import security systems dynamically to avoid circular dependencies
      const { MetadataValidator } = await import('./security/metadata-validator');
      const { ThreatDetector } = await import('./security/threat-detector');

      // Record security event
      ThreatDetector.recordEvent({
        eventType: 'metadata_update_started',
        userId: options.did,
        dashboardId: 'identity-core',
        details: { metadata: options.metadata },
        riskLevel: 'low'
      });

      const did = await this.storage.getDID(options.did, options.passcode);
      
      // Enhanced security validation - silent validation that fixes issues automatically
      const sanitizedMetadata = MetadataValidator.silentValidate(options.metadata);
      
      // Update metadata with sanitized data
      did.metadata = {
        ...did.metadata,
        ...sanitizedMetadata
      };
      did.updatedAt = new Date().toISOString();

      // Store updated DID
      await this.storage.updateDID(did, options.passcode);

      // Record successful update
      ThreatDetector.recordEvent({
        eventType: 'metadata_update_completed',
        userId: options.did,
        dashboardId: 'identity-core',
        details: { metadata: sanitizedMetadata },
        riskLevel: 'low'
      });

      this.emit('did:updated', did);
      return did;

    } catch (error) {
      // Record failed update
      const { ThreatDetector } = await import('./security/threat-detector');
      ThreatDetector.recordEvent({
        eventType: 'metadata_update_failed',
        userId: options.did,
        dashboardId: 'identity-core',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        riskLevel: 'medium'
      });

      throw new IdentityError(
        'Failed to update metadata',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Grant tool access
   */
  async grantToolAccess(options: GrantToolAccessOptions): Promise<DID> {
    try {
      const did = await this.storage.getDID(options.did, options.passcode);
      
      did.permissions[options.toolId] = {
        granted: true,
        grantedAt: new Date().toISOString(),
        expiresAt: options.expiresAt || undefined,
        permissions: options.permissions
      };

      await this.storage.updateDID(did, options.passcode);

      this.emit('tool:access:granted', options.did);
      return did;

    } catch (error) {
      throw new IdentityError(
        'Failed to grant tool access',
        IdentityErrorCodes.PERMISSION_DENIED,
        error
      );
    }
  }

  /**
   * Process tool access request
   */
  async processToolRequest(
    didId: string,
    passcode: string,
    request: ToolAccessRequest
  ): Promise<any> {
    try {
      const did = await this.storage.getDID(didId, passcode);
      return await this.privacyManager.processToolAccessRequest(did, request);
    } catch (error) {
      throw new IdentityError(
        'Failed to process tool request',
        IdentityErrorCodes.PERMISSION_DENIED,
        error
      );
    }
  }

  /**
   * Generate challenge for authentication
   */
  async generateChallenge(didId: string): Promise<ChallengeResponse> {
    try {
      const challenge = await CryptoManager.hash(
        `${didId}:${Date.now()}:${Math.random()}`
      );

      return {
        challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
      };
    } catch (error) {
      throw new IdentityError(
        'Failed to generate challenge',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Verify signature
   */
  async verifySignature(
    didId: string,
    challenge: string,
    signature: string,
    passcode: string
  ): Promise<SignatureVerification> {
    try {
      // Verify signature using the stored public key
      // Implementation uses proper cryptographic verification
      const verified = await this.verifySignatureCryptographically(didId, challenge, signature, passcode);

      return {
        did: didId,
        challenge,
        signature,
        verified
      };
    } catch (error) {
      return {
        did: didId,
        challenge,
        signature,
        verified: false
      };
    }
  }

  /**
   * Cryptographic signature verification
   */
  private async verifySignatureCryptographically(didId: string, challenge: string, signature: string, passcode: string): Promise<boolean> {
    try {
      // Get the DID and extract public key
      const didInfo = await this.storage.getDID(didId, passcode);
      if (!didInfo) return false;

      // Import the public key for verification
      const publicKeyBuffer = this.base64ToArrayBuffer(didInfo.keys.publicKey);
      const importedPublicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'ECDSA', namedCurve: 'P-384' },
        false,
        ['verify']
      );

      // Hash the challenge
      const encoder = new TextEncoder();
      const challengeBuffer = encoder.encode(challenge);
      const hashBuffer = await crypto.subtle.digest('SHA-512', challengeBuffer);

      // Convert signature from base64 to ArrayBuffer
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      // Verify the signature
      const isValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-512' },
        importedPublicKey,
        signatureBuffer,
        hashBuffer
      );

      if (!isValid) {
        this.logSecurityEvent('signature_verification_failed', { didId, reason: 'invalid_signature' }, 'high');
      }

      return isValid;
    } catch (error) {
      this.logSecurityEvent('signature_verification_failed', { didId, error: error instanceof Error ? error.message : 'Unknown error' }, 'high');
      return false;
    }
  }

  /**
   * Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Delete DID
   */
  async deleteDID(didId: string): Promise<void> {
    try {
      await this.storage.deleteDID(didId);
      this.emit('did:deleted', didId);
    } catch (error) {
      throw new IdentityError(
        'Failed to delete DID',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

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
  }

  /**
   * Event handling
   */
  on<T extends IdentityCoreEventType>(
    event: T,
    handler: IdentityCoreEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event handler
   */
  off<T extends IdentityCoreEventType>(
    event: T,
    handler: IdentityCoreEventHandler<T>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit event
   */
  private emit<T extends IdentityCoreEventType>(
    event: T,
    data: Parameters<IdentityCoreEventHandler<T>>[0]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          this.logSecurityEvent('event_handler_error', { event, error }, 'medium');
        }
      });
    }
  }

  /**
   * Log security events for audit and monitoring
   */
  private logSecurityEvent(event: string, details: any, riskLevel: 'low' | 'medium' | 'high' | 'critical'): void {
    const securityEvent = {
      timestamp: new Date().toISOString(),
      event,
      details,
      riskLevel,
      didId: details.didId || 'system'
    };
    
    // Store in audit log
    this.privacyManager.logSecurityEvent(securityEvent);
    
    // Emit security event for external monitoring
    this.emit('security:event', securityEvent);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.storage.close();
    this.eventHandlers.clear();
  }
}

export { CryptoManager } from './encryption/crypto';
export { IndexedDBStorage } from './storage/indexeddb';
export { PrivacyManager } from './utils/privacy-manager';
export { ZKProofManager } from './encryption/zk-proofs';
export { DIDResolver } from './distributed/DIDResolver';
export { IdentitySync } from './distributed/IdentitySync';
export { DecentralizedAuth } from './distributed/DecentralizedAuth'; 