import { SecureMetadata, MetadataContent } from './secureMetadata';
export declare class SecureMetadataStorage {
    private static readonly STORAGE_KEY;
    private static readonly CLOUD_SYNC_KEY;
    private static readonly PENDING_SYNC_KEY;
    /**
     * Store encrypted metadata locally
     */
    static storeMetadata(identityId: string, secureMetadata: SecureMetadata): Promise<void>;
    /**
     * Retrieve encrypted metadata locally
     */
    static getMetadata(identityId: string): Promise<SecureMetadata | null>;
    /**
     * Store metadata in cloud for cross-platform sync
     */
    static storeMetadataInCloud(identityId: string, secureMetadata: SecureMetadata): Promise<void>;
    /**
     * Retrieve metadata from cloud
     */
    static getMetadataFromCloud(identityId: string): Promise<SecureMetadata | null>;
    /**
     * Update metadata field securely with offline-first support
     */
    static updateMetadataField(identityId: string, pnName: string, passcode: string, field: keyof MetadataContent, value: any): Promise<void>;
    /**
     * Decrypt and apply metadata to identity
     */
    static applyMetadataToIdentity(identityData: any, pnName: string, passcode: string): Promise<any>;
    /**
     * Mark metadata for cloud sync (offline-first)
     */
    private static markForCloudSync;
    /**
     * Get all pending sync items
     */
    static getPendingSync(): Record<string, {
        metadata: SecureMetadata;
        timestamp: string;
        synced: boolean;
    }>;
    /**
     * Sync all pending metadata to cloud (call when online)
     */
    static syncPendingToCloud(): Promise<{
        synced: number;
        failed: number;
    }>;
    /**
     * Sync metadata from cloud to local
     */
    static syncMetadataFromCloud(identityId: string): Promise<void>;
    /**
     * Get all stored metadata
     */
    private static getStoredMetadata;
    /**
     * Get all cloud metadata
     */
    private static getCloudMetadata;
    /**
     * Clear all metadata for an identity
     */
    static clearMetadata(identityId: string): Promise<void>;
    /**
     * Verify metadata integrity
     */
    static verifyMetadataIntegrity(identityId: string, pnName: string, passcode: string): Promise<boolean>;
}
