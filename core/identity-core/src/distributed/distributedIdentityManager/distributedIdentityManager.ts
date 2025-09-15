import { DIDResolver } from '../DIDResolver';
import { IdentitySync, SyncResult } from '../IdentitySync';
import { DecentralizedAuth, AuthChallenge, AuthSession } from '../DecentralizedAuth';
import { Identity } from '../../types';
import { DistributedIdentityConfig, SystemStatus, ExportData } from './types/distributedIdentityManager';
import { DistributedZKProofManager } from './zkProofManager';
import { OperationLogger } from './operationLogger';
import { DIDDocumentManager } from './didDocumentManager';

export class DistributedIdentityManager {
  private resolver: DIDResolver;
  private sync: IdentitySync;
  private auth: DecentralizedAuth;
  private zkProofManager: DistributedZKProofManager;
  private operationLogger: OperationLogger;
  private didDocumentManager: DIDDocumentManager;
  private config: DistributedIdentityConfig;

  constructor(config: DistributedIdentityConfig = {}) {
    this.config = {
      enableIPFS: true,
      enableBlockchain: true,
      enableZKProofs: true,
      ...config
    };

    this.resolver = new DIDResolver();
    this.sync = new IdentitySync(config.deviceId);
    this.auth = new DecentralizedAuth(this.resolver);
    this.zkProofManager = new DistributedZKProofManager(this.config);
    this.operationLogger = new OperationLogger();
    this.didDocumentManager = new DIDDocumentManager();
  }

  /**
   * Initialize the distributed identity system
   */
  async initialize(syncPassword: string): Promise<void> {
    try {
      await this.sync.initializeEncryption(syncPassword);
      
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
    } catch (error) {
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
      throw error;
    }
  }

  /**
   * Create a new distributed identity
   */
  async createIdentity(identity: Identity): Promise<SyncResult> {
    try {
      // 1. Generate cryptographic key pair
      const keyPair = await this.auth.generateKeyPair();
      const publicKeyString = await this.auth.exportPublicKey(keyPair.publicKey);

      // 2. Create DID document
      const didDocument = this.didDocumentManager.createDidDocument(identity.id, publicKeyString);

      // 3. Store DID document locally
      this.didDocumentManager.storeDidDocument(identity.id, didDocument);

      // 4. Generate ZK proof of identity existence
      if (this.config.enableZKProofs) {
        await this.zkProofManager.generateIdentityExistenceProof(identity.id);
      }

      // 5. Sync identity to all devices
      const syncResult = await this.sync.syncToAllDevices(identity);

      // 6. Log operation
      this.operationLogger.logOperation('create', identity.id, true);

      return syncResult;

    } catch (error) {
      this.operationLogger.logOperation('create', identity.id, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Sync identity from cloud
   */
  async syncIdentity(did: string): Promise<Identity | null> {
    try {
      const identity = await this.sync.syncFromCloud(did);
      
      if (identity) {
        this.operationLogger.logOperation('sync', did, true);
      } else {
        this.operationLogger.logOperation('sync', did, false, 'Identity not found');
      }

      return identity;

    } catch (error) {
      this.operationLogger.logOperation('sync', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Authenticate identity
   */
  async authenticateIdentity(did: string): Promise<AuthChallenge> {
    try {
      const challenge = await this.auth.createChallenge(did);
      this.operationLogger.logOperation('authenticate', did, true);
      return challenge;

    } catch (error) {
      this.operationLogger.logOperation('authenticate', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Resolve DID
   */
  async resolveDID(did: string): Promise<any> {
    try {
      const result = await this.resolver.resolve(did);
      this.operationLogger.logOperation('resolve', did, true);
      return result;

    } catch (error) {
      this.operationLogger.logOperation('resolve', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate ZK proof
   */
  async generateZKProof(did: string, proofType: string, data: any): Promise<any> {
    try {
      let proof;

      switch (proofType) {
        case 'existence':
          proof = await this.zkProofManager.generateIdentityExistenceProof(did);
          break;
        case 'selective_disclosure':
          proof = await this.zkProofManager.generateSelectiveDisclosureProof(did, data.data, data.disclosedFields);
          break;
        case 'age_verification':
          proof = await this.zkProofManager.generateAgeVerificationProof(did, data.birthDate, data.minimumAge);
          break;
        case 'credential_verification':
          proof = await this.zkProofManager.generateCredentialVerificationProof(did, data.credentialHash, data.credentialType);
          break;
        case 'permission':
          proof = await this.zkProofManager.generatePermissionProof(did, data.permissions, data.requiredPermissions);
          break;
        default:
          throw new Error(`Unknown proof type: ${proofType}`);
      }

      this.operationLogger.logOperation('zk_proof', did, true);
      return proof;

    } catch (error) {
      this.operationLogger.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get system status
   */
  getSystemStatus(): SystemStatus {
    return {
      encryptionInitialized: this.isEncryptionInitialized(),
      deviceId: this.getDeviceId(),
      operationCount: this.operationLogger.getOperationCount(),
      lastOperation: this.operationLogger.getLastOperation(),
      zkProofStats: this.zkProofManager.getZKProofStats()
    };
  }

  /**
   * Export identity for backup
   */
  async exportIdentity(did: string): Promise<string> {
    try {
      const identity = await this.sync.syncFromCloud(did);
      if (!identity) {
        throw new Error('Identity not found');
      }

      const exportData: ExportData = {
        identity,
        deviceId: this.getDeviceId(),
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };

      return btoa(JSON.stringify(exportData));

    } catch (error) {
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
      throw error;
    }
  }

  /**
   * Import identity from backup
   */
  async importIdentity(backupData: string): Promise<Identity> {
    try {
      const exportData = JSON.parse(atob(backupData));
      
      if (!exportData.identity || !exportData.identity.id) {
        throw new Error('Invalid backup data');
      }

      // Sync the imported identity
      await this.sync.syncToAllDevices(exportData.identity);

      return exportData.identity;

    } catch (error) {
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }
      throw error;
    }
  }

  /**
   * Check if encryption is initialized
   */
  private isEncryptionInitialized(): boolean {
    // This would check the actual encryption state
    return true; // Production implementation required
  }

  /**
   * Get device ID
   */
  private getDeviceId(): string {
    return this.sync.getDeviceId() || 'unknown';
  }

  /**
   * Get operation logger
   */
  getOperationLogger(): OperationLogger {
    return this.operationLogger;
  }

  /**
   * Get DID document manager
   */
  getDIDDocumentManager(): DIDDocumentManager {
    return this.didDocumentManager;
  }

  /**
   * Get ZK proof manager
   */
  getZKProofManager(): DistributedZKProofManager {
    return this.zkProofManager;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<DistributedIdentityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.zkProofManager.updateConfig(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): DistributedIdentityConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.operationLogger.clearOperations();
    // Additional cleanup as needed
  }
}
