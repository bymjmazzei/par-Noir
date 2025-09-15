// Main IdentitySync Class - Maintains backward compatibility while using modular components
import { SyncResult } from '../types/identitySync';
import { SyncManager } from './syncManager';
import { EncryptionManager } from './encryptionManager';
import { IPFSManager } from './ipfsManager';
import { DIDDocumentManager } from './didDocumentManager';
import { StorageManager } from './storageManager';
import { SecurityManager } from './securityManager';

export class IdentitySync {
  private syncManager: SyncManager;
  private encryptionManager: EncryptionManager;
  private ipfsManager: IPFSManager;
  private didDocumentManager: DIDDocumentManager;
  private storageManager: StorageManager;
  private securityManager: SecurityManager;
  private deviceId: string;

  constructor(deviceId?: string) {
    this.deviceId = deviceId || this.generateDeviceId();
    this.syncManager = new SyncManager(this.deviceId);
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
    return this.syncManager.initializeEncryption(password, salt);
  }

  /**
   * Sync identity to all devices
   */
  async syncToAllDevices(identity: any): Promise<SyncResult> {
    return this.syncManager.syncToAllDevices(identity);
  }

  /**
   * Sync identity from cloud
   */
  async syncFromCloud(did: string): Promise<any | null> {
    return this.syncManager.syncFromCloud(did);
  }

  /**
   * Encrypt identity
   */
  async encryptIdentity(identity: any): Promise<string> {
    return this.encryptionManager.encryptIdentity(identity);
  }

  /**
   * Decrypt identity
   */
  async decryptIdentity(encryptedData: string): Promise<any> {
    return this.encryptionManager.decryptIdentity(encryptedData);
  }

  /**
   * Upload data to IPFS
   */
  async uploadToIPFS(data: string): Promise<string> {
    return this.ipfsManager.uploadToIPFS(data);
  }

  /**
   * Download data from IPFS
   */
  async downloadFromIPFS(cid: string): Promise<string> {
    return this.ipfsManager.downloadFromIPFS(cid);
  }

  /**
   * Update DID document
   */
  async updateDidDocument(did: string, updates: any): Promise<void> {
    return this.didDocumentManager.updateDidDocument(did, updates);
  }

  /**
   * Resolve DID document
   */
  async resolveDidDocument(did: string): Promise<any> {
    return this.didDocumentManager.resolveDidDocument(did);
  }

  /**
   * Store data securely
   */
  async storeSecurely(key: string, data: string): Promise<void> {
    return this.storageManager.storeSecurely(key, data);
  }

  /**
   * Get data from secure storage
   */
  async getFromSecureStorage(key: string): Promise<string | null> {
    return this.storageManager.getFromSecureStorage(key);
  }

  /**
   * Get data from secure storage for sync
   */
  async getFromSecure(did: string): Promise<any | null> {
    return this.storageManager.getFromSecure(did);
  }

  /**
   * Check rate limit
   */
  checkRateLimit(identifier: string): boolean {
    return this.securityManager.checkRateLimit(identifier);
  }

  /**
   * Get audit log for security monitoring
   */
  getAuditLog(): Array<{ timestamp: string; event: string; details: any; userAgent: string; deviceId: string }> {
    return this.securityManager.getAuditLog();
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.securityManager.clearAuditLog();
  }

  /**
   * Generate device ID
   */
  private generateDeviceId(): string {
    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    return `device-${timestamp}-${entropy}`;
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
    return this.syncManager.isEncryptionInitialized();
  }
}
