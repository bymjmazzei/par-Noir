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
  
  // Allow any additional semantic web properties
  [key: string]: any;
}

export interface MetadataFilters {
  tags?: string[];
  fileType?: string;
  authorDid?: string;
  dateRange?: {
    from: string;
    to: string;
  };
}

export interface IndexedFile {
  metadata: PublicMetadata;
  thumbnail?: string;
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

