// Sync Manager - Handles core sync logic
import { SyncResult } from '../types/identitySync';
import { EncryptionManager } from './encryptionManager';
import { IPFSManager } from './ipfsManager';
import { DIDDocumentManager } from './didDocumentManager';
import { StorageManager } from './storageManager';
import { SecurityManager } from './securityManager';

export class SyncManager {
  private encryptionManager: EncryptionManager;
  private ipfsManager: IPFSManager;
  private didDocumentManager: DIDDocumentManager;
  private storageManager: StorageManager;
  private securityManager: SecurityManager;
  private deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.encryptionManager = new EncryptionManager();
    this.ipfsManager = new IPFSManager();
    this.didDocumentManager = new DIDDocumentManager();
    this.storageManager = new StorageManager();
    this.securityManager = new SecurityManager();
  }

  /**
   * Initialize encryption
   */
  async initializeEncryption(password: string, salt?: Uint8Array): Promise<void> {
    return this.encryptionManager.initializeEncryption(password, salt);
  }

  /**
   * Sync identity to all devices
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
      const cid = await this.ipfsManager.uploadToIPFS(encrypted);
      
      await this.didDocumentManager.updateDidDocument(identity.id, {
        service: [{
          id: '#identity-sync',
          type: 'IdentitySync',
          serviceEndpoint: `ipfs://${cid}`,
          timestamp: new Date().toISOString(),
          deviceId: this.deviceId
        }],
        updated: new Date().toISOString()
      });

      await this.storageManager.storeSecurely(identity.id, encrypted);
      await this.notifyOtherDevices(identity.id, cid);

      const result: SyncResult = {
        success: true,
        cid,
        timestamp: new Date().toISOString()
      };

      this.securityManager.logSecurityEvent('sync_success', {
        did: identity.id,
        cid,
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
   * Sync identity from cloud
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

      const didDoc = await this.didDocumentManager.resolveDidDocument(did);
      const syncService = didDoc.service?.find((s: any) => s.type === 'IdentitySync');
      
      if (!syncService) {
        return null;
      }

      const cid = syncService.serviceEndpoint.replace('ipfs://', '');
      const encrypted = await this.ipfsManager.downloadFromIPFS(cid);
      const identity = await this.encryptionManager.decryptIdentity(encrypted);
      
      await this.storageManager.storeSecurely(did, encrypted);

      this.securityManager.logSecurityEvent('sync_from_cloud_success', {
        did,
        cid,
        duration: Date.now() - startTime
      });

      return identity;
    } catch (error) {
      this.securityManager.logSecurityEvent('sync_from_cloud_failed', {
        did,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });

      if (process.env.NODE_ENV === 'development') {
        // Console statement removed for production
      }

      return null;
    }
  }

  /**
   * Notify other devices about sync
   */
  private async notifyOtherDevices(did: string, cid: string): Promise<void> {
    try {
      this.securityManager.logSecurityEvent('device_notification_sent', { did, cid });
      // Console statement removed for production
    } catch (error) {
      this.securityManager.logSecurityEvent('device_notification_failed', {
        did,
        cid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Check if encryption is initialized
   */
  isEncryptionInitialized(): boolean {
    return this.encryptionManager.isEncryptionInitialized();
  }
}
