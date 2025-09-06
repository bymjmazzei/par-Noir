// import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';
export interface StorageConfig {
  databaseName: string;
  version: number;
  storeName: string;
}

export interface DID {
  id: string;
  pnName: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive' | 'deleted';
  metadata: {
    displayName?: string;
    email?: string;
    avatar?: string;
    preferences: {
      privacy: 'high' | 'medium' | 'low';
      sharing: 'open' | 'selective' | 'closed';
      notifications: boolean;
      backup: boolean;
    };
    customFields?: Record<string, any>;
    lastUpdated?: string;
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
      dataPoints: Record<string, any>;
    };
  };
  keys: {
    primary: string;
    recovery?: string;
    backup?: string;
    publicKey: string;
    privateKey?: string;
  };
  permissions: Record<string, any>;
}

export interface EncryptedDIDData {
  id: string;
  pnName: string;
  encryptedData: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  security: {
    lastModified: string;
    checksum: string;
    version: string;
  };
}

export interface StorageStats {
  totalDIDs: number;
  activeDIDs: number;
  inactiveDIDs: number;
  deletedDIDs: number;
  totalSize: number;
  lastBackup?: string;
}

export interface BackupData {
  version: string;
  timestamp: string;
  data: EncryptedDIDData[];
  checksum: string;
}
