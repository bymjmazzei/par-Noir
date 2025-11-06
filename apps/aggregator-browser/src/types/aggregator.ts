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
 * Public Metadata with Semantic Web Standards (JSON-LD)
 * Aligned with schema.org CreativeWork and Dublin Core for semantic web compatibility
 * Enhanced with relationships and engagement metrics
 */
export interface PublicMetadata {
  // JSON-LD Semantic Web Structure
  "@context"?: string | string[]; // Schema.org + par Noir contexts (always array in new metadata)
  "@type"?: string | string[]; // e.g., "CreativeWork", "ImageObject", "VideoObject" (can be multiple types)
  "@id"?: string; // Unique URI for this resource (always required in new metadata)
  
  // Core identifiers
  fileId: string; // Unique identifier
  backend: string; // Storage backend identifier
  backendFileId: string; // File ID in backend storage
  
  // Schema.org CreativeWork properties
  name?: string; // File title (schema.org:name) - preferred
  title?: string; // Legacy support (deprecated, use name)
  description?: string; // Schema.org:description
  keywords?: string[]; // Schema.org:keywords (from tags) - preferred
  tags?: string[]; // Legacy support (deprecated, use keywords)
  uploadDate: string; // Schema.org:datePublished (ISO 8601)
  fileType: string; // MIME type category (e.g., "image", "video")
  
  // Author/Creator (schema.org:creator) - preferred
  creator?: {
    "@type": "Person"; // Schema.org:Person
    "@id": string; // Author's DID (URI)
    identifier?: {
      "@type": "PropertyValue";
      name: "DID";
      value: string; // Public DID
    };
  };
  
  // Legacy author support (for backward compatibility)
  author?: {
    did: string;
    username?: string; // Secret - should not be in public metadata
  };
  
  // Media-specific properties (schema.org extensions)
  thumbnail?: string | {
    "@type": "ImageObject";
    "@id": string; // Thumbnail URI
  };
  
  // Content Relationships (schema.org + ActivityPub compatible)
  inReplyTo?: string; // URI of parent post/resource (schema.org:inReplyTo / as:inReplyTo)
  repostOf?: string; // URI of original post/resource (as:repostOf)
  isPartOf?: string; // URI of curated feed/collection (schema.org:isPartOf)
  
  // Engagement Metrics (par Noir specific, semantic web compatible)
  engagement?: EngagementMetrics;
  
  // par Noir specific
  publicToken?: string; // Share token for access (JSON stringified ShareToken)
  isPublic: boolean; // Visibility flag
  
  // Linked Data (relationships to other resources)
  sameAs?: string[]; // URIs of same resource in other systems (schema.org:sameAs)
  about?: string[]; // Subjects/topics (semantic relationships)
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

