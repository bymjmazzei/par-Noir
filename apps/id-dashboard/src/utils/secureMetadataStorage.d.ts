import { SecureMetadata, MetadataContent } from './secureMetadata';
export declare class SecureMetadataStorage {
    private static readonly STORAGE_KEY;
    private static readonly PENDING_SYNC_KEY;
    static storeMetadata(identityId: string, secureMetadata: SecureMetadata): Promise<void>;
    static getMetadata(identityId: string): Promise<SecureMetadata | null>;
    static storeMetadataInCloud(identityId: string, secureMetadata: SecureMetadata): Promise<void>;
    static getMetadataFromCloud(identityId: string): Promise<SecureMetadata | null>;
    static updateMetadata(identityId: string, secureMetadata: SecureMetadata): Promise<void>;
    static updateMetadataField(identityId: string, pnName: string, passcode: string, field: keyof MetadataContent, value: any): Promise<void>;
    static applyMetadataToIdentity(identityData: any, pnName: string, passcode: string): Promise<any>;
    static getPendingSync(): Record<string, {
        metadata: SecureMetadata;
        timestamp: string;
        synced: boolean;
    }>;
    static syncPendingToCloud(): Promise<{
        synced: number;
        failed: number;
    }>;
    static syncMetadataFromCloud(identityId: string): Promise<void>;
    private static getStoredMetadata;
    static clearMetadata(identityId: string): Promise<void>;
    static syncFromOtherDevices(identityId: string): Promise<boolean>;
    static verifyMetadataIntegrity(identityId: string, pnName: string, passcode: string): Promise<boolean>;
}
