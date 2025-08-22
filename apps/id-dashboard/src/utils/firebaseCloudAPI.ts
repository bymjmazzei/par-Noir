import { firebaseInstance } from '../config/firebase';

export interface FirebaseCloudUpdate {
  type: 'nickname' | 'profile-picture' | 'custodian' | 'recovery-key' | 'device' | 'privacy';
  identityId: string;
  publicKey: string;
  data: any;
  updatedByDeviceId: string;
  updatedAt: string;
  signature?: string;
}

export class FirebaseCloudAPI {
  private static instance: FirebaseCloudAPI;
  // private isHealthy = true;

  static getInstance(): FirebaseCloudAPI {
    if (!FirebaseCloudAPI.instance) {
      FirebaseCloudAPI.instance = new FirebaseCloudAPI();
    }
    return FirebaseCloudAPI.instance;
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simulate health check
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } catch (error) {
      // Handle health check error silently
      return false;
    }
  }

  async storeUpdate(update: FirebaseCloudUpdate): Promise<void> {
    await firebaseInstance.storeUpdate(update);
  }

  async getUpdates(identityId: string): Promise<FirebaseCloudUpdate[]> {
    try {
      const updates = await firebaseInstance.getUpdates(identityId);
      
      return updates;
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
    const firebaseUpdate: FirebaseCloudUpdate = {
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

    await this.storeUpdate(firebaseUpdate);
  }
}

export const firebaseCloudAPI = FirebaseCloudAPI.getInstance();
