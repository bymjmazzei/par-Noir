import { SecureMetadataCrypto, SecureMetadata, MetadataContent } from './secureMetadata';

export class SecureMetadataStorage {
  private static readonly STORAGE_KEY = 'secure_metadata';
  private static readonly CLOUD_SYNC_KEY = 'cloud_metadata_sync';
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

  /**
   * Store metadata in cloud for cross-platform sync
   */
  static async storeMetadataInCloud(identityId: string, secureMetadata: SecureMetadata): Promise<void> {
    try {
      const cloudData = this.getCloudMetadata();
      cloudData[identityId] = secureMetadata;
      localStorage.setItem(this.CLOUD_SYNC_KEY, JSON.stringify(cloudData));
    } catch (error) {
      // Don't throw - cloud storage is optional
    }
  }

  /**
   * Retrieve metadata from cloud
   */
  static async getMetadataFromCloud(identityId: string): Promise<SecureMetadata | null> {
    try {
      const cloudData = this.getCloudMetadata();
      return cloudData[identityId] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update entire metadata object
   */
  static async updateMetadata(identityId: string, secureMetadata: SecureMetadata): Promise<void> {
    try {
      // Store updated metadata locally (works offline)
      await this.storeMetadata(identityId, secureMetadata);
      
      // Check if we're online and sync immediately
      if (navigator.onLine) {
        try {
          await this.storeMetadataInCloud(identityId, secureMetadata);
        } catch (error) {
          this.markForCloudSync(identityId, secureMetadata);
        }
      } else {
        // Mark for cloud sync (will sync when online)
        this.markForCloudSync(identityId, secureMetadata);
      }
    } catch (error) {
      throw new Error('Failed to update metadata');
    }
  }

  /**
   * Update metadata field securely with offline-first support
   */
  static async updateMetadataField(
    identityId: string,
    pnName: string,
    passcode: string,
    field: keyof MetadataContent,
    value: any
  ): Promise<void> {
    try {
      // Get current metadata
      const currentMetadata = await this.getMetadata(identityId);
      
      if (currentMetadata) {
        // Update the field
        const updatedMetadata = await SecureMetadataCrypto.updateMetadataField(
          currentMetadata,
          pnName,
          passcode,
          field,
          value
        );
        
        // Store updated metadata locally (works offline)
        await this.storeMetadata(identityId, updatedMetadata);
        
        // Check if we're online and sync immediately
        if (navigator.onLine) {
          try {
            await this.storeMetadataInCloud(identityId, updatedMetadata);
          } catch (error) {
            this.markForCloudSync(identityId, updatedMetadata);
          }
        } else {
          // Mark for cloud sync (will sync when online)
          this.markForCloudSync(identityId, updatedMetadata);
        }
      } else {
        // Create new metadata
        const newMetadata = await SecureMetadataCrypto.createInitialMetadata(
          pnName,
          passcode,
          identityId,
          { [field]: value }
        );
        
        // Store locally (works offline)
        await this.storeMetadata(identityId, newMetadata);
        
        // Check if we're online and sync immediately
        if (navigator.onLine) {
          try {
            await this.storeMetadataInCloud(identityId, newMetadata);
          } catch (error) {
            this.markForCloudSync(identityId, newMetadata);
          }
        } else {
          // Mark for cloud sync (will sync when online)
          this.markForCloudSync(identityId, newMetadata);
        }
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
        // Try to decrypt metadata
        const decryptedMetadata = await SecureMetadataCrypto.decryptMetadata(
          metadata,
          pnName,
          passcode
        );
        
        // Apply metadata to identity
        const updatedIdentity = {
          ...identityData,
          ...decryptedMetadata
        };
        
        return updatedIdentity;
      }
      
      return identityData;
    } catch (error) {
      // Return original identity if metadata decryption fails
      return identityData;
    }
  }

  /**
   * Mark metadata for cloud sync (offline-first)
   */
  private static markForCloudSync(identityId: string, metadata: SecureMetadata): void {
    try {
      const pendingSync = this.getPendingSync();
      pendingSync[identityId] = {
        metadata,
        timestamp: new Date().toISOString(),
        synced: false
      };
      localStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(pendingSync));
    } catch (error) {
      // Silently handle storage errors
    }
  }

  /**
   * Get all pending sync items
   */
  static getPendingSync(): Record<string, { metadata: SecureMetadata; timestamp: string; synced: boolean }> {
    try {
      const stored = localStorage.getItem(this.PENDING_SYNC_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Sync all pending metadata to cloud (call when online)
   */
  static async syncPendingToCloud(): Promise<{ synced: number; failed: number }> {
    try {
      const pendingSync = this.getPendingSync();
      let synced = 0;
      let failed = 0;

      for (const [identityId, item] of Object.entries(pendingSync)) {
        if (!item.synced) {
          try {
            await this.storeMetadataInCloud(identityId, item.metadata);
            item.synced = true;
            synced++;
          } catch (error) {
            failed++;
          }
        }
      }

      // Update pending sync status
      localStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(pendingSync));

      return { synced, failed };
    } catch (error) {
      return { synced: 0, failed: 0 };
    }
  }

  /**
   * Sync metadata from cloud to local
   */
  static async syncMetadataFromCloud(identityId: string): Promise<void> {
    try {
      const cloudMetadata = await this.getMetadataFromCloud(identityId);
      if (cloudMetadata) {
        await this.storeMetadata(identityId, cloudMetadata);
      }
    } catch (error) {
      // Silently handle sync errors
    }
  }

  /**
   * Get all stored metadata
   */
  private static getStoredMetadata(): Record<string, SecureMetadata> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Get all cloud metadata
   */
  private static getCloudMetadata(): Record<string, SecureMetadata> {
    try {
      const stored = localStorage.getItem(this.CLOUD_SYNC_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Clear all metadata for an identity
   */
  static async clearMetadata(identityId: string): Promise<void> {
    try {
      const stored = this.getStoredMetadata();
      delete stored[identityId];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
      
      const cloudData = this.getCloudMetadata();
      delete cloudData[identityId];
      localStorage.setItem(this.CLOUD_SYNC_KEY, JSON.stringify(cloudData));
      
    } catch (error) {
      // Silently handle clear errors
    }
  }

  /**
   * Verify metadata integrity
   */
  static async verifyMetadataIntegrity(
    identityId: string,
    pnName: string,
    passcode: string
  ): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(identityId);
      if (!metadata) return true; // No metadata is valid
      
      return await SecureMetadataCrypto.verifyMetadata(metadata, pnName, passcode);
    } catch (error) {
      return false;
    }
  }
}
