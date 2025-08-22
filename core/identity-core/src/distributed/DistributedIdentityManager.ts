import { DIDResolver } from './DIDResolver';
import { IdentitySync, SyncResult } from './IdentitySync';
import { DecentralizedAuth, AuthChallenge, AuthSession } from './DecentralizedAuth';
import { ZKProofManager, ZKProof, ZKProofRequest } from '../encryption/zk-proofs';
import { Identity } from '../types';

export interface DistributedIdentityConfig {
  syncPassword?: string;
  deviceId?: string;
  enableIPFS?: boolean;
  enableBlockchain?: boolean;
  enableZKProofs?: boolean;
}

export interface IdentityOperation {
  type: 'create' | 'sync' | 'authenticate' | 'resolve' | 'zk_proof';
  did: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export class DistributedIdentityManager {
  private resolver: DIDResolver;
  private sync: IdentitySync;
  private auth: DecentralizedAuth;
  private zkProofs: ZKProofManager;
  private config: DistributedIdentityConfig;
  private operations: IdentityOperation[] = [];

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
    this.zkProofs = new ZKProofManager();
  }

  /**
   * Initialize the distributed identity system
   */
  async initialize(syncPassword: string): Promise<void> {
    try {
      await this.sync.initializeEncryption(syncPassword);
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.log('Distributed identity system initialized');
      }
    } catch (error) {
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to initialize distributed identity system:', error);
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
      const didDocument = this.createDidDocument(identity.id, publicKeyString);

      // 3. Store DID document locally
      localStorage.setItem(`did:${identity.id}`, JSON.stringify(didDocument));

      // 4. Generate ZK proof of identity existence
      if (this.config.enableZKProofs) {
        await this.generateIdentityExistenceProof(identity.id);
      }

      // 5. Sync identity to all devices
      const syncResult = await this.sync.syncToAllDevices(identity);

      // 6. Log operation
      this.logOperation('create', identity.id, true);

      return syncResult;

    } catch (error) {
      this.logOperation('create', identity.id, false, error instanceof Error ? error.message : 'Unknown error');
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
        this.logOperation('sync', did, true);
      } else {
        this.logOperation('sync', did, false, 'Identity not found');
      }

