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
  did: string;
  passcode: string;
  biometric?: boolean;
}

export interface UpdateMetadataOptions {
  did: string;
  metadata: Partial<DIDMetadata>;
  toolId?: string;
}

export interface GrantToolAccessOptions {
  did: string;
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
} as const;

export type IdentityErrorCode = typeof IdentityErrorCodes[keyof typeof IdentityErrorCodes]; 