/**
 * Core types and interfaces for the Identity Protocol
 */

export interface DID {
  id: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive' | 'deleted';
  metadata: DIDMetadata;
  keys: DIDKeys;
  permissions: DIDPermissions;
}

export interface DIDMetadata {
  displayName?: string;
  email?: string;
  avatar?: string;
  preferences: DIDPreferences;
  customFields?: Record<string, any>;
  security?: {
    accountLockedUntil?: string;
    lastLoginAttempt?: string;
    failedAttempts?: number;
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
  };
  privacySettings?: {
    allowAnalytics: boolean;
    allowMarketing: boolean;
    allowThirdPartySharing: boolean;
    dataRetentionDays: number;
    dataPoints: Record<string, {
      label: string;
      description: string;
      category: 'identity' | 'preferences' | 'content' | 'analytics';
      requestedBy: string[];
      globalSetting: boolean;
      lastUpdated: string;
    }>;
  };
}

export interface DIDPreferences {
  privacy: 'high' | 'medium' | 'low';
  sharing: 'open' | 'selective' | 'closed';
  notifications: boolean;
  backup: boolean;
}

export interface DIDKeys {
  primary: string; // Encrypted private key
  recovery?: string; // Encrypted recovery key
  backup?: string; // Encrypted backup key
  publicKey: string; // Public key for verification
  privateKey?: string; // Private key for signing
}

export interface DIDPermissions {
  [toolId: string]: ToolPermission;
}

export interface ToolPermission {
  granted: boolean;
  grantedAt: string;
  expiresAt?: string;
  permissions: string[];
  accessToken?: string;
}

export interface CreateDIDOptions {
  username: string;
  passcode: string;
  displayName?: string;
  email?: string;
  preferences?: Partial<DIDPreferences>;
}

export interface AuthenticateOptions {
  username: string;
  passcode: string;
  biometric?: boolean;
}

export interface UpdateMetadataOptions {
  did: string;
  passcode: string;
  metadata: Partial<DIDMetadata>;
  toolId?: string;
}

export interface GrantToolAccessOptions {
  did: string;
  passcode: string;
  toolId: string;
  permissions: string[];
  expiresAt?: string;
}

export interface ChallengeResponse {
  challenge: string;
  expiresAt: string;
}

export interface SignatureVerification {
  did: string;
  challenge: string;
  signature: string;
  verified: boolean;
}

export interface IdentityCoreConfig {
  storageType: 'indexeddb' | 'localstorage' | 'memory';
  encryptionLevel: 'high' | 'medium' | 'low';
  backupEnabled: boolean;
  biometricEnabled: boolean;
}

export interface IdentityCoreEvents {
  'did:created': (did: DID) => void;
  'did:updated': (did: DID) => void;
  'did:deleted': (didId: string) => void;
  'authentication:success': (did: DID) => void;
  'authentication:failed': (error: Error) => void;
  'tool:access:granted': (did: string, toolId: string) => void;
  'tool:access:revoked': (did: string, toolId: string) => void;
  'initialized': (data: {}) => void;
  'did_created': (data: { didId: string; username: string }) => void;
  'did_authenticated': (data: { didId: string; username: string }) => void;
  'security:event': (securityEvent: any) => void;
}

export type IdentityCoreEventType = keyof IdentityCoreEvents;
export type IdentityCoreEventHandler<T extends IdentityCoreEventType> = IdentityCoreEvents[T];

export class IdentityError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}

export const IdentityErrorCodes = {
  DID_NOT_FOUND: 'DID_NOT_FOUND',
  INVALID_PASSCODE: 'INVALID_PASSCODE',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CREATION_ERROR: 'CREATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  PRIVACY_ERROR: 'PRIVACY_ERROR',
} as const;

export type IdentityErrorCode = typeof IdentityErrorCodes[keyof typeof IdentityErrorCodes];

// Distributed Identity Types
export interface Identity {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  metadata?: Record<string, any>;
}

export interface DIDDocument {
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: Service[];
  created?: string;
  updated?: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: any;
}

export interface Service {
  id: string;
  type: string;
  serviceEndpoint: string;
  timestamp?: string;
  deviceId?: string;
}

// --- Advanced Security Types ---

export interface CertificateInfo {
  fingerprint: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
}

export interface PinnedCertificate {
  domain: string;
  fingerprints: string[];
  lastVerified: Date;
  expiresAt: Date;
}

export interface ThreatDetectionEvent {
  timestamp: string;
  eventType: string;
  details: any;
  riskScore: number;
  sourceIp?: string;
  userAgent?: string;
}

export interface RateLimitStatus {
  key: string;
  count: number;
  limit: number;
  resetTime: number;
  blocked: boolean;
}

// --- Recovery System Types ---

export interface RecoveryCustodian {
  id: string;
  name: string;
  type: 'device' | 'person' | 'service';
  publicKey: string;
  metadata: {
    deviceId?: string;
    deviceName?: string;
    email?: string;
    phone?: string;
    location?: string;
    lastSeen?: string;
    trustLevel: 'high' | 'medium' | 'low';
  };
  isActive: boolean;
  addedAt: string;
  lastVerified?: string;
}

export interface RecoveryConfig {
  threshold: number; // Minimum keys needed (2-5)
  totalKeys: number; // Total custodians (max 5)
  custodians: RecoveryCustodian[];
  recoveryKey: string; // Encrypted recovery key
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryRequest {
  id: string;
  didId: string;
  custodians: string[]; // IDs of custodians providing keys
  signatures: string[]; // Their signatures
  timestamp: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface RecoverySession {
  id: string;
  didId: string;
  custodians: RecoveryCustodian[];
  threshold: number;
  providedKeys: number;
  remainingKeys: number;
  expiresAt: string;
  createdAt: string;
}

export interface PrivacySharingSettings {
  didId: string;
  thirdParties: {
    [partyId: string]: {
      name: string;
      permissions: string[];
      dataShared: string[];
      lastAccess: string;
      expiresAt?: string;
      isActive: boolean;
    };
  };
  globalSettings: {
    allowAnalytics: boolean;
    allowMarketing: boolean;
    allowThirdPartySharing: boolean;
    dataRetentionDays: number;
  };
}

export interface DeviceSyncInfo {
  didId: string;
  devices: {
    [deviceId: string]: {
      name: string;
      type: 'mobile' | 'desktop' | 'tablet' | 'other';
      lastSync: string;
      syncStatus: 'synced' | 'pending' | 'error';
      isTrusted: boolean;
      location?: string;
      ipAddress?: string;
    };
  };
  syncSettings: {
    autoSync: boolean;
    syncInterval: number; // minutes
    encryptInTransit: boolean;
    allowCrossDeviceAuth: boolean;
  };
} 