/**
 * Unified aggregator architecture types.
 * Superset of id-dashboard and aggregator-browser aggregator type modules.
 * Prefer browser's richer shapes; retain dashboard-only fields still in use.
 *
 * FeedCategory and ShareToken live in feedCategories.ts / tokenDecryption.ts
 * and are re-exported from the package index — do not redefine here.
 */

import type { FeedCategory } from './feedCategories';

// ============================================================================
// Storage Backend Types
// ============================================================================

export interface StorageFile {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  modifiedTime?: string;
  encrypted?: boolean;
  originalName?: string;
  /** Backend identifier (e.g. 'google_drive') */
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

/**
 * Storage Backend Interface
 * All storage providers must implement this interface
 */
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

// ============================================================================
// Aggregated File Types
// ============================================================================

export interface AggregatedFile extends StorageFile {
  backend: string;
  backendFileId: string;
  aggregatedAt?: string;
  visibility?: 'public' | 'private' | 'friends';
  [key: string]: any;
}

// ============================================================================
// Encryption Types (for aggregator)
// ============================================================================

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  version?: string;
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
    description?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// ============================================================================
// Content Rating & Moderation (dashboard)
// ============================================================================

/** Three-tier content rating (dashboard moderation) */
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

// ============================================================================
// Feed Types
// ============================================================================

export interface Feed {
  feedId: string;
  feedName: string;
  feedCategory: FeedCategory;
  feedDescription?: string;
  /** pN identifier of feed host */
  creatorId: string;
  creatorTier: 'free' | 'feed' | 'self-hosted';
  branding?: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
    links?: Array<{
      label: string;
      url: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  subscriberCount?: number;
  postCount?: number;
  isPaid?: boolean;
  monthlyPrice?: number;
  annualPrice?: number;
  subdomain?: string;
}

// ============================================================================
// Engagement & Public Metadata
// ============================================================================

export interface EngagementMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  lastUpdated: string;
  engagementHistory?: Array<{
    type: 'like' | 'comment' | 'share' | 'view' | 'save';
    /** Optional: who engaged (privacy-preserving analytics) */
    did?: string;
    timestamp: string;
  }>;
}

/**
 * Public Metadata with semantic web fields (JSON-LD) plus dashboard moderation.
 * Supports schema.org, Dublin Core, PROV-O, FOAF, ActivityPub, and pN-specific fields.
 */
export interface PublicMetadata {
  '@context'?: string | string[];
  '@type'?: string | string[];
  '@id'?: string;

  fileId: string;
  backend: string;
  backendFileId: string;

  name?: string;
  title?: string;
  description?: string;
  keywords?: string[];
  tags?: string[];
  uploadDate: string;
  datePublished?: string;
  dateCreated?: string;
  dateModified?: string;
  fileType: string;

  geminiTags?: string[];
  subjects?: string[];
  normalizedTags?: Array<{
    id: string;
    displayName: string;
    sources: Array<'gemini' | 'user' | 'extracted' | 'preference'>;
    type: 'subject' | 'category' | 'contentType' | 'keyword';
    provenance?: Array<{
      source: 'gemini' | 'user' | 'extracted' | 'preference';
      timestamp: string;
      action?:
        | 'upload'
        | 'edit'
        | 'ai_generate'
        | 'extract'
        | 'swipe_like'
        | 'swipe_dislike'
        | 'preference_tile';
      actor?: string;
      confidence?: number;
      metadata?: {
        fileId?: string;
        model?: string;
      };
    }>;
  }>;

  creator?: {
    '@type'?: 'Person' | string;
    '@id'?: string;
    name?: string;
    identifier?: {
      '@type'?: 'PropertyValue' | string;
      name?: string;
      value?: string;
    };
    [key: string]: any;
  };
  author?: {
    did: string;
    username?: string;
  };

  genre?: string[];
  category?: string;
  about?: any[];
  locationCreated?: any;
  encodingFormat?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: string;
  bitrate?: number;
  frameRate?: number;
  license?: string | any;
  copyrightHolder?: any;
  inLanguage?: string | string[];
  publisher?: any;
  abstract?: string;
  headline?: string;
  citation?: string | any[];
  aggregateRating?: any;
  commentCount?: number;

