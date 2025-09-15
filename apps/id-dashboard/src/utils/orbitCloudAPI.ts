import { orbitDBService } from './orbitDBService';

export interface OrbitCloudUpdate {
  type: 'nickname' | 'profile-picture' | 'custodian' | 'recovery-key' | 'device' | 'privacy' | 'license-transfer';
  identityId: string;
  publicKey: string;
  data: any;
  updatedByDeviceId: string;
  updatedAt: string;
  signature?: string;
}

export class OrbitCloudAPI {
  private static instance: OrbitCloudAPI;

  static getInstance(): OrbitCloudAPI {
    if (!OrbitCloudAPI.instance) {
      OrbitCloudAPI.instance = new OrbitCloudAPI();
    }
    return OrbitCloudAPI.instance;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await orbitDBService.healthCheck();
      return result.success;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      return false;
    }
  }

  async storeUpdate(update: OrbitCloudUpdate): Promise<void> {
    const orbitUpdate = {
      type: update.type,
      pnId: update.identityId,
      data: update.data,
      timestamp: update.updatedAt,
      signature: update.signature
    };
    
    const result = await orbitDBService.storeUpdate(orbitUpdate);
    if (!result.success) {
      throw new Error(`Failed to store update: ${result.error}`);
    }
  }

  async getUpdates(identityId: string): Promise<OrbitCloudUpdate[]> {
    try {
      const result = await orbitDBService.getUpdates(identityId);
      
      if (!result.success) {
        return [];
      }
      
      // Convert OrbitDB results to cloud format for compatibility
      return result.data.map((item: any) => ({
        type: item.type,
        identityId: item.pnId,
        publicKey: item.publicKey || '',
        data: item.data,
        updatedByDeviceId: item.updatedByDeviceId || '',
        updatedAt: item.timestamp,
        signature: item.signature
      }));
    } catch (error) {
      return [];
    }
  }

  async storeNicknameUpdate(update: {
    identityId: string;
    publicKey: string;
    oldNickname: string;
    newNickname: string;
    updatedByDeviceId: string;
    updatedAt: string;
    signature?: string;
  }): Promise<void> {
    const orbitUpdate = {
      type: 'nickname' as const,
      pnId: update.identityId,
      data: {
        oldNickname: update.oldNickname,
        newNickname: update.newNickname
      },
      timestamp: update.updatedAt,
      signature: update.signature
    };

    const result = await orbitDBService.storeUpdate(orbitUpdate);
    if (!result.success) {
      throw new Error(`Failed to store nickname update: ${result.error}`);
    }
  }
}

export const orbitCloudAPI = OrbitCloudAPI.getInstance();
