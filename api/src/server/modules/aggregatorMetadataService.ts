/**
 * Aggregator metadata shared types.
 *
 * Membership SoT = owner public-file-index; query path = AggregatorMetadataServiceDB.
 * See docs/architecture/ADR_AGGREGATOR_METADATA_SOT.md.
 */

/**
 * Engagement Metrics (semantic web compatible)
 */
export interface EngagementMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  lastUpdated: string;
  engagementHistory?: Array<{
    type: 'like' | 'comment' | 'share' | 'view';
    did?: string; // Legacy field for backward compatibility
    pn_identifier?: string; // Standard field: who engaged (for analytics, privacy-preserving)
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
  contentClass?: 'media' | 'thought' | 'collection'; // Content classification for feed filtering
  
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

  /** Denormalized copy of server discovery score (optional; also on CentralIndexEntry). */
  publicRankScore?: number;
  
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

  
  // Thumbnail for fast feed loading (images, videos, slideshows)
  thumbnailFileId?: string; // File ID of encrypted thumbnail (800px width, JPEG)
  mainFileId?: string; // Reference to the main file (for thumbnails) - the main file is for owner download only
  isEncrypted?: boolean; // True if main file is encrypted; false for raw (unencrypted) uploads over tier limit

  // Thought/Collection metadata
  isThoughtThumbnail?: boolean; // True if this is a thumbnail image for a thought
  isPartOfCollection?: boolean; // True if this file is part of a collection
  collection?: {
    collectionFileIds: string[]; // Array of file IDs in order
  };

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
  /**
   * Server-computed public discovery score (verified-weighted engagement + recency).
   * See docs/business/DISCOVERY_RANKING.md
   */
  publicRankScore?: number;
}

export interface CentralIndexResponse {
  files: CentralIndexEntry[];
  updatedAt: string;
  totalFiles: number;
}

/**
 * Types-only module. Query/write path is AggregatorMetadataServiceDB (PostgreSQL cache).
 * Owner public-file-index remains membership source of truth — see
 * docs/architecture/ADR_AGGREGATOR_METADATA_SOT.md.
 */