  'dc:title'?: string;
  'dc:creator'?: string;
  'dc:subject'?: string[];
  'dc:description'?: string;
  'dc:publisher'?: string;
  'dc:date'?: string;
  'dc:type'?: string;
  'dc:format'?: string;
  'dc:identifier'?: string;
  'dc:language'?: string;
  'dc:rights'?: string;
  'dc:rightsHolder'?: string;

  'prov:wasGeneratedBy'?: any;
  'prov:wasAttributedTo'?: string[];
  'prov:wasDerivedFrom'?: string[];
  'prov:wasInfluencedBy'?: string[];
  'prov:hadPrimarySource'?: string;

  'foaf:maker'?: string[];
  'foaf:primaryTopic'?: string;
  'foaf:topic'?: string[];
  'foaf:depicts'?: string[];
  'foaf:thumbnail'?: string;

  'as:type'?: string;
  'as:actor'?: string;
  'as:object'?: any;
  'as:published'?: string;
  'as:updated'?: string;
  'as:content'?: string;
  'as:inReplyTo'?: string;
  'as:tag'?: any[];

  thumbnail?:
    | string
    | {
        '@type': 'ImageObject';
        '@id': string;
      };

  inReplyTo?: any;
  repostOf?: any;
  isPartOf?: any;
  hasPart?: string[];

  engagement?: EngagementMetrics;
  /** Server discovery score (API); see docs/business/DISCOVERY_RANKING.md */
  publicRankScore?: number;

  publicToken?: any;
  isPublic: boolean;
  sameAs?: string[];

  /** false = Public (default), true = NSFW (browser simplified rating) */
  isNSFW?: boolean;

  feedIds?: string[];
  feedCategories?: FeedCategory[];
  creatorTier?: 'free' | 'feed' | 'self-hosted';

  textPost?: TextPostData;
  thought?: TextPostData;

  collection?: {
    collectionFileIds: string[];
  };

  thumbnailFileId?: string;
  mainFileId?: string;
  /** True if main file is encrypted; false for raw uploads over tier limit */
  isEncrypted?: boolean;

  sharedWith?: string[];
  metadata?: Record<string, any>;
  indexingPermissions?: {
    mode?: 'all' | 'custom' | 'none';
    allowed?: string[];
    blocked?: string[];
    updatedAt?: string;
  };

  contentRating?: ContentRating;
  reportCount?: number;
  autoFlagged?: boolean;
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

export interface TextPostStyle {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  textStyle?: 'plain' | 'bold' | 'italic' | 'strikethrough';
  dropShadowColor: string;
  dropShadowBlur: number;
  dropShadowOffsetX: number;
  dropShadowOffsetY: number;
  backgroundColor: string;
  backgroundImage?: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  padding: number;
}

export interface TextPostData {
  content: string;
  style: TextPostStyle;
  isNSFW?: boolean;
  category?: FeedCategory;
}

export interface MetadataFilters {
  tags?: string[];
  fileType?: string;
  contentClass?: 'media' | 'thought' | 'collection';
  authorDid?: string;
  dateRange?: {
    from: string;
    to: string;
  };
  includeNSFW?: boolean;
  feedId?: string;
  feedCategory?: FeedCategory;
  creatorTier?: 'free' | 'feed' | 'self-hosted';
}

export interface IndexedFile {
  metadata: PublicMetadata;
  thumbnail?: string;
  publicToken?: string;
  pnIdentifier?: string;
}

// ============================================================================
// Auth / credentials (aggregator owner operations)
// ============================================================================

/**
 * Aggregator auth session for owner crypto operations.
 * Distinct from identity-crypto AuthSession / browser OAuth session shapes.
 */
export interface AuthSession {
  id: string;
  publicKey: string;
  pnName?: string;
  nickname?: string;
  accessToken?: string;
  expiresIn?: number;
  authenticatedAt?: string;
  passcode?: string;
  authToken?: string;
}

/** Dashboard storage credential cache entry */
export interface StorageCredentialEntry {
  email?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  backendId?: string;
  keyPrefix?: string;
  [key: string]: any;
}
