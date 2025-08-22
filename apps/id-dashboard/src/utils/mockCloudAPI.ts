// Mock Cloud API for testing cloud sync functionality
// In production, this would be replaced with actual API calls

interface MockCloudSyncUpdate {
  type: 'nickname' | 'profile-picture' | 'custodian' | 'recovery-key' | 'device' | 'privacy';
  identityId: string;
  publicKey: string;
  data: any;
  updatedByDeviceId: string;
  updatedAt: string;
  signature?: string;
}

interface MockNicknameUpdate {
  identityId: string;
  publicKey: string;
  oldNickname: string;
  newNickname: string;
  updatedByDeviceId: string;
  updatedAt: string;
  signature?: string;
}

class MockCloudAPI {
  private static instance: MockCloudAPI;
  private updates: Map<string, MockCloudSyncUpdate[]> = new Map();
  private isHealthy = true;

  static getInstance(): MockCloudAPI {
    if (!MockCloudAPI.instance) {
      MockCloudAPI.instance = new MockCloudAPI();
    }
    return MockCloudAPI.instance;
  }

  // Simulate API health check
  async healthCheck(): Promise<{ success: boolean; error?: string }> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));
    
    if (!this.isHealthy) {
      return { success: false, error: 'Service unavailable' };
    }
    
    return { success: true };
  }

  // Store any type of update
  async storeUpdate(update: MockCloudSyncUpdate): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 200));
    
    if (!this.isHealthy) {
      throw new Error('Service unavailable');
    }

    const identityUpdates = this.updates.get(update.identityId) || [];
    identityUpdates.push(update);
    this.updates.set(update.identityId, identityUpdates);
    
    // Silently handle mock cloud API operations in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }

  // Store nickname update (backward compatibility)
  async storeNicknameUpdate(update: MockNicknameUpdate): Promise<void> {
    const cloudUpdate: MockCloudSyncUpdate = {
      type: 'nickname',
      identityId: update.identityId,
      publicKey: update.publicKey,
      data: {
        oldNickname: update.oldNickname,
        newNickname: update.newNickname
      },
      updatedByDeviceId: update.updatedByDeviceId,
      updatedAt: update.updatedAt,
      signature: update.signature
    };
    
    await this.storeUpdate(cloudUpdate);
  }

  // Retrieve all updates for an identity
  async getUpdates(identityId: string): Promise<MockCloudSyncUpdate[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 100));
    
    if (!this.isHealthy) {
      throw new Error('Service unavailable');
    }

    const updates = this.updates.get(identityId) || [];
    // Silently handle mock cloud API operations in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
    return updates;
  }

  // Retrieve nickname updates for an identity (backward compatibility)
  async getNicknameUpdates(identityId: string): Promise<MockNicknameUpdate[]> {
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

  // Get all stored updates (for debugging)
  getAllUpdates(): Map<string, MockCloudSyncUpdate[]> {
    return new Map(this.updates);
  }

  // Clear all data (for testing)
  clearAllData(): void {
    this.updates.clear();
    // Silently handle mock cloud API operations in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }

  // Simulate service outage
  setHealthStatus(healthy: boolean): void {
    this.isHealthy = healthy;
    // Silently handle mock cloud API operations in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
  }

  // Get service status
  getStatus(): { isHealthy: boolean; totalUpdates: number } {
    let totalUpdates = 0;
    for (const updates of this.updates.values()) {
      totalUpdates += updates.length;
    }
    
    return {
      isHealthy: this.isHealthy,
      totalUpdates
    };
  }
}

export const mockCloudAPI = MockCloudAPI.getInstance();
