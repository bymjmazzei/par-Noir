/**
 * Identity Protocol Metadata Standards
 * 
 * This file defines the TypeScript interfaces and utilities for the
 * Identity Protocol's metadata standards, focusing on mobile-first,
 * decentralized identity management with custodian-based recovery.
 */

// ============================================================================
// 1. CORE IDENTITY DOCUMENT STANDARDS
// ============================================================================

export interface IdentityDocument {
  "@context": "https://identity-protocol.com/v1";
  id: string; // Unique identity identifier
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
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
  avatar?: string; // Base64 encoded image
  preferences: IdentityPreferences;
  customFields?: Record<string, any>;
}

export interface IdentityPreferences {
  privacy: "high" | "medium" | "low";
  sharing: "open" | "selective" | "closed";
  notifications: boolean;
  backup: boolean;
  recoveryThreshold: number; // 2-5 custodians required
  maxCustodians: number; // Maximum 5 custodians
}

// ============================================================================
// 2. CUSTODIAN SYSTEM STANDARDS
// ============================================================================

export interface RecoveryCustodian {
  id: string;
  name: string;
  type: "person" | "service" | "self";
  status: "active" | "pending" | "inactive";
  contactType: "email" | "phone";
  contactValue: string;
  publicKey: string; // Encrypted public key
  metadata: CustodianMetadata;
  addedAt: string; // ISO 8601 timestamp
  lastVerified?: string; // ISO 8601 timestamp
  canApprove: boolean;
  trustLevel: "high" | "medium" | "low";
}

export interface CustodianMetadata {
  deviceId?: string;
  deviceName?: string;
  location?: string;
  lastSeen?: string; // ISO 8601 timestamp
  verificationMethod: "qr-code" | "deep-link" | "manual";
  invitationExpiresAt?: string; // ISO 8601 timestamp
}

export interface RecoveryConfig {
  threshold: number; // Minimum custodians needed (2-5)
  totalCustodians: number; // Total custodians (max 5)
  recoveryKey: string; // Encrypted recovery key
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  isReady: boolean; // True when threshold met
}

// ============================================================================
// 3. QR CODE COMMUNICATION STANDARDS
// ============================================================================

export interface QRCodeData {
  type: "custodian-invitation" | "device-sync" | "recovery-request";
  version: "1.0";
  timestamp: string; // ISO 8601 timestamp
  expiresAt: string; // ISO 8601 timestamp
  data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
  signature?: string; // Cryptographic signature
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
  deepLinkUrl: string; // URL to open app
  qrCodeDataURL: string; // Base64 encoded QR image
}

export interface DeviceSyncData {
  deviceId: string;
  deviceName: string;
  deviceType: "mobile" | "desktop" | "tablet" | "other";
  syncKey: string; // Encrypted device sync key
  identityId: string;
  deviceFingerprint: string; // Unique device identifier
  expiresAt: string; // ISO 8601 timestamp
  qrCodeDataURL: string; // Base64 encoded QR image
}

// ============================================================================
// 4. RECOVERY SYSTEM STANDARDS
// ============================================================================

export interface RecoveryRequest {
  id: string;
  requestingDid: string;
  requestingUser: string;
  timestamp: string; // ISO 8601 timestamp
  status: "pending" | "approved" | "denied" | "expired";
  approvals: string[]; // Array of custodian IDs
  denials: string[]; // Array of custodian IDs
  claimantContactType?: "email" | "phone";
  claimantContactValue?: string;
  expiresAt: string; // ISO 8601 timestamp
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
  keyData: string; // Encrypted key data
  createdAt: string; // ISO 8601 timestamp
  lastUsed?: string; // ISO 8601 timestamp
  purpose: "personal" | "legal" | "insurance" | "will";
  description?: string;
  isActive: boolean;
  assignedToCustodian?: string; // Custodian ID
}

// ============================================================================
// 5. DEVICE MANAGEMENT STANDARDS
// ============================================================================

export interface SyncedDevice {
  id: string;
  name: string;
  type: "mobile" | "desktop" | "tablet" | "other";
  lastSync: string; // ISO 8601 timestamp
  status: "active" | "inactive";
  location?: string;
  ipAddress?: string;
  isPrimary: boolean; // Marks the primary device
  deviceFingerprint: string; // Unique device identifier
  syncKey: string; // Encrypted key for device-to-device sync
  pairedAt: string; // ISO 8601 timestamp
  lastSeen: string; // ISO 8601 timestamp
}

export interface DeviceSyncInfo {
  identityId: string;
  devices: SyncedDevice[];
  syncSettings: DeviceSyncSettings;
  lastSyncTimestamp: string; // ISO 8601 timestamp
}

export interface DeviceSyncSettings {
  autoSync: boolean;
  syncInterval: number; // minutes
  encryptInTransit: boolean;
  allowCrossDeviceAuth: boolean;
  maxDevices: number; // Maximum synced devices
}

// ============================================================================
// 6. DEEP LINK STANDARDS
// ============================================================================

export interface DeepLinkData {
  protocol: "identity-protocol";
  action: "custodian-invitation" | "device-sync" | "recovery-request";
  data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
  signature?: string; // Cryptographic signature
  expiresAt: string; // ISO 8601 timestamp
}

export interface DeepLinkMetadata {
  protocol: "identity-protocol";
  action: "custodian-invitation" | "device-sync" | "recovery-request";
  data: CustodianInvitationData | DeviceSyncData | RecoveryRequestData;
  signature?: string;
  expiresAt: string;
}

