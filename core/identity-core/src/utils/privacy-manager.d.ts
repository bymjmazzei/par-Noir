import { DID } from '../types';
export interface PrivacySettings {
    shareDisplayName: boolean;
    shareEmail: boolean;
    sharePreferences: boolean;
    shareCustomFields: boolean;
    allowToolAccess: boolean;
    requireExplicitConsent: boolean;
    auditLogging: boolean;
}
export interface ToolAccessRequest {
    toolId: string;
    toolName: string;
    toolDescription: string;
    requestedData: string[];
    permissions: string[];
    expiresAt?: string;
    requireZKProof?: boolean;
}
export interface ToolAccessResponse {
    granted: boolean;
    accessToken?: string;
    encryptedData?: any;
    auditLog?: any;
    message?: string;
}
export interface AuditLogEntry {
    timestamp: string;
    toolId: string;
    action: string;
    dataRequested: string[];
    dataShared: string[];
    userConsent: boolean;
    ipAddress?: string;
    userAgent?: string;
}
export interface GlobalPrivacySettings {
    allowAnalytics: boolean;
    allowMarketing: boolean;
    allowThirdPartySharing: boolean;
    dataRetentionDays: number;
    dataPoints: {
        [dataPointKey: string]: {
            label: string;
            description: string;
            category: 'identity' | 'preferences' | 'content' | 'analytics';
            requestedBy: string[];
            globalSetting: boolean;
            lastUpdated: string;
        };
    };
}
export declare class PrivacyManager {
    private auditLog;
    private defaultPrivacySettings;
    processToolAccessRequest(did: DID, request: ToolAccessRequest): Promise<ToolAccessResponse>;
    private validateToolRequest;
    private detectSuspiciousToolId;
    private validateDataPointRequests;
    private registerDataPoints;
    private generateLabel;
    private categorizeDataPoint;
    private getPrivacySettings;
    updatePrivacySettings(did: DID, settings: GlobalPrivacySettings): void;
    private filterAllowedData;
    private generateAccessToken;
    private encryptSharedData;
    private createDeniedResponse;
    private handleExistingAccess;
    private logAuditEntry;
    revokeToolAccess(did: DID, toolId: string): void;
    hasToolAccess(did: DID, toolId: string): boolean;
    getAuditLog(didId: string): AuditLogEntry[];
    logSecurityEvent(securityEvent: any): void;
}
//# sourceMappingURL=privacy-manager.d.ts.map