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
  signature?: string; // Cryptographic signature for verification
}

export interface NicknameUpdate {
  identityId: string;
  publicKey: string;
  oldNickname: string;
  newNickname: string;
  updatedByDeviceId: string;
  updatedAt: string;
  signature?: string; // Cryptographic signature for verification
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
      apiEndpoint: 'https://api.identityprotocol.com/sync', // Replace with actual endpoint
      syncInterval: 30000, // 30 seconds
      ...config
    };
  }

  static getInstance(): CloudSyncManager {
    if (!CloudSyncManager.instance) {
      CloudSyncManager.instance = new CloudSyncManager();
    }
    return CloudSyncManager.instance;
  }

  /**
   * Initialize cloud sync connection
   */
  async initialize(): Promise<void> {
    try {
      // Initialize cloud sync connection
      
      // Test connection to cloud service
      const response = await this.testConnection();
      if (response) {
        this.isConnected = true;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('Cloud sync initialized successfully');
        }
        
        // Start periodic sync
        this.startPeriodicSync();
        
        // Process any queued updates
        await this.processSyncQueue();
      } else {
        throw new Error('Failed to connect to cloud sync service');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to initialize cloud sync:', error);
      }
      this.isConnected = false;
    }
  }

  /**
   * Test connection to cloud service
   */
  private async testConnection(): Promise<CloudSyncResponse> {
    try {
      // Use Orbit Cloud API
      const { orbitCloudAPI } = await import('./orbitCloudAPI');
      const result = await orbitCloudAPI.healthCheck();
      
      if (result) {
        return { success: true };
      } else {
        return { success: false, error: 'Connection failed' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Store any type of update in cloud database
   */
  async storeUpdate(update: Omit<CloudSyncUpdate, 'updatedAt'>): Promise<void> {
    const fullUpdate: CloudSyncUpdate = {
      ...update,
      updatedAt: new Date().toISOString()
    };

    if (this.isConnected) {
      await this.sendToCloud(fullUpdate);
    } else {
      // Queue for later sync
      this.syncQueue.push(fullUpdate);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Update queued for later sync');
      }
    }
  }

  /**
   * Store nickname update in cloud database (backward compatibility)
   */
  async storeNicknameUpdate(update: Omit<NicknameUpdate, 'updatedAt'>): Promise<void> {
    const cloudUpdate: Omit<CloudSyncUpdate, 'updatedAt'> = {
      type: 'nickname',
      identityId: update.identityId,
      publicKey: update.publicKey,
      data: {
        oldNickname: update.oldNickname,
        newNickname: update.newNickname
      },
      updatedByDeviceId: update.updatedByDeviceId,
      signature: update.signature
    };
    
    await this.storeUpdate(cloudUpdate);
  }

  /**
   * Retrieve all updates for an identity
   */
  async getUpdates(identityId: string): Promise<CloudSyncUpdate[]> {
    try {
      // Use Orbit Cloud API
      const { orbitCloudAPI } = await import('./orbitCloudAPI');
      const updates = await orbitCloudAPI.getUpdates(identityId);
      return updates;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to retrieve updates:', error);
      }
      return [];
    }
  }

  /**
   * Retrieve nickname updates for an identity (backward compatibility)
   */
  async getNicknameUpdates(identityId: string): Promise<NicknameUpdate[]> {
    try {
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
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to retrieve nickname updates:', error);
      }
      return [];
    }
  }

  /**
   * Send update to cloud
   */
  private async sendToCloud(update: CloudSyncUpdate): Promise<void> {
    try {
      // Use Orbit Cloud API
      const { orbitCloudAPI } = await import('./orbitCloudAPI');
      await orbitCloudAPI.storeUpdate(update);

      if (process.env.NODE_ENV === 'development') {
        console.log('Update stored successfully');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to store update:', error);
      }
      // Queue for retry
      this.syncQueue.push(update);
    }
  }

  /**
   * Process queued sync updates
   */
  private async processSyncQueue(): Promise<void> {
    if (this.syncQueue.length === 0) return;

    if (process.env.NODE_ENV === 'development') {
      console.log(`Processing ${updates.length} queued updates`);
    }

    const updates = [...this.syncQueue];
    this.syncQueue = [];

    for (const update of updates) {
      try {
        await this.sendToCloud(update);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to process queued update:', error);
        }
        // Re-queue failed updates
        this.syncQueue.push(update);
      }
    }
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = window.setInterval(() => {
              this.processSyncQueue().catch(() => {
        // Silently handle periodic sync errors in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
      });
    }, this.config.syncInterval);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.syncQueue.length;
  }

  /**
   * Disconnect from cloud service
   */
  disconnect(): void {
    this.isConnected = false;
    this.stopPeriodicSync();
    // Silently handle cloud sync disconnection in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }
}

// Export singleton instance
export const cloudSyncManager = CloudSyncManager.getInstance();
