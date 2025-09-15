import { Identity } from '../types';
export interface SyncMetadata {
    version: string;
    timestamp: string;
    deviceId: string;
    encryptionMethod: string;
}
export interface SyncResult {
    success: boolean;
    cid?: string;
    error?: string;
    timestamp: string;
}
export declare class IdentitySync {
    private deviceId;
    private encryptionKey;
    private rateLimiter;
    private auditLog;
    constructor(deviceId?: string);
    initializeEncryption(password: string, salt?: Uint8Array): Promise<void>;
    syncToAllDevices(identity: Identity): Promise<SyncResult>;
    syncFromCloud(did: string): Promise<Identity | null>;
    private encryptIdentity;
    private decryptIdentity;
    private uploadToIPFS;
    private uploadToGateway;
    private downloadFromIPFS;
    private updateDidDocument;
    private resolveDidDocument;
    private storeSecurely;
    private encryptForStorage;
    private getFromSecureStorage;
    private decryptFromStorage;
    private getFromSecure;
    private notifyOtherDevices;
    private checkRateLimit;
    private logSecurityEvent;
    private sendToAuditLog;
    private generateDeviceId;
    getDeviceId(): string;
    isEncryptionInitialized(): boolean;
    getAuditLog(): Array<{
        timestamp: string;
        event: string;
        details: any;
    }>;
    clearAuditLog(): void;
}
//# sourceMappingURL=IdentitySync.d.ts.map