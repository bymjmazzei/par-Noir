/**
 * Aggregator Architecture Types
 * Core types for storage backend abstraction and file aggregation
 */

// ============================================================================
// Storage Backend Types
// ============================================================================

export interface StorageFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  modifiedTime: string;
  encrypted?: boolean;
  originalName?: string;
  backend: string; // Backend identifier (e.g., 'google_drive')
}

export interface StorageQuota {
  limit: number;
  usage: number;
  usageInDrive: number;
  usageInDriveTrash: number;
}

export interface StorageUserInfo {
  email: string;
  name?: string;
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
  // Identification
  readonly id: string;
  readonly name: string;
  readonly type: string;
  
  // Connection
  connect(credentials: any): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // File operations
  listFiles(folderId?: string, pnIdentifier?: string): Promise<StorageFile[]>;
  uploadFile(file: File, folderId?: string, metadata?: any): Promise<StorageFile>;
  downloadFile(fileId: string): Promise<Blob>;
  deleteFile(fileId: string): Promise<void>;
  
  // Folder operations
  getOrCreateFolder(name: string, pnIdentifier?: string): Promise<string>;
  
  // Metadata
  getStorageQuota(): Promise<StorageQuota>;
  getUserInfo(): Promise<StorageUserInfo>;
}

// ============================================================================
// Aggregated File Types
// ============================================================================

export interface AggregatedFile extends StorageFile {
  backend: string;
  backendFileId: string;
  aggregatedAt: string;
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
    iv: string;
    salt: string;
  };
  metadata: {
    originalName: string;
    originalSize: number;
    originalMimeType: string;
    encryptedAt: string;
    encryptedBy: string;
    backend?: string;
    backendFileId?: string;
  };
}

export interface ShareToken {
  fileId: string;
  contentKey: {
    encrypted: string;
    wrappedWith: string; // Public key or secret identifier
    iv: string;
  };
  expiresAt: string;
  permissions: string[];
  metadata?: {
    title?: string;
    description?: string;
  };
}

// ============================================================================
// Content Rating Types (Simplified to Public/NSFW)
// ============================================================================

// Simple boolean flag: false = Public (default), true = NSFW
// No complex rating system needed

// ============================================================================
// Feed Types
// ============================================================================

export type FeedCategory =
  | 'beauty-fashion'
  | 'sports-fitness'
  | 'tv-film-entertainment'
  | 'music-performing-arts'
  | 'gaming-esports'
  | 'technology-gadgets'
  | 'home-interior-design'
  | 'food-culinary'
  | 'travel-adventure'
  | 'wellness-mental-health'
  | 'business-entrepreneurship'
  | 'science-education'
  | 'art-design'
  | 'diy-maker-culture'
  | 'parenting-family-life'
  | 'eco-sustainability'
  | 'finance-investing'
  | 'motors-automotive'
  | 'humor-meme-culture'
  | 'adults-only';

export interface Feed {
  feedId: string;
  feedName: string;
  feedCategory: FeedCategory;
  feedDescription?: string;
  creatorId: string; // pN identifier of feed host
  creatorTier: 'feed' | 'self-hosted';
  branding?: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
  };
  createdAt: string;
  updatedAt: string;
  subscriberCount?: number;
  postCount?: number;
}

// ============================================================================
// Metadata Index Types (for discovery)
// ============================================================================

/**
 * Engagement Metrics (semantic web compatible)
 */
export interface EngagementMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  lastUpdated: string;
  engagementHistory?: Array<{
    type: 'like' | 'comment' | 'share' | 'view';
    did?: string; // Optional: who engaged (for analytics, privacy-preserving)
    timestamp: string;
  }>;
}

/**
 * Public Metadata with Comprehensive Semantic Web Standards (JSON-LD)
 * Supports schema.org, Dublin Core, PROV-O, FOAF, ActivityPub, and more
 * Full semantic web foundation for decentralized social media
 */
export interface PublicMetadata {
  // JSON-LD Semantic Web Structure
  "@context"?: string | string[]; // Comprehensive contexts: schema.org, dc:, prov:, foaf:, as:, pN
  "@type"?: string | string[]; // e.g., "CreativeWork", "ImageObject", "VideoObject"
  "@id"?: string; // Unique URI for this resource (required)
  
  // Core identifiers
  fileId: string;
  backend: string;
  backendFileId: string;
  
  // ============================================================================
  // SCHEMA.ORG CREATIVEWORK PROPERTIES
  // ============================================================================
  name?: string;
  title?: string; // Legacy
  description?: string;
  keywords?: string[];
  tags?: string[]; // Legacy
  uploadDate: string;
  datePublished?: string;
  dateCreated?: string;
  dateModified?: string;
  fileType: string;
  
  // Creator/Author
  creator?: {
    "@type": "Person";
    "@id": string;
    identifier?: {
      "@type": "PropertyValue";
      name: "DID";
      value: string;
    };
  };
  author?: {
    did: string;
    username?: string;
  };
  
  // Extended schema.org properties
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
  
  // ============================================================================
  // DUBLIN CORE (dc:)
  // ============================================================================
  "dc:title"?: string;
  "dc:creator"?: string;
  "dc:subject"?: string[];
  "dc:description"?: string;
  "dc:publisher"?: string;
  "dc:date"?: string;
  "dc:type"?: string;
  "dc:format"?: string;
  "dc:identifier"?: string;
  "dc:language"?: string;
  "dc:rights"?: string;
  "dc:rightsHolder"?: string;
  
  // ============================================================================
  // PROV-O (PROVENANCE) (prov:)
  // ============================================================================
  "prov:wasGeneratedBy"?: any;
  "prov:wasAttributedTo"?: string[];
  "prov:wasDerivedFrom"?: string[];
  "prov:wasInfluencedBy"?: string[];
  "prov:hadPrimarySource"?: string;
  
  // ============================================================================
  // FOAF (foaf:)
  // ============================================================================
  "foaf:maker"?: string[];
  "foaf:primaryTopic"?: string;
  "foaf:topic"?: string[];
  "foaf:depicts"?: string[];
  "foaf:thumbnail"?: string;
  
  // ============================================================================
  // ACTIVITYPUB (as:)
  // ============================================================================
  "as:type"?: string;
  "as:actor"?: string;
  "as:object"?: any;
  "as:published"?: string;
  "as:updated"?: string;
  "as:content"?: string;
  "as:inReplyTo"?: string;
  "as:tag"?: any[];
  
  // ============================================================================
  // MEDIA PROPERTIES
  // ============================================================================
  thumbnail?: string | {
    "@type": "ImageObject";
    "@id": string;
  };
  
  // ============================================================================
  // CONTENT RELATIONSHIPS
  // ============================================================================
  inReplyTo?: string;
  repostOf?: string;
  isPartOf?: string;
  hasPart?: string[];
  
  // ============================================================================
  // ENGAGEMENT METRICS
  // ============================================================================
  engagement?: EngagementMetrics;
  
  // ============================================================================
  // PAR NOIR SPECIFIC
  // ============================================================================
  publicToken?: string;
  isPublic: boolean;
  sameAs?: string[];
  about?: string[];
  
  // Content Rating System (Simplified)
  isNSFW?: boolean; // false = Public (default), true = NSFW
  
  // Feed Membership
  feedIds?: string[]; // IDs of feeds this content belongs to
  feedCategories?: FeedCategory[]; // Niche categories
  
  // Subject Niches (auto-extracted from description/tags/keywords)
  subjects?: string[]; // Subject niches (e.g., ["cowboy", "horses", "ranch"])
  
  // Creator Tier
  creatorTier?: 'free' | 'feed' | 'self-hosted';
  
  // Text Post / Thought Support
  textPost?: TextPostData;
  thought?: TextPostData; // Alias for textPost
  
  // Allow any additional semantic web properties
  [key: string]: any;
}

/**
 * Text Post Styling Configuration
 */
export interface TextPostStyle {
  fontFamily: string;
  fontSize: number; // in pixels
  textColor: string; // hex color
  textStyle?: 'plain' | 'bold' | 'italic' | 'strikethrough'; // text decoration style
  dropShadowColor: string; // hex color
  dropShadowBlur: number; // blur radius in pixels
  dropShadowOffsetX: number; // offset in pixels
  dropShadowOffsetY: number; // offset in pixels
  backgroundColor: string; // hex color or gradient
  backgroundImage?: string; // optional background image URL (data URL or blob URL)
  textAlign: 'left' | 'center' | 'right' | 'justify';
  padding: number; // padding in pixels
}

/**
 * Text Post Data Structure
 */
export interface TextPostData {
  content: string;
  style: TextPostStyle;
  isNSFW?: boolean; // false = Public (default), true = NSFW
  category?: FeedCategory;
}

export interface MetadataFilters {
  tags?: string[];
  fileType?: string;
  authorDid?: string;
  dateRange?: {
    from: string;
    to: string;
  };
  // NSFW filter
  includeNSFW?: boolean; // Include NSFW content (requires age verification)
  // Feed filters
  feedId?: string; // Filter by specific feed
  feedCategory?: FeedCategory; // Filter by niche category
  creatorTier?: 'free' | 'feed' | 'self-hosted'; // Filter by creator tier
}

export interface IndexedFile {
  metadata: PublicMetadata;
  thumbnail?: string;
  publicToken?: string; // Public token for decryption (may be at file level or in metadata)
  pnIdentifier?: string; // pN identifier of the file owner (from aggregator metadata)
}

// ============================================================================
// Authentication Session (for owner operations)
// ============================================================================

export interface AuthSession {
  id: string;
  pnName: string;
  publicKey: string;
  nickname?: string;
  accessToken?: string;
  expiresIn?: number;
  authenticatedAt?: string;
}

