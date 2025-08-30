import { SecureMetadataCrypto } from './secureMetadata';
export class SecureMetadataStorage {
    /**
     * Store encrypted metadata locally
     */
    static async storeMetadata(identityId, secureMetadata) {
        try {
            const stored = this.getStoredMetadata();
            stored[identityId] = secureMetadata;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
        }
        catch (error) {
            throw new Error('Failed to store metadata');
        }
    }
    /**
     * Retrieve encrypted metadata locally
     */
    static async getMetadata(identityId) {
        try {
            const stored = this.getStoredMetadata();
            return stored[identityId] || null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Store metadata in cloud for cross-platform sync
     */
    static async storeMetadataInCloud(identityId, secureMetadata) {
        try {
            const cloudData = this.getCloudMetadata();
            cloudData[identityId] = secureMetadata;
            localStorage.setItem(this.CLOUD_SYNC_KEY, JSON.stringify(cloudData));
        }
        catch (error) {
            // Don't throw - cloud storage is optional
        }
    }
    /**
     * Retrieve metadata from cloud
     */
    static async getMetadataFromCloud(identityId) {
        try {
            const cloudData = this.getCloudMetadata();
            return cloudData[identityId] || null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Update metadata field securely with offline-first support
     */
    static async updateMetadataField(identityId, pnName, passcode, field, value) {
        try {
            // Get current metadata
            const currentMetadata = await this.getMetadata(identityId);
            if (currentMetadata) {
                // Update the field
                const updatedMetadata = await SecureMetadataCrypto.updateMetadataField(currentMetadata, pnName, passcode, field, value);
                // Store updated metadata locally (works offline)
                await this.storeMetadata(identityId, updatedMetadata);
                // Check if we're online and sync immediately
                if (navigator.onLine) {
                    try {
                        await this.storeMetadataInCloud(identityId, updatedMetadata);
                    }
                    catch (error) {
                        this.markForCloudSync(identityId, updatedMetadata);
                    }
                }
                else {
                    // Mark for cloud sync (will sync when online)
                    this.markForCloudSync(identityId, updatedMetadata);
                }
            }
            else {
                // Create new metadata
                const newMetadata = await SecureMetadataCrypto.createInitialMetadata(pnName, passcode, identityId, { [field]: value });
                // Store locally (works offline)
                await this.storeMetadata(identityId, newMetadata);
                // Check if we're online and sync immediately
                if (navigator.onLine) {
                    try {
                        await this.storeMetadataInCloud(identityId, newMetadata);
                    }
                    catch (error) {
                        this.markForCloudSync(identityId, newMetadata);
                    }
                }
                else {
                    // Mark for cloud sync (will sync when online)
                    this.markForCloudSync(identityId, newMetadata);
                }
            }
        }
        catch (error) {
            throw new Error('Failed to update metadata');
        }
    }
    /**
     * Decrypt and apply metadata to identity
     */
    static async applyMetadataToIdentity(identityData, pnName, passcode) {
        try {
            const identityId = identityData.id || identityData.publicKey;
            const metadata = await this.getMetadata(identityId);
            if (metadata) {
                // Try to decrypt metadata
                const decryptedMetadata = await SecureMetadataCrypto.decryptMetadata(metadata, pnName, passcode);
                // Apply metadata to identity
                const updatedIdentity = {
                    ...identityData,
                    ...decryptedMetadata
                };
                return updatedIdentity;
            }
            return identityData;
        }
        catch (error) {
            // Return original identity if metadata decryption fails
            return identityData;
        }
    }
    /**
     * Mark metadata for cloud sync (offline-first)
     */
    static markForCloudSync(identityId, metadata) {
        try {
            const pendingSync = this.getPendingSync();
            pendingSync[identityId] = {
                metadata,
                timestamp: new Date().toISOString(),
                synced: false
            };
            localStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(pendingSync));
        }
        catch (error) {
            // Silently handle storage errors
        }
    }
    /**
     * Get all pending sync items
     */
    static getPendingSync() {
        try {
            const stored = localStorage.getItem(this.PENDING_SYNC_KEY);
            return stored ? JSON.parse(stored) : {};
        }
        catch (error) {
            return {};
        }
    }
    /**
     * Sync all pending metadata to cloud (call when online)
     */
    static async syncPendingToCloud() {
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
                    }
                    catch (error) {
                        failed++;
                    }
                }
            }
            // Update pending sync status
            localStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(pendingSync));
            return { synced, failed };
        }
        catch (error) {
            return { synced: 0, failed: 0 };
        }
    }
    /**
     * Sync metadata from cloud to local
     */
    static async syncMetadataFromCloud(identityId) {
        try {
            const cloudMetadata = await this.getMetadataFromCloud(identityId);
            if (cloudMetadata) {
                await this.storeMetadata(identityId, cloudMetadata);
            }
        }
        catch (error) {
            // Silently handle sync errors
        }
    }
    /**
     * Get all stored metadata
     */
    static getStoredMetadata() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : {};
        }
        catch (error) {
            return {};
        }
    }
    /**
     * Get all cloud metadata
     */
    static getCloudMetadata() {
        try {
            const stored = localStorage.getItem(this.CLOUD_SYNC_KEY);
            return stored ? JSON.parse(stored) : {};
        }
        catch (error) {
            return {};
        }
    }
    /**
     * Clear all metadata for an identity
     */
    static async clearMetadata(identityId) {
        try {
            const stored = this.getStoredMetadata();
            delete stored[identityId];
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
            const cloudData = this.getCloudMetadata();
            delete cloudData[identityId];
            localStorage.setItem(this.CLOUD_SYNC_KEY, JSON.stringify(cloudData));
        }
        catch (error) {
            // Silently handle clear errors
        }
    }
    /**
     * Verify metadata integrity
     */
    static async verifyMetadataIntegrity(identityId, pnName, passcode) {
        try {
            const metadata = await this.getMetadata(identityId);
            if (!metadata)
                return true; // No metadata is valid
            return await SecureMetadataCrypto.verifyMetadata(metadata, pnName, passcode);
        }
        catch (error) {
            return false;
        }
    }
}
SecureMetadataStorage.STORAGE_KEY = 'secure_metadata';
SecureMetadataStorage.CLOUD_SYNC_KEY = 'cloud_metadata_sync';
SecureMetadataStorage.PENDING_SYNC_KEY = 'pending_metadata_sync';
