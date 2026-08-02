// Main IdentitySync Class — local secure storage (IPFS removed)
import { SyncResult } from '../types/identitySync';
import { SyncManager } from './syncManager';
import { EncryptionManager } from './encryptionManager';
import { DIDDocumentManager } from './didDocumentManager';
import { StorageManager } from './storageManager';
import { SecurityManager } from './securityManager';

export class IdentitySync {
  private syncManager: SyncManager;
  private encryptionManager: EncryptionManager;
  private didDocumentManager: DIDDocumentManager;
  private storageManager: StorageManager;
  private securityManager: SecurityManager;
  private deviceId: string;

  constructor(deviceId?: string) {
    this.deviceId = deviceId || this.generateDeviceId();
    this.syncManager = new SyncManager(this.deviceId);
    this.encryptionManager = new EncryptionManager();
    this.didDocumentManager = new DIDDocumentManager();
    this.storageManager = new StorageManager();
    this.securityManager = new SecurityManager();
  }

  async initializeEncryption(password: string, salt?: Uint8Array): Promise<void> {
    return this.syncManager.initializeEncryption(password, salt);
  }

  async syncToAllDevices(identity: any): Promise<SyncResult> {
    return this.syncManager.syncToAllDevices(identity);
  }

  async syncFromCloud(did: string): Promise<any | null> {
    return this.syncManager.syncFromCloud(did);
  }

  async encryptIdentity(identity: any): Promise<string> {
    return this.encryptionManager.encryptIdentity(identity);
  }

  async decryptIdentity(encryptedData: string): Promise<any> {
    return this.encryptionManager.decryptIdentity(encryptedData);
  }

  async updateDidDocument(did: string, updates: any): Promise<void> {
    return this.didDocumentManager.updateDidDocument(did, updates);
  }

  async resolveDidDocument(did: string): Promise<any> {
    return this.didDocumentManager.resolveDidDocument(did);
  }

  async storeSecurely(key: string, data: string): Promise<void> {
    return this.storageManager.storeSecurely(key, data);
  }

  async getFromSecureStorage(key: string): Promise<string | null> {
    return this.storageManager.getFromSecureStorage(key);
  }

  async getFromSecure(did: string): Promise<any | null> {
    return this.storageManager.getFromSecure(did);
  }

  checkRateLimit(identifier: string): boolean {
    return this.securityManager.checkRateLimit(identifier);
  }

  getAuditLog(): Array<{ timestamp: string; event: string; details: any; userAgent: string; deviceId: string }> {
    return this.securityManager.getAuditLog();
  }

  clearAuditLog(): void {
    this.securityManager.clearAuditLog();
  }

  private generateDeviceId(): string {
    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    return `device-${timestamp}-${entropy}`;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  isEncryptionInitialized(): boolean {
    return this.syncManager.isEncryptionInitialized();
  }
}
