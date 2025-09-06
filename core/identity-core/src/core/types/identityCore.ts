import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';
import { DID, CreateDIDOptions, AuthenticateOptions, UpdateMetadataOptions, GrantToolAccessOptions, ChallengeResponse, SignatureVerification } from '../../types';

export interface IdentityCoreConfig {
  storageType: 'indexeddb' | 'localstorage' | 'memory';
  encryptionLevel: 'low' | 'medium' | 'high' | 'military';
  backupEnabled: boolean;
  biometricEnabled: boolean;
  securityMonitoringEnabled?: boolean;
  auditLoggingEnabled?: boolean;
  eventHandlingEnabled?: boolean;
}

export type IdentityCoreEventType = 
  | 'initialized'
  | 'did_created'
  | 'did_updated'
  | 'did_deleted'
  | 'authentication_success'
  | 'authentication_failure'
  | 'security:event'
  | 'webauthn_supported'
  | 'tool_access_granted'
  | 'tool_access_revoked'
  | 'privacy_settings_updated'
  | 'backup_created'
  | 'backup_restored'
  | 'error';

export type IdentityCoreEventHandler<T extends IdentityCoreEventType> = (data: any) => void;

export interface SecurityEvent {
  timestamp: string;
  event: string;
  details: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  didId: string;
}

export interface BackgroundSecurityConfig {
  enabled: boolean;
  checkInterval: number;
  cleanupInterval: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface DIDCreationResult {
  did: DID;
  success: boolean;
  error?: string;
}

export interface AuthenticationResult {
  did: DID;
  success: boolean;
  error?: string;
  securityLevel: string;
}

export interface ToolAccessResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  permissions: string[];
}

export interface PrivacySettings {
  privacy: 'low' | 'medium' | 'high';
  sharing: 'none' | 'selective' | 'public';
  notifications: boolean;
  backup: boolean;
  auditLogging: boolean;
  dataRetention: number;
}

export interface SecuritySettings {
  lastLoginAttempt?: string;
  failedAttempts: number;
  accountLockedUntil?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  mfaEnabled: boolean;
  sessionTimeout: number;
}

export interface DIDMetadata {
  displayName?: string;
  email?: string;
  preferences: PrivacySettings;
  security: SecuritySettings;
  lastUpdated: string;
  version: string;
}

export interface DIDKeys {
  primary: string;
  publicKey: string;
  privateKey: string;
  backup?: string;
  recovery?: string;
}

export interface DIDPermissions {
  read: boolean;
  write: boolean;
  delete: boolean;
  share: boolean;
  admin: boolean;
  custom?: Record<string, boolean>;
}

export interface DIDStatus {
  active: boolean;
  suspended: boolean;
  deleted: boolean;
  lastActivity: string;
  lastBackup: string;
  lastSync: string;
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  didId: string;
  userId: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}

export interface BackupMetadata {
  id: string;
  timestamp: string;
  size: number;
  checksum: string;
  encrypted: boolean;
  version: string;
  description?: string;
}

export interface SyncStatus {
  lastSync: string;
  syncInterval: number;
  devices: string[];
  conflicts: number;
  status: 'syncing' | 'synced' | 'error' | 'pending';
}
