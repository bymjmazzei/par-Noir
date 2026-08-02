/**
 * Local-only sync queue stub.
 * OrbitDB / IPFS cloud sync was removed; Drive + API is the storage story.
 * Call sites may still queue updates; they are not persisted remotely.
 */

export interface CloudSyncConfig {
  apiEndpoint: string;
  apiKey?: string;
  syncInterval: number; // milliseconds
}

export interface CloudSyncUpdate {
  type: 'nickname' | 'profile-picture' | 'custodian' | 'recovery-key' | 'device' | 'privacy' | 'license-transfer';
  identityId: string;
  publicKey: string;
  data: any;
  updatedByDeviceId: string;
  updatedAt: string;
  signature?: string;
}

export interface NicknameUpdate {
  identityId: string;
  publicKey: string;
  oldNickname: string;
  newNickname: string;
  updatedByDeviceId: string;
  updatedAt: string;
  signature?: string;
}

export interface CloudSyncResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class CloudSyncManager {
  private static instance: CloudSyncManager;
  private config: CloudSyncConfig;
  private isConnected = false;
  private syncQueue: CloudSyncUpdate[] = [];
  private syncInterval: number | null = null;

  constructor(config: Partial<CloudSyncConfig> = {}) {
    this.config = {
      apiEndpoint: '',
      syncInterval: 30000,
      ...config
    };
  }

  static getInstance(): CloudSyncManager {
    if (!CloudSyncManager.instance) {
      CloudSyncManager.instance = new CloudSyncManager();
    }
    return CloudSyncManager.instance;
  }

  async initialize(): Promise<void> {
    this.isConnected = false;
    this.stopPeriodicSync();
  }

  async storeUpdate(update: Omit<CloudSyncUpdate, 'updatedAt'>): Promise<void> {
    // No remote sync — discarded intentionally (Drive/API owns shared state).
    void update;
  }

  async storeNicknameUpdate(update: Omit<NicknameUpdate, 'updatedAt'>): Promise<void> {
    await this.storeUpdate({
      type: 'nickname',
      identityId: update.identityId,
      publicKey: update.publicKey,
      data: {
        oldNickname: update.oldNickname,
        newNickname: update.newNickname
      },
      updatedByDeviceId: update.updatedByDeviceId,
      signature: update.signature
    });
  }

  async getUpdates(_identityId: string): Promise<CloudSyncUpdate[]> {
    return [];
  }

  async getNicknameUpdates(identityId: string): Promise<NicknameUpdate[]> {
    const updates = await this.getUpdates(identityId);
    return updates
      .filter(update => update.type === 'nickname')
      .map(update => ({
        identityId: update.identityId,
        publicKey: update.publicKey,
        oldNickname: update.data.oldNickname,
        newNickname: update.data.newNickname,
        updatedByDeviceId: update.updatedByDeviceId,
        updatedAt: update.updatedAt,
        signature: update.signature
      }));
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getQueueLength(): number {
    return this.syncQueue.length;
  }

  disconnect(): void {
    this.isConnected = false;
    this.stopPeriodicSync();
  }
}

export const cloudSyncManager = CloudSyncManager.getInstance();
