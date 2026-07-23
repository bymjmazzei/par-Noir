export interface AggregatedFile {
  id: string;
  backend: string;
  backendFileId: string;
  name: string;
  originalName?: string;
  mimeType?: string;
  size?: number | string;
  modifiedTime?: string;
  encrypted?: boolean;
  aggregatedAt?: string;
  visibility?: 'public' | 'private' | 'friends';
  [key: string]: any;
}

export interface StorageFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  modifiedTime: string;
  encrypted?: boolean;
  originalName?: string;
  backend?: string;
  backendFileId?: string;
}

export interface StorageQuota {
  limit: number;
  usage: number;
  usageInDrive?: number;
  usageInDriveTrash?: number;
}

export interface StorageUserInfo {
  email?: string;
  name?: string;
  displayName?: string;
  picture?: string;
}

export interface StorageBackendConfig {
  id: string;
  name: string;
  type: 'google_drive' | 'dropbox' | 's3' | 'local';
  apiEndpoint?: string;
}

export interface StorageBackend {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  connect(credentials: unknown): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  listFiles(folderId?: string, pnIdentifier?: string): Promise<StorageFile[]>;
  uploadFile(file: File, folderId?: string, metadata?: unknown): Promise<StorageFile>;
  downloadFile(fileId: string): Promise<Blob>;
  deleteFile(fileId: string): Promise<void>;
  getOrCreateFolder(name: string, pnIdentifier?: string): Promise<string>;
  getStorageQuota?(): Promise<StorageQuota>;
  getQuota?(): Promise<StorageQuota | null>;
  getAccessToken?(): string | null;
  getUserInfo(): Promise<StorageUserInfo | null>;
}

export interface AuthSession {
  id: string;
  nickname?: string;
  accessToken?: string;
  expiresIn?: number;
  authenticatedAt?: string;
  publicKey: string;
  passcode?: string;
  authToken?: string;
}

export interface ShareToken {
  fileId: string;
  contentKey: {
    encrypted: string;
    wrappedWith: string;
    iv: string;
  };
  expiresAt: string;
  permissions: string[];
  shareKey?: string;
  shareEncrypted?: string;
  [key: string]: any;
}

export interface EncryptedFilePackage {
  version: string;
  encrypted: string;
  iv: string;
  salt: string;
  contentKey?: {
    encrypted: string;
    wrappedWith?: string;
    iv: string;
    salt?: string;
  };
  metadata: {
    originalName: string;
    originalSize: number;
    originalMimeType: string;
    encryptedAt: string;
    encryptedBy?: string;
    backend?: string;
    backendFileId?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export type FeedCategory =
  | 'entertainment'
  | 'education'
  | 'news'
  | 'opinion'
  | 'promotion'
  | 'art'
  | 'community'
  | 'ideology'
  | 'lifestyle';

// Content Rating System (three-tier: safe → nsfw → x-rated)
export type ContentRating = 'safe' | 'nsfw' | 'x-rated';

export interface ModerationEvent {
  id: string;
  type: 'auto_detection' | 'user_report' | 'manual_review';
  action: 'flagged' | 'escalated' | 'cleared';
  rating: ContentRating;
  timestamp: string;
  source?: 'gemini' | 'user_report' | 'admin';
  reason?: string;
}

export interface PublicMetadata {
  fileId: string;
  backend: string;
  backendFileId: string;
  name: string;
  description?: string;
  keywords?: string[];
  uploadDate?: string;
  fileType?: string;
  isPublic?: boolean;
  creator?: any;
  thumbnail?: string;
  publicToken?: any;
  engagement?: any;
  inReplyTo?: any;
  repostOf?: any;
  isPartOf?: any;
  metadata?: Record<string, any>;
  sharedWith?: string[];
  feedCategories?: FeedCategory[];
  indexingPermissions?: {
    mode?: 'all' | 'custom' | 'none';
    allowed?: string[];
    blocked?: string[];
    updatedAt?: string;
  };
  thumbnailFileId?: string;
  mainFileId?: string;
  isEncrypted?: boolean; // True if main file is encrypted; false for raw uploads over tier limit
  // Content Rating & Moderation Fields
  contentRating?: ContentRating;
  reportCount?: number;
  autoFlagged?: boolean; // Gemini auto-detection
  lastModerationCheck?: string;
  lastReportedAt?: string;
  moderationHistory?: ModerationEvent[];
  reports?: Array<{
    id: string;
    fileId: string;
    reporterPnId: string;
    reportType: 'nsfw' | 'spam' | 'copyright' | 'other';
    reason?: string;
    timestamp: string;
    validatedByGemini?: boolean;
    geminiResult?: 'confirmed' | 'rejected' | 'pending';
  }>;
  [key: string]: any;
}

export interface StorageCredentialEntry {
  email?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  backendId?: string;
  keyPrefix?: string;
  [key: string]: any;
}