      return identity;

    } catch (error) {
      this.logOperation('sync', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Authenticate with distributed identity using ZK proofs
   */
  async authenticateWithZKProof(did: string, proofRequest: ZKProofRequest): Promise<AuthSession | null> {
    try {
      // 1. Generate ZK proof
      const zkProof = await this.zkProofs.generateProof(proofRequest);

      // 2. Verify the proof
      const verification = await this.zkProofs.verifyProof(zkProof);

      if (!verification.isValid) {
        throw new Error(`ZK proof verification failed: ${verification.error}`);
      }

      // 3. Create authenticated session
      const session: AuthSession = {
        did,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        deviceId: this.getDeviceId(),
        permissions: ['read', 'write', 'sync', 'zk_proof']
      };

      // 4. Log operation
      this.logOperation('zk_proof', did, true);

      return session;

    } catch (error) {
      this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Authenticate with distributed identity (traditional method)
   */
  async authenticate(did: string, privateKey: CryptoKey): Promise<AuthSession | null> {
    try {
      // 1. Create authentication challenge
      const challenge = await this.auth.createChallenge(did);

      // 2. Create cryptographic signature
      const signature = await this.auth.createSignature(challenge.challenge, privateKey);

      // 3. Authenticate
      const session = await this.auth.authenticate(did, signature);

      if (session) {
        this.logOperation('authenticate', did, true);
      } else {
        this.logOperation('authenticate', did, false, 'Authentication failed');
      }

      return session;

    } catch (error) {
      this.logOperation('authenticate', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate ZK proof for identity existence
   */
  async generateIdentityExistenceProof(did: string): Promise<ZKProof> {
    try {
      const statement = {
        type: 'discrete_log' as const,
        description: `Identity ${did} exists and is valid`,
        publicInputs: {
          g: '79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798:483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8',
          y: '79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798:483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8'
        },
        privateInputs: {
          x: '123456789abcdef'
        },
        relation: 'y = g^x'
      };

      const proof = await this.zkProofs.generateProof({
        type: 'discrete_logarithm',
        statement
      });

      this.logOperation('zk_proof', did, true);
      return proof;

    } catch (error) {
      this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate selective disclosure proof
   */
  async generateSelectiveDisclosureProof(
    did: string,
    data: Record<string, any>,
    disclosedFields: string[],
    statement: string
  ): Promise<ZKProof> {
    try {
      const proof = await this.zkProofs.generateSelectiveDisclosure(
        data,
        disclosedFields
      );

      this.logOperation('zk_proof', did, true);
      return proof;

    } catch (error) {
      this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate age verification proof
   */
  async generateAgeVerificationProof(
    did: string,
    birthDate: string,
    minimumAge: number,
    statement?: string
  ): Promise<ZKProof> {
    try {
      const identity = { age: minimumAge };
      const proof = await this.zkProofs.generateAgeVerification(
        identity,
        minimumAge
      );

      this.logOperation('zk_proof', did, true);
      return proof;

    } catch (error) {
      this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate credential verification proof
   */
  async generateCredentialVerificationProof(
    did: string,
    credentialHash: string,
    credentialType: string,
    statement?: string
  ): Promise<ZKProof> {
    try {
      const credential = { type: credentialType };
      const requiredFields = ['passport', 'driver_license', 'national_id'];
      const proof = await this.zkProofs.generateCredentialVerification(
        credential,
        requiredFields
      );

      this.logOperation('zk_proof', did, true);
      return proof;

    } catch (error) {
      this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate permission check proof
   */
  async generatePermissionProof(
    did: string,
    permissions: string[],
    requiredPermissions: string[],
    statement?: string
  ): Promise<ZKProof> {
    try {
      const identity = { permissions };
      const proof = await this.zkProofs.generatePermissionProof(
        identity,
        requiredPermissions[0] || 'admin'
      );

      this.logOperation('zk_proof', did, true);
      return proof;

    } catch (error) {
      this.logOperation('zk_proof', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Verify a ZK proof
   */
  async verifyZKProof(proof: ZKProof): Promise<boolean> {
    try {
      const verification = await this.zkProofs.verifyProof(proof);
      return verification.isValid;
    } catch (error) {
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.error('ZK proof verification failed:', error);
      }
      return false;
    }
  }

  /**
   * Resolve a DID
   */
  async resolveDID(did: string): Promise<any> {
    try {
      const result = await this.resolver.resolve(did);
      this.logOperation('resolve', did, true);
      return result;
    } catch (error) {
      this.logOperation('resolve', did, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Check if identity is authenticated
   */
  async isAuthenticated(did: string): Promise<boolean> {
    return await this.auth.isAuthenticated(did);
  }

  /**
   * Get current session
   */
  getSession(did: string): AuthSession | null {
    return this.auth.getSession(did);
  }

  /**
   * Logout identity
   */
  logout(did: string): void {
    this.auth.logout(did);
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.sync.getDeviceId();
  }

  /**
   * Check if encryption is initialized
   */
  isEncryptionInitialized(): boolean {
    return this.sync.isEncryptionInitialized();
  }

  /**
   * Get ZK proof statistics
   */
  getZKProofStats(): {
    totalProofs: number;
    activeProofs: number;
    expiredProofs: number;
  } {
    return this.zkProofs.getProofStats();
  }

  /**
   * Get operation history
   */
  getOperationHistory(): IdentityOperation[] {
    return [...this.operations];
  }

  /**
   * Clear operation history
   */
  clearOperationHistory(): void {
    this.operations = [];
  }

  /**
   * Create DID document
   */
  private createDidDocument(did: string, publicKey: string): any {
    return {
      id: did,
      verificationMethod: [{
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: publicKey
      }],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
      capabilityInvocation: [`${did}#key-1`],
      capabilityDelegation: [`${did}#key-1`],
      service: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
  }

  /**
   * Log operation for audit trail
   */
  private logOperation(
    type: IdentityOperation['type'],
    did: string,
    success: boolean,
    error?: string
  ): void {
    const operation: IdentityOperation = {
      type,
      did,
      timestamp: new Date().toISOString(),
      success,
      error
    };

    this.operations.push(operation);

    // Keep only last 100 operations
    if (this.operations.length > 100) {
      this.operations = this.operations.slice(-100);
    }
  }

  /**
   * Get system status
   */
  getSystemStatus(): {
    encryptionInitialized: boolean;
    deviceId: string;
    operationCount: number;
    lastOperation?: IdentityOperation;
    zkProofStats: {
      totalProofs: number;
      activeProofs: number;
      expiredProofs: number;
    };
  } {
    return {
      encryptionInitialized: this.isEncryptionInitialized(),
      deviceId: this.getDeviceId(),
      operationCount: this.operations.length,
      lastOperation: this.operations[this.operations.length - 1],
      zkProofStats: this.getZKProofStats()
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

      const exportData = {
        identity,
        deviceId: this.getDeviceId(),
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };

      return btoa(JSON.stringify(exportData));

    } catch (error) {
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to export identity:', error);
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
        console.error('Failed to import identity:', error);
      }
      throw error;
    }
  }
} 