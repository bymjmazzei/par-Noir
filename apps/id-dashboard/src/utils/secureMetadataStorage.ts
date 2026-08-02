import { SecureMetadataCrypto, SecureMetadata, MetadataContent } from './secureMetadata';

/**
 * Local encrypted metadata storage.
 * OrbitDB / IPFS cloud sync was removed; Drive + API is the storage story.
 * Cloud-named methods remain as no-ops so call sites stay local-only.
 */
export class SecureMetadataStorage {
  private static readonly STORAGE_KEY = 'secure_metadata';
  private static readonly PENDING_SYNC_KEY = 'pending_metadata_sync';

  /**
   * Store encrypted metadata locally
   */
  static async storeMetadata(identityId: string, secureMetadata: SecureMetadata): Promise<void> {
    try {
      const stored = this.getStoredMetadata();
      stored[identityId] = secureMetadata;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
    } catch (error) {
      throw new Error('Failed to store metadata');
    }
  }

  /**
   * Retrieve encrypted metadata locally
   */
  static async getMetadata(identityId: string): Promise<SecureMetadata | null> {
    try {
      const stored = this.getStoredMetadata();
      return stored[identityId] || null;
    } catch (error) {
      return null;
    }
  }

  /** No remote cloud — local-only. */
  static async storeMetadataInCloud(_identityId: string, _secureMetadata: SecureMetadata): Promise<void> {
    return;
  }

  /** No remote cloud — returns local cache only. */
  static async getMetadataFromCloud(identityId: string): Promise<SecureMetadata | null> {
    return this.getMetadata(identityId);
  }

  /**
   * Update entire metadata object
   */
  static async updateMetadata(identityId: string, secureMetadata: SecureMetadata): Promise<void> {
    try {
      await this.storeMetadata(identityId, secureMetadata);
    } catch (error) {
      throw new Error('Failed to update metadata');
    }
  }

  /**
   * Update metadata field securely (local only)
   */
  static async updateMetadataField(
    identityId: string,
    pnName: string,
    passcode: string,
    field: keyof MetadataContent,
    value: any
  ): Promise<void> {
    try {
      const currentMetadata = await this.getMetadata(identityId);

      if (currentMetadata) {
        if (field === 'dataPoints' && process.env.NODE_ENV === 'development') {
          console.log('[SecureMetadataStorage] Updating dataPoints:', {
            valueType: typeof value,
            valueKeys: Object.keys(value || {}),
            attestedDataCount: (value as any)?.attestedData?.length || 0
          });
        }

        const updatedMetadata = await SecureMetadataCrypto.updateMetadataField(
          currentMetadata,
          pnName,
          passcode,
          field,
          value
        );

        await this.storeMetadata(identityId, updatedMetadata);
      } else {
        const newMetadata = await SecureMetadataCrypto.createInitialMetadata(
          pnName,
          passcode,
          identityId,
          { [field]: value }
        );

        await this.storeMetadata(identityId, newMetadata);
      }
    } catch (error) {
      throw new Error('Failed to update metadata');
    }
  }

  /**
   * Decrypt and apply metadata to identity
   */
  static async applyMetadataToIdentity(
    identityData: any,
    pnName: string,
    passcode: string
  ): Promise<any> {
    try {
      const identityId = identityData.id || identityData.publicKey;
      const metadata = await this.getMetadata(identityId);

      if (metadata) {
        const decryptedMetadata = await SecureMetadataCrypto.decryptMetadata(
          metadata,
          pnName,
          passcode
        );

        return {
          ...identityData,
          ...decryptedMetadata
        };
      }

      return identityData;
    } catch (error) {
      return identityData;
    }
  }

  static getPendingSync(): Record<string, { metadata: SecureMetadata; timestamp: string; synced: boolean }> {
    try {
      const stored = localStorage.getItem(this.PENDING_SYNC_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  }

  /** No remote cloud — clears pending markers as synced. */
  static async syncPendingToCloud(): Promise<{ synced: number; failed: number }> {
    try {
      const pendingSync = this.getPendingSync();
      const count = Object.keys(pendingSync).length;
      localStorage.removeItem(this.PENDING_SYNC_KEY);
      return { synced: count, failed: 0 };
    } catch (error) {
      return { synced: 0, failed: 0 };
    }
  }

  /** No remote cloud — local only. */
  static async syncMetadataFromCloud(_identityId: string): Promise<void> {
    return;
  }

  private static getStoredMetadata(): Record<string, SecureMetadata> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  }

  static async clearMetadata(identityId: string): Promise<void> {
    try {
      const stored = this.getStoredMetadata();
      delete stored[identityId];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
    } catch (error) {
      // Silently handle clear errors
    }
  }

  /** No remote peer sync. */
  static async syncFromOtherDevices(_identityId: string): Promise<boolean> {
    return false;
  }

  static async verifyMetadataIntegrity(
    identityId: string,
    pnName: string,
    passcode: string
  ): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(identityId);
      if (!metadata) return true;

      return await SecureMetadataCrypto.verifyMetadata(metadata, pnName, passcode);
    } catch (error) {
      return false;
    }
  }
}
