// Universal Storage Types - Shared across all tools
export interface StorageFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document' | 'audio' | 'other';
  size: number;
  cid: string; // IPFS Content Identifier
  url: string; // Accessible URL
  visibility: 'private' | 'public' | 'friends';
  uploadedAt: string;
  owner: string; // DID of owner
  provider: StorageProviderType;
  metadata?: FileMetadata;
  provenance: ProvenanceChain;
}

export interface FileMetadata {
  // Image metadata
  width?: number;
  height?: number;
  format?: string;
  colorSpace?: string;
  
  // Video metadata
  duration?: number;
  fps?: number;
  codec?: string;
  
  // Audio metadata
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  
  // Document metadata
  pageCount?: number;
  language?: string;
  
  // General metadata
  mimeType: string;
  encoding?: string;
  checksum: string;
}

export interface ProvenanceChain {
  originalCreator: string; // DID
  ownershipHistory: OwnershipRecord[];
  modificationHistory: ModificationRecord[];
  accessLog: AccessRecord[];
  verificationStatus: 'verified' | 'unverified' | 'pending';
  createdAt: string;
  lastModified: string;
}

export interface OwnershipRecord {
  owner: string; // DID
  acquiredAt: string;
  method: 'created' | 'transferred' | 'inherited';
  transactionHash?: string;
  signature: string;
}

export interface ModificationRecord {
  modifiedAt: string;
  modifier: string; // DID
  changes: string[];
  reason?: string;
  signature: string;
}

export interface AccessRecord {
  accessedAt: string;
  accessor: string; // DID or 'public'
  action: 'view' | 'download' | 'share' | 'modify';
  ipAddress?: string;
  userAgent?: string;
}

export type StorageProviderType = 'ipfs' | 'arweave' | 'storj' | 'filecoin' | 'cloudflare-r2' | 'google-drive';

export interface StorageProvider {
  id: string;
  name: string;
  type: StorageProviderType;
  status: 'active' | 'inactive' | 'error' | 'setup_required';
  storageUsed: number; // bytes
  storageLimit: number; // bytes, -1 for unlimited
  isFree: boolean;
  costPerGB?: number;
  credentials?: StorageCredentials;
  settings: ProviderSettings;
}

export interface StorageCredentials {
  apiKey?: string;
  apiSecret?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accountId?: string; // For Cloudflare R2
  accessToken?: string; // For Google Drive OAuth
  refreshToken?: string; // For Google Drive OAuth
  clientId?: string; // For Google Drive OAuth
  // Encrypted and stored locally
}

export interface ProviderSettings {
  autoOptimize: boolean;
  compressionLevel: 'low' | 'medium' | 'high';
  redundancy: number;
  pinning: boolean;
  backup: boolean;
}

export interface UploadOptions {
  provider: StorageProviderType;
  visibility: 'private' | 'public' | 'friends';
  autoOptimize: boolean;
  compressionLevel: 'low' | 'medium' | 'high';
  generateThumbnails: boolean;
  extractMetadata: boolean;
  pinContent: boolean;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  cid?: string;
  url?: string;
}

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  byType: {
    image: { count: number; size: number };
    video: { count: number; size: number };
    document: { count: number; size: number };
    audio: { count: number; size: number };
    other: { count: number; size: number };
  };
  byProvider: {
    [key in StorageProviderType]: { count: number; size: number };
  };
  byVisibility: {
    private: { count: number; size: number };
    public: { count: number; size: number };
    friends: { count: number; size: number };
  };
}

export interface StorageConfig {
  platform: 'dashboard' | 'browser' | 'mobile' | 'desktop';
  features: {
    upload: boolean;
    preview: boolean;
    sharing: boolean;
    discovery: boolean;
    editing: boolean;
    deletion: boolean;
  };
  ui: {
    layout: 'full' | 'compact' | 'minimal';
    theme: 'dashboard' | 'browser' | 'mobile';
    defaultView: 'grid' | 'list';
  };
  limits: {
    maxFileSize: number;
    maxFilesPerUpload: number;
    allowedTypes: string[];
  };
}

// Discovery and sharing types
export interface PublicContent {
  cid: string;
  name: string;
  type: string;
  owner: string;
  uploadedAt: string;
  visibility: 'public';
  tags: string[];
  description?: string;
  thumbnail?: string;
  metadata: FileMetadata;
}

export interface ShareLink {
  id: string;
  fileId: string;
  url: string;
  expiresAt?: string;
  accessCount: number;
  maxAccess?: number;
  password?: string;
  createdAt: string;
  createdBy: string;
}

// Error types
export interface StorageError {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
}

export class StorageError extends Error {
  public code: string;
  public details?: any;
  public retryable: boolean;

  constructor(error: StorageError) {
    super(error.message);
    this.name = 'StorageError';
    this.code = error.code;
    this.details = error.details;
    this.retryable = error.retryable;
  }
}

export const STORAGE_ERROR_CODES = {
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;
