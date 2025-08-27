export interface IdentityDocument {
    "@context": "https://identity-protocol.com/v1";
    id: string;
    createdAt: string;
    updatedAt: string;
    status: "active" | "inactive" | "recovering";
    metadata: IdentityMetadata;
    custodians: RecoveryCustodian[];
    recoveryConfig: RecoveryConfig;
    deviceSync: DeviceSyncInfo;
    qrCodeData: QRCodeMetadata;
    deepLinkHandling: DeepLinkMetadata;
}
export interface IdentityMetadata {
    displayName?: string;
    username: string;
    email?: string;
    phone?: string;
    nickname?: string;
    avatar?: string;
    preferences: IdentityPreferences;
    customFields?: Record<string, any>;
}
export interface IdentityPreferences {
    privacy: "high" | "medium" | "low";
    sharing: "open" | "selective" | "closed";
    notifications: boolean;
    backup: boolean;
    recoveryThreshold: number;
    maxCustodians: number;
}
export interface RecoveryCustodian {
    id: string;
    name: string;
    type: "person" | "service" | "self";
    status: "active" | "pending" | "inactive";
    contactType: "email" | "phone";
    contactValue: string;
    publicKey: string;
    metadata: CustodianMetadata;
    addedAt: string;
    lastVerified?: string;
    canApprove: boolean;
    trustLevel: "high" | "medium" | "low";
}
export interface CustodianMetadata {
    deviceId?: string;
    deviceName?: string;
    location?: string;
    lastSeen?: string;
    verificationMethod: "qr-code" | "deep-link" | "manual";
    invitationExpiresAt?: string;
}
export interface RecoveryConfig {
    threshold: number;
    totalCustodians: number;
    recoveryKey: string;
    createdAt: string;
    updatedAt: string;
    isReady: boolean;
}
export interface QRCodeData {
    type: "custodian-invitation" | "device-sync" | "recovery-request";
    version: "1.0";
    timestamp: string;
    expiresAt: string;
    data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
    signature?: string;
}
export interface QRCodeMetadata {
    type: "custodian-invitation" | "device-sync" | "recovery-request";
    version: "1.0";
    timestamp: string;
    expiresAt: string;
    data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
    signature?: string;
}
export interface CustodianInvitationData {
    invitationId: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    custodianName: string;
    custodianType: "person" | "service" | "self";
    contactType: "email" | "phone";
    contactValue: string;
    deepLinkUrl: string;
    qrCodeDataURL: string;
}
export interface DeviceSyncData {
    deviceId: string;
    deviceName: string;
    deviceType: "mobile" | "desktop" | "tablet" | "other";
    syncKey: string;
    identityId: string;
    deviceFingerprint: string;
    expiresAt: string;
    qrCodeDataURL: string;
}
export interface RecoveryRequest {
    id: string;
    requestingDid: string;
    requestingUser: string;
    timestamp: string;
    status: "pending" | "approved" | "denied" | "expired";
    approvals: string[];
    denials: string[];
    claimantContactType?: "email" | "phone";
    claimantContactValue?: string;
    expiresAt: string;
    requiredApprovals: number;
    currentApprovals: number;
}
export interface RecoveryRequestData {
    id: string;
    requestingDid: string;
    requestingUser: string;
    timestamp: string;
    status: "pending" | "approved" | "denied" | "expired";
    approvals: string[];
    denials: string[];
    claimantContactType?: "email" | "phone";
    claimantContactValue?: string;
    expiresAt: string;
    requiredApprovals: number;
    currentApprovals: number;
}
export interface RecoveryKey {
    id: string;
    identityId: string;
    keyData: string;
    createdAt: string;
    lastUsed?: string;
    purpose: "personal" | "legal" | "insurance" | "will";
    description?: string;
    isActive: boolean;
    assignedToCustodian?: string;
}
export interface SyncedDevice {
    id: string;
    name: string;
    type: "mobile" | "desktop" | "tablet" | "other";
    lastSync: string;
    status: "active" | "inactive";
    location?: string;
    ipAddress?: string;
    isPrimary: boolean;
    deviceFingerprint: string;
    syncKey: string;
    pairedAt: string;
    lastSeen: string;
}
export interface DeviceSyncInfo {
    identityId: string;
    devices: SyncedDevice[];
    syncSettings: DeviceSyncSettings;
    lastSyncTimestamp: string;
}
export interface DeviceSyncSettings {
    autoSync: boolean;
    syncInterval: number;
    encryptInTransit: boolean;
    allowCrossDeviceAuth: boolean;
    maxDevices: number;
}
export interface DeepLinkData {
    protocol: "identity-protocol";
    action: "custodian-invitation" | "device-sync" | "recovery-request";
    data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
    signature?: string;
    expiresAt: string;
}
export interface DeepLinkMetadata {
    protocol: "identity-protocol";
    action: "custodian-invitation" | "device-sync" | "recovery-request";
    data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
    signature?: string;
    expiresAt: string;
}
export interface PrivacySharingSettings {
    identityId: string;
    thirdParties: {
        [partyId: string]: ThirdPartyAccess;
    };
    globalSettings: GlobalPrivacySettings;
}
export interface ThirdPartyAccess {
    name: string;
    permissions: string[];
    dataShared: string[];
    lastAccess: string;
    expiresAt?: string;
    isActive: boolean;
}
export interface GlobalPrivacySettings {
    allowAnalytics: boolean;
    allowMarketing: boolean;
    allowThirdPartySharing: boolean;
    dataRetentionDays: number;
    encryptMetadata: boolean;
    requireConsent: boolean;
}
export interface ValidationError {
    field: string;
    message: string;
    code: string;
    suggestion?: string;
}
export interface ProcessingError {
    type: "validation" | "serialization" | "network" | "crypto";
    message: string;
    details?: any;
    recoverable: boolean;
}
export declare const validateIdentityDocument: (doc: any) => boolean;
export declare const validateCustodianInvitation: (invitation: any) => boolean;
export declare const validateQRCodeData: (data: any) => boolean;
export declare const serializeForIPFS: (data: any) => string;
export declare const deserializeFromIPFS: (data: string) => any;
export declare const createIPFSCID: (data: any) => Promise<string>;
export interface ProtocolVersion {
    major: number;
    minor: number;
    patch: number;
    deprecated: boolean;
    migrationPath?: string;
}
export declare const migrateV1_0_to_V1_1: (oldData: any) => IdentityDocument;
export declare const needsMigration: (currentVersion: string, targetVersion: string) => boolean;
export declare const generateTimestamp: () => string;
export declare const generateExpirationTime: (hours?: number) => string;
export declare const isExpired: (timestamp: string) => boolean;
export declare const generateUniqueId: () => string;
export declare const validateEmail: (email: string) => boolean;
export declare const validatePhone: (phone: string) => boolean;
export declare const isIdentityDocument: (obj: any) => obj is IdentityDocument;
export declare const isRecoveryCustodian: (obj: any) => obj is RecoveryCustodian;
export declare const isQRCodeData: (obj: any) => obj is QRCodeData;
export declare const PROTOCOL_VERSION = "1.0.0";
export declare const CONTEXT_URL = "https://identity-protocol.com/v1";
export declare const MAX_CUSTODIANS = 5;
export declare const MIN_CUSTODIANS = 2;
export declare const DEFAULT_RECOVERY_THRESHOLD = 2;
export declare const QR_CODE_EXPIRATION_HOURS = 24;
export declare const DEVICE_SYNC_EXPIRATION_HOURS = 1;
export declare const VALID_DEVICE_TYPES: readonly ["mobile", "desktop", "tablet", "other"];
export declare const VALID_CUSTODIAN_TYPES: readonly ["person", "service", "self"];
export declare const VALID_CONTACT_TYPES: readonly ["email", "phone"];
export declare const VALID_PRIVACY_LEVELS: readonly ["high", "medium", "low"];
export declare const VALID_SHARING_LEVELS: readonly ["open", "selective", "closed"];
export declare const ERROR_CODES: {
    readonly INVALID_IDENTITY_DOCUMENT: "INVALID_IDENTITY_DOCUMENT";
    readonly INVALID_CUSTODIAN_DATA: "INVALID_CUSTODIAN_DATA";
    readonly INVALID_QR_CODE_DATA: "INVALID_QR_CODE_DATA";
    readonly EXPIRED_DATA: "EXPIRED_DATA";
    readonly INVALID_SIGNATURE: "INVALID_SIGNATURE";
    readonly INSUFFICIENT_CUSTODIANS: "INSUFFICIENT_CUSTODIANS";
    readonly TOO_MANY_CUSTODIANS: "TOO_MANY_CUSTODIANS";
    readonly INVALID_CONTACT_INFO: "INVALID_CONTACT_INFO";
    readonly INVALID_DEVICE_TYPE: "INVALID_DEVICE_TYPE";
    readonly SERIALIZATION_ERROR: "SERIALIZATION_ERROR";
    readonly DESERIALIZATION_ERROR: "DESERIALIZATION_ERROR";
    readonly MIGRATION_ERROR: "MIGRATION_ERROR";
    readonly VERSION_MISMATCH: "VERSION_MISMATCH";
};
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
//# sourceMappingURL=metadata-standards.d.ts.map