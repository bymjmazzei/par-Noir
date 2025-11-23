/**
 * Aggregator Metadata Service
 * Maintains centralized index of all public file metadata from all pNs
 */

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
 * Enhanced with relationships and engagement metrics
 * Compatible with schema.org and linked data principles
 */
export interface PublicMetadata {
  // JSON-LD Semantic Web Structure
  "@context"?: string | string[]; // Schema.org + par Noir contexts (always array in new metadata)
  "@type"?: string | string[]; // Schema.org type (CreativeWork, ImageObject, etc.) - can be multiple types
  "@id"?: string; // Unique URI for this resource (always required in new metadata)
  
  // Core identifiers
  fileId: string;
  backend: string;
  backendFileId: string;
  
  // Schema.org CreativeWork properties
  name?: string; // Schema.org:name (preferred over 'title')
  title?: string; // Legacy support (deprecated, use name)
  description?: string;
  keywords?: string[]; // Schema.org:keywords (preferred)
  tags?: string[]; // Legacy support (deprecated, use keywords)
  uploadDate: string; // Schema.org:datePublished
  fileType: string;
  
  // Author/Creator (schema.org:creator)
  creator?: {
    "@type": "Person";
    "@id": string; // DID URI
    identifier?: {
      "@type": "PropertyValue";
      name: "DID";
      value: string;
    };
  };
  author?: {
    did: string; // Legacy support
  };
  
  // Media properties
  thumbnail?: string | {
    "@type": "ImageObject";
    "@id": string;
  };
  
  // Content Relationships (schema.org + ActivityPub compatible)
  inReplyTo?: string; // URI of parent post/resource (schema.org:inReplyTo / as:inReplyTo)
  repostOf?: string; // URI of original post/resource (as:repostOf)
  isPartOf?: string; // URI of curated feed/collection (schema.org:isPartOf)
  
  // Engagement Metrics (par Noir specific, semantic web compatible)
  engagement?: EngagementMetrics;
  
  // par Noir specific
  publicToken?: string;
  isPublic: boolean;
  isNSFW?: boolean; // NSFW content flag
  
  // Linked Data
  sameAs?: string[];
  about?: string[];

  // Subject Niches (auto-extracted from description/tags/keywords)
  subjects?: string[]; // Subject niches (e.g., ["cowboy", "horses", "ranch"])
  feedCategories?: string[]; // Niche categories (e.g., ["lifestyle", "entertainment"])

  // Third-party indexing permissions
  indexingPermissions?: {
    mode?: 'all' | 'custom' | 'none';
    allowed?: string[];
    blocked?: string[];
    updatedAt?: string;
  };

  // PDF Pre-rendered Pages (for fast loading)
  pdfPageFileIds?: string[]; // File IDs of pre-rendered PNG pages

  // Text Post / Thought Support
  textPost?: {
    content: string;
    style?: {
      backgroundColor?: string;
      backgroundImage?: string;
      fontFamily?: string;
      fontSize?: number;
      textColor?: string;
      textStyle?: 'bold' | 'italic' | 'strikethrough';
      textAlign?: 'left' | 'center' | 'right' | 'justify';
      dropShadowOffsetX?: number;
      dropShadowOffsetY?: number;
      dropShadowBlur?: number;
      dropShadowColor?: string;
      padding?: number;
    };
  };
  thought?: {
    content: string;
    style?: {
      backgroundColor?: string;
      backgroundImage?: string;
      fontFamily?: string;
      fontSize?: number;
      textColor?: string;
      textStyle?: 'bold' | 'italic' | 'strikethrough';
      textAlign?: 'left' | 'center' | 'right' | 'justify';
      dropShadowOffsetX?: number;
      dropShadowOffsetY?: number;
      dropShadowBlur?: number;
      dropShadowColor?: string;
      padding?: number;
    };
  };
}

export interface CentralIndexEntry {
  fileId: string;
  metadata: PublicMetadata;
  submittedAt: string;
  pnIdentifier?: string;
}

export interface CentralIndexResponse {
  files: CentralIndexEntry[];
  updatedAt: string;
  totalFiles: number;
}

export class AggregatorMetadataService {
  private static instance: AggregatorMetadataService;
  private metadataIndex: Map<string, CentralIndexEntry> = new Map();
  private lastUpdated: Date = new Date();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): AggregatorMetadataService {
    if (!AggregatorMetadataService.instance) {
      AggregatorMetadataService.instance = new AggregatorMetadataService();
    }
    return AggregatorMetadataService.instance;
  }

  /**
   * Submit public metadata to central index
   * Validates structure before adding
   */
  submitMetadata(metadata: PublicMetadata, pnIdentifier?: string): void {
    // Only require fileId - other fields can have defaults
    if (!metadata.fileId) {
      throw new Error('Invalid metadata: missing required field: fileId');
    }

    // Ensure isPublic is true
    const validatedMetadata: PublicMetadata = {
      ...metadata,
      isPublic: true, // Always true when submitted to public index
      backend: metadata.backend || 'google_drive',
      backendFileId: metadata.backendFileId || metadata.fileId,
      name: metadata.name || metadata.title || metadata.fileId,
      uploadDate: metadata.uploadDate || new Date().toISOString(),
      fileType: metadata.fileType || 'other'
    };

    const entry: CentralIndexEntry = {
      fileId: validatedMetadata.fileId,
      metadata: validatedMetadata,
      submittedAt: new Date().toISOString(),
      pnIdentifier
    };

    this.metadataIndex.set(validatedMetadata.fileId, entry);
    this.lastUpdated = new Date();

    const displayTitle = validatedMetadata.name || validatedMetadata.title || 'Untitled';
    const authorDid = validatedMetadata.creator?.identifier?.value || validatedMetadata.creator?.["@id"] || validatedMetadata.author?.did;
    const authorDisplay = authorDid ? authorDid.substring(0, 12) + '...' : 'Unknown';
    console.log(`✅ Added public metadata for file: ${validatedMetadata.fileId} (${displayTitle}) by ${authorDisplay}`);
  }

  /**
   * Remove metadata from central index
   */
  removeMetadata(fileId: string): boolean {
    const removed = this.metadataIndex.delete(fileId);
    if (removed) {
      this.lastUpdated = new Date();
      console.log(`🗑️ Removed metadata for file: ${fileId}`);
    }
    return removed;
  }

  /**
   * Get all public metadata with optional filters
   */
  getPublicMetadata(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
  }): CentralIndexEntry[] {
    let entries = Array.from(this.metadataIndex.values())
      .filter(entry => entry.metadata.isPublic);

    // Apply filters
    if (filters) {
      if (filters.tags && filters.tags.length > 0) {
        entries = entries.filter(entry => {
          const keywords = entry.metadata.keywords || [];
          return keywords.some((tag: string) => filters.tags!.includes(tag));
        });
      }

      if (filters.fileType) {
        entries = entries.filter(entry => entry.metadata.fileType === filters.fileType);
      }

      if (filters.authorDid) {
        entries = entries.filter(entry => {
          const entryAuthorDid = entry.metadata.creator?.identifier?.value || 
                                entry.metadata.creator?.["@id"] || 
                                entry.metadata.author?.did;
          return entryAuthorDid === filters.authorDid;
        });
      }

      if (filters.indexerId) {
        entries = entries.filter(entry =>
          this.isIndexerAllowed(entry.metadata.indexingPermissions, filters.indexerId!)
        );
      }
    }

    return entries;
  }

  /**
   * Get metadata for specific file
   */
  getFileMetadata(fileId: string): CentralIndexEntry | null {
    return this.metadataIndex.get(fileId) || null;
  }

  /**
   * Get index stats
   */
  getStats(): { totalFiles: number; lastUpdated: string } {
    return {
      totalFiles: this.metadataIndex.size,
      lastUpdated: this.lastUpdated.toISOString()
    };
  }

  /**
   * Get full index response
   */
  getIndexResponse(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
  }): CentralIndexResponse {
    const files = this.getPublicMetadata(filters);

    return {
      files,
      updatedAt: this.lastUpdated.toISOString(),
      totalFiles: files.length
    };
  }

  private isIndexerAllowed(
    permissions: PublicMetadata['indexingPermissions'] | undefined,
    indexerId: string
  ): boolean {
    if (!permissions || !permissions.mode || permissions.mode === 'all') {
      const blocked = permissions?.blocked || [];
      return !blocked.includes(indexerId);
    }

    if (permissions.mode === 'custom') {
      const blocked = permissions.blocked || [];
      if (blocked.includes(indexerId)) {
        return false;
      }
      const allowed = permissions.allowed || [];
      return allowed.includes(indexerId);
    }

    if (permissions.mode === 'none') {
      return false;
    }

    return true;
  }
}

