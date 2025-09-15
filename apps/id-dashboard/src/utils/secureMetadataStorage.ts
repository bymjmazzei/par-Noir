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
   * Store metadata in cloud for cross-platform sync via OrbitDB (mutable IPFS)
   */
  static async storeMetadataInCloud(identityId: string, secureMetadata: SecureMetadata): Promise<void> {
    try {
      // Import OrbitDB service dynamically to avoid circular dependencies
      const { OrbitDBService } = await import('./orbitDBService');
      
      // Create OrbitDB service instance
      const orbitDBService = new OrbitDBService();
      await orbitDBService.initialize();
      
      // Create metadata object for OrbitDB (mutable storage)
      const metadataObject = {
        pnId: identityId,
        identityId: identityId,
        encryptedMetadata: secureMetadata,
        timestamp: new Date().toISOString(),
        version: Date.now()
      };

      // Store in OrbitDB (handles mutability automatically)
      const result = await orbitDBService.storePNMetadata(metadataObject);
      
      if (result.success) {
        // Store sync status locally (no CID tracking needed with OrbitDB)
        const cloudData = this.getCloudMetadata();
        cloudData[identityId] = {
          ...secureMetadata,
          lastSynced: new Date().toISOString(),
          orbitDBAddress: result.cid // OrbitDB address, not IPFS CID
        };
        localStorage.setItem(this.CLOUD_SYNC_KEY, JSON.stringify(cloudData));
      } else {
        throw new Error(result.error || 'OrbitDB storage failed');
      }
    } catch (error) {
      // Don't throw - cloud storage is optional, but log for debugging
      // OrbitDB metadata sync failed - error handled gracefully
    }
  }

  /**
   * Retrieve metadata from cloud (OrbitDB - mutable IPFS)
   */
  static async getMetadataFromCloud(identityId: string): Promise<SecureMetadata | null> {
    try {
      // Import OrbitDB service dynamically
      const { OrbitDBService } = await import('./orbitDBService');
      
      // Create OrbitDB service instance
      const orbitDBService = new OrbitDBService();
      await orbitDBService.initialize();
      
      // Get latest metadata from OrbitDB (always returns latest version)
      const result = await orbitDBService.getPNMetadata(identityId);
      
      if (result.success && result.data) {
        // Update local cache with latest data
        const cloudData = this.getCloudMetadata();
        cloudData[identityId] = {
          ...result.data.encryptedMetadata,
          lastSynced: new Date().toISOString(),
          orbitDBAddress: result.cid
        };
        localStorage.setItem(this.CLOUD_SYNC_KEY, JSON.stringify(cloudData));
        return result.data.encryptedMetadata;
      }
      
      // Fallback to cached data if OrbitDB fetch fails
      const cloudData = this.getCloudMetadata();
      const cachedMetadata = cloudData[identityId];
      return cachedMetadata || null;
    } catch (error) {
      // Failed to get metadata from OrbitDB, using cached data
      // Fallback to cached data
      const cloudData = this.getCloudMetadata();
      const cachedMetadata = cloudData[identityId];
      return cachedMetadata || null;
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
      
      // No CID tracking needed with OrbitDB
      
    } catch (error) {
      // Silently handle clear errors
    }
  }

  // CID tracking methods removed - OrbitDB handles mutability automatically

  /**
   * Sync metadata from another device using OrbitDB
   * OrbitDB handles mutability automatically - always returns latest version
   */
  static async syncFromOtherDevices(identityId: string): Promise<boolean> {
    try {
      const { OrbitDBService } = await import('./orbitDBService');
      
      // Get current local metadata
      const localMetadata = await this.getMetadata(identityId);
      if (!localMetadata) {
        return false;
      }

      // Create OrbitDB service instance
      const orbitDBService = new OrbitDBService();
      await orbitDBService.initialize();

      // Get latest metadata from OrbitDB (always returns latest version)
      const result = await orbitDBService.getPNMetadata(identityId);
      if (!result.success || !result.data) {
        return false;
      }

      // Check if the OrbitDB version is newer than local
      const localTimestamp = localMetadata.timestamp || '0';
      const orbitDBTimestamp = result.data.timestamp || '0';
      
      if (new Date(orbitDBTimestamp) > new Date(localTimestamp)) {
        // OrbitDB version is newer, update local storage
        await this.storeMetadata(identityId, result.data.encryptedMetadata);
        // Synced newer metadata from OrbitDB
        return true;
      }

      return false;
    } catch (error) {
      // Failed to sync from other devices - error handled gracefully
      return false;
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
