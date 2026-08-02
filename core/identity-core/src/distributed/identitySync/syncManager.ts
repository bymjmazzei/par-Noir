// Sync Manager - local secure storage only (IPFS/OrbitDB removed)
import { SyncResult } from '../types/identitySync';
import { EncryptionManager } from './encryptionManager';
import { DIDDocumentManager } from './didDocumentManager';
import { StorageManager } from './storageManager';
import { SecurityManager } from './securityManager';

export class SyncManager {
  private encryptionManager: EncryptionManager;
  private didDocumentManager: DIDDocumentManager;
  private storageManager: StorageManager;
  private securityManager: SecurityManager;
  private deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.encryptionManager = new EncryptionManager();
    this.didDocumentManager = new DIDDocumentManager();
    this.storageManager = new StorageManager();
    this.securityManager = new SecurityManager();
  }

  async initializeEncryption(password: string, salt?: Uint8Array): Promise<void> {
    return this.encryptionManager.initializeEncryption(password, salt);
  }

  /**
   * Persist encrypted identity locally. Remote IPFS sync was removed.
   */
  async syncToAllDevices(identity: any): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      if (!this.encryptionManager.isEncryptionInitialized()) {
        throw new Error('Encryption key not initialized');
      }

      if (!this.securityManager.checkRateLimit(identity.id)) {
        throw new Error('Rate limit exceeded - too many sync attempts');
      }

      const encrypted = await this.encryptionManager.encryptIdentity(identity);
      await this.storageManager.storeSecurely(identity.id, encrypted);

      await this.didDocumentManager.updateDidDocument(identity.id, {
        service: [{
          id: '#identity-sync',
          type: 'IdentitySync',
          serviceEndpoint: 'local://secure-storage',
          timestamp: new Date().toISOString(),
          deviceId: this.deviceId
        }],
        updated: new Date().toISOString()
      });

      const result: SyncResult = {
        success: true,
        timestamp: new Date().toISOString()
      };

      this.securityManager.logSecurityEvent('sync_success', {
        did: identity.id,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      const result: SyncResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };

      this.securityManager.logSecurityEvent('sync_failed', {
        did: identity.id,
        error: result.error,
        duration: Date.now() - startTime
      });

      return result;
    }
  }

  /**
   * Load identity from local secure storage only.
   */
  async syncFromCloud(did: string): Promise<any | null> {
    const startTime = Date.now();

    try {
      if (!this.securityManager.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many sync attempts');
      }

      const localIdentity = await this.storageManager.getFromSecure(did);
      if (localIdentity) {
        this.securityManager.logSecurityEvent('sync_from_local', {
          did,
          duration: Date.now() - startTime
        });
        return localIdentity;
      }

      return null;
    } catch (error) {
      this.securityManager.logSecurityEvent('sync_from_cloud_failed', {
        did,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });

      return null;
    }
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  isEncryptionInitialized(): boolean {
    return this.encryptionManager.isEncryptionInitialized();
  }
}