// ============================================================================
// 7. PRIVACY AND SECURITY STANDARDS
// ============================================================================

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
  lastAccess: string; // ISO 8601 timestamp
  expiresAt?: string; // ISO 8601 timestamp
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

// ============================================================================
// 8. VALIDATION AND SERIALIZATION
// ============================================================================

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

// Validation Functions
export const validateIdentityDocument = (doc: any): boolean => {
  return !!(
    doc.id && 
    doc.createdAt && 
    doc.metadata && 
    doc.custodians && 
    doc.recoveryConfig
  );
};

export const validateCustodianInvitation = (invitation: any): boolean => {
  return !!(
    invitation.invitationId && 
    invitation.identityId && 
    invitation.custodianName && 
    invitation.contactValue
  );
};

export const validateQRCodeData = (data: any): boolean => {
  return !!(
    data.type && 
    data.timestamp && 
    data.expiresAt && 
    data.data
  );
};

// Serialization Functions
export const serializeForIPFS = (data: any): string => {
  return JSON.stringify(data, null, 2);
};

export const deserializeFromIPFS = (data: string): any => {
  return JSON.parse(data);
};

export const createIPFSCID = async (data: any): Promise<string> => {
  const serialized = serializeForIPFS(data);
  // Implementation depends on IPFS client
  // For now, return a placeholder
  return "Qm" + btoa(serialized).substring(0, 44); // Example CID
};

// ============================================================================
// 9. VERSION CONTROL AND MIGRATION
// ============================================================================

export interface ProtocolVersion {
  major: number;
  minor: number;
  patch: number;
  deprecated: boolean;
  migrationPath?: string;
}

export const migrateV1_0_to_V1_1 = (oldData: any): IdentityDocument => {
  // Migration logic for v1.0 to v1.1
  return {
    ...oldData,
    "@context": "https://identity-protocol.com/v1",
    updatedAt: new Date().toISOString()
  };
};

export const needsMigration = (currentVersion: string, targetVersion: string): boolean => {
  const current = currentVersion.split('.').map(Number);
  const target = targetVersion.split('.').map(Number);
  
  return current[0] < target[0] || 
         (current[0] === target[0] && current[1] < target[1]) ||
         (current[0] === target[0] && current[1] === target[1] && current[2] < target[2]);
};

// ============================================================================
// 10. UTILITY FUNCTIONS
// ============================================================================

export const generateTimestamp = (): string => {
  return new Date().toISOString();
};

export const generateExpirationTime = (hours: number = 24): string => {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + hours);
  return expiration.toISOString();
};

export const isExpired = (timestamp: string): boolean => {
  return new Date(timestamp) < new Date();
};

export const generateUniqueId = (): string => {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
  return phoneRegex.test(phone);
};

// ============================================================================
// 11. TYPE GUARDS
// ============================================================================

export const isIdentityDocument = (obj: any): obj is IdentityDocument => {
  return obj && 
         typeof obj.id === 'string' &&
         typeof obj.createdAt === 'string' &&
         typeof obj.metadata === 'object';
};

export const isRecoveryCustodian = (obj: any): obj is RecoveryCustodian => {
  return obj && 
         typeof obj.id === 'string' &&
         typeof obj.name === 'string' &&
         typeof obj.type === 'string';
};

export const isQRCodeData = (obj: any): obj is QRCodeData => {
  return obj && 
         typeof obj.type === 'string' &&
         typeof obj.timestamp === 'string' &&
         typeof obj.data === 'object';
};

// ============================================================================
// 12. CONSTANTS
// ============================================================================

export const PROTOCOL_VERSION = "1.0.0";
export const CONTEXT_URL = "https://identity-protocol.com/v1";
export const MAX_CUSTODIANS = 5;
export const MIN_CUSTODIANS = 2;
export const DEFAULT_RECOVERY_THRESHOLD = 2;
export const QR_CODE_EXPIRATION_HOURS = 24;
export const DEVICE_SYNC_EXPIRATION_HOURS = 1;

export const VALID_DEVICE_TYPES = ["mobile", "desktop", "tablet", "other"] as const;
export const VALID_CUSTODIAN_TYPES = ["person", "service", "self"] as const;
export const VALID_CONTACT_TYPES = ["email", "phone"] as const;
export const VALID_PRIVACY_LEVELS = ["high", "medium", "low"] as const;
export const VALID_SHARING_LEVELS = ["open", "selective", "closed"] as const;

// ============================================================================
// 13. ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  INVALID_IDENTITY_DOCUMENT: "INVALID_IDENTITY_DOCUMENT",
  INVALID_CUSTODIAN_DATA: "INVALID_CUSTODIAN_DATA",
  INVALID_QR_CODE_DATA: "INVALID_QR_CODE_DATA",
  EXPIRED_DATA: "EXPIRED_DATA",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  INSUFFICIENT_CUSTODIANS: "INSUFFICIENT_CUSTODIANS",
  TOO_MANY_CUSTODIANS: "TOO_MANY_CUSTODIANS",
  INVALID_CONTACT_INFO: "INVALID_CONTACT_INFO",
  INVALID_DEVICE_TYPE: "INVALID_DEVICE_TYPE",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
  DESERIALIZATION_ERROR: "DESERIALIZATION_ERROR",
  MIGRATION_ERROR: "MIGRATION_ERROR",
  VERSION_MISMATCH: "VERSION_MISMATCH"
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]; 