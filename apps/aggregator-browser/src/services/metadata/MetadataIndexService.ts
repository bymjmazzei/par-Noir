/**
 * Metadata Index Service (Aggregator Browser)
 * Accesses metadata index from Google Drive via par Noir's licensed authentication
 */

import {
  PublicMetadata,
  MetadataFilters,
  IndexedFile
} from '../../types/aggregator';
import { isNSFWContent } from '../../constants/contentRatings';

export interface MetadataIndexResult {
  success: boolean;
  error?: string;
  cid?: string;
}

export class MetadataIndexService {
  private isInitialized = false;
  private metadataStore: Map<string, PublicMetadata> = new Map();

  /**
   * Initialize the metadata index service
   * Aggregators query central API - no Google Drive access needed
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Aggregators don't need to load anything here - discoverFiles() queries the API on demand
      // This ensures we always get the latest aggregated index
      this.isInitialized = true;
    } catch (error) {
      console.warn('Metadata index initialization failed:', error);
      // Continue anyway - queries will happen on demand
      this.isInitialized = true;
    }
  }

  /**
   * Discover public files based on filters
   * Used by aggregators to find content
   * 
   * ARCHITECTURE:
   * - Queries central aggregator API (api.parnoir.com)
   * - NO CACHE - always fetches fresh data from API
   * - SCALABILITY: Supports pagination via limit/offset parameters
   */
  async discoverFiles(
    filters?: MetadataFilters & { limit?: number; offset?: number }, 
    forceRefresh: boolean = false
  ): Promise<IndexedFile[] | { files: IndexedFile[]; total: number; hasMore: boolean }> {
    try {
      await this.ensureInitialized();

      // Query central aggregator API
      const { CentralMetadataAggregator } = await import('../storage/CentralMetadataAggregator');
      
      const result = await CentralMetadataAggregator.fetchAggregatedIndex({
        tags: filters?.tags,
        fileType: filters?.fileType,
        contentClass: filters?.contentClass,
        authorDid: filters?.authorDid,
        limit: filters?.limit,      // SCALABILITY: Pagination support
        offset: filters?.offset      // SCALABILITY: Pagination support
      }, forceRefresh);

      // Transform to IndexedFile format
      // result.files are CentralIndexEntry objects from the API
      // Backend already filters for public files, so we trust what the API returns
      // But we also check: isPublic !== false OR has publicToken (means it's meant to be public)
      let files: IndexedFile[] = result.files
        .filter((entry: any) => {
          const metadata = entry.metadata || {};
          const isPublic = metadata.isPublic;
          const hasPublicToken = metadata.publicToken != null;
          
          // Include if: isPublic is true/undefined/null OR has publicToken
          const shouldInclude = isPublic !== false || hasPublicToken;
          
          // Debug logging for thoughts (only in development)
          if (process.env.NODE_ENV === 'development') {
            const fileType = metadata.fileType;
            const hasTextPost = !!(metadata.textPost || metadata.thought);
            const fileName = metadata.name || metadata.title || '';
            const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(fileName);
            if (fileType === 'text' || fileType === 'thought' || hasTextPost || isThoughtFile) {
              if (!shouldInclude) {
                console.warn(`[MetadataIndexService] Thought excluded: ${entry.fileId}`, {
                  isPublic,
                  hasPublicToken,
                  fileType,
                  hasTextPost,
                  fileName
                });
              }
            }
          }
          
          return shouldInclude;
        });
      files = files.map((entry: any) => {
          // Normalize pnIdentifier - remove "pn-" prefix if present
          const pnId = entry.pnIdentifier;
          const normalizedPnId = pnId && pnId.startsWith('pn-') ? pnId.substring(3) : pnId;
          
          // Preserve textPost and thought data from metadata
          const metadata = entry.metadata || {};
          
          // Debug logging removed for cleaner console - uncomment if needed for debugging
          // if (metadata.fileType === 'text') {
          //   console.log('[MetadataIndexService] Text file from API:', {...});
          // }
          
          // Determine if this is a thumbnail file (should NOT have textPost/thought data)
          const fileName = metadata.name || metadata.title || '';
          const isThumbnailFile = fileName.toLowerCase().startsWith('thumb_');
          
          // DEBUG: Log collection data from API
          if (metadata.fileType === 'collection' || metadata.collection) {
            // If collection data is missing, try to fetch it separately
            if (metadata.fileType === 'collection' && !metadata.collection) {
              console.warn(`[MetadataIndexService] Collection file ${metadata.fileId || entry.fileId} has fileType='collection' but no collection data in metadata!`);
              console.warn(`[MetadataIndexService] This collection data needs to be fetched separately or is missing from the API response.`);
            }
          }
          
          return {
            metadata: {
              ...metadata,
              // CRITICAL FIX: Ensure fileId is set from entry-level fileId if missing in metadata
              // This handles cases where metadata.fileId might be missing after upgrade
              fileId: metadata.fileId || entry.fileId,
              // Explicitly preserve title field (cleaned display name) - prioritize over name
              // title is cleaned (no thumb_ prefix, no extension), name has thumb_ prefix for query matching
              title: metadata.title || metadata.name || undefined,
              // Explicitly preserve fileType (especially important for collections)
              fileType: metadata.fileType || undefined,
              // Explicitly preserve textPost and thought fields (but NOT for thumbnails - they're just images)
              // FIX: Ensure both textPost and thought are preserved even if one is missing
              // NOTE: Thumbnail files should NOT have textPost/thought data - they're just images
              textPost: isThumbnailFile ? undefined : (metadata.textPost || metadata.thought || undefined),
              thought: isThumbnailFile ? undefined : (metadata.thought || metadata.textPost || undefined),
              // Preserve collection data for collections (CRITICAL for collection slideshow rendering)
              // IMPORTANT: Don't use || undefined - preserve null/empty objects if they exist
              collection: metadata.collection !== undefined ? metadata.collection : undefined,
              // Use normalized pnIdentifier as creatorId - they're the same thing
              creatorId: normalizedPnId || metadata.creatorId,
              // Include publicToken from entry level if it exists (API may return it at entry level)
              publicToken: entry.publicToken || metadata.publicToken
            },
            thumbnail: metadata.thumbnail,
            // Also include publicToken at IndexedFile level for easier access
            publicToken: entry.publicToken || metadata.publicToken,
            // Preserve pnIdentifier from API response (use original format, not normalized)
            pnIdentifier: entry.pnIdentifier || normalizedPnId
          };
        });

      // Apply filters
      const beforeFilters = files.length;
      if (filters) {
        if (filters.tags && filters.tags.length > 0) {
          files = files.filter(file => {
            const keywords = file.metadata.keywords || file.metadata.tags || [];
            return keywords.some(tag => filters.tags!.includes(tag));
          });
        }
        if (filters.fileType) {
          files = files.filter(file => file.metadata.fileType === filters.fileType);
        }
        if (filters.authorDid) {
          files = files.filter(file => {
            const did = file.metadata.creator?.identifier?.value || 
                       file.metadata.creator?.["@id"] || 
                       file.metadata.author?.did;
            return did === filters.authorDid;
          });
        }
        if (filters.dateRange) {
          const from = new Date(filters.dateRange.from);
          const to = new Date(filters.dateRange.to);
          files = files.filter(file => {
            const uploadDate = new Date(file.metadata.uploadDate);
            return uploadDate >= from && uploadDate <= to;
          });
        }
        
        // NSFW filter
        if (filters.includeNSFW !== undefined) {
          files = files.filter(file => {
            const isNSFW = isNSFWContent(file.metadata);
            // If includeNSFW is false, exclude NSFW content
            // If includeNSFW is true, include all content (both public and NSFW)
            if (!filters.includeNSFW && isNSFW) {
              return false; // Exclude NSFW content
            }
            return true; // Include public content, and NSFW if includeNSFW is true
          });
        }
        
        // Feed filters
        if (filters.feedId) {
          files = files.filter(file => {
            const fileFeedIds = file.metadata.feedIds || [];
            return fileFeedIds.includes(filters.feedId!);
          });
        }
        
        if (filters.feedCategory) {
          files = files.filter(file => {
            const fileCategories = file.metadata.feedCategories || [];
            return fileCategories.includes(filters.feedCategory!);
          });
        }
        
        if (filters.creatorTier) {
          files = files.filter(file => {
            return file.metadata.creatorTier === filters.creatorTier;
          });
        }
      }
      
      // After all filters (logging removed - was too verbose)
      if (beforeFilters > files.length) {
        console.log(`⚠️ [MetadataIndexService] Filtered out ${beforeFilters - files.length} files due to filters:`, filters);
      }

      // SCALABILITY: Return pagination info if pagination params were provided
      if (filters?.limit !== undefined || filters?.offset !== undefined) {
        return {
          files,
          total: result.total,
          hasMore: result.hasMore
        };
      }

      // Backward compatibility: return array if no pagination params
      return files;
    } catch (error) {
      console.error('Failed to discover files:', error);
      return [];
    }
  }

  /**
   * Get metadata for a specific file
   */
  async getFileMetadata(fileId: string): Promise<PublicMetadata | null> {
    try {
      await this.ensureInitialized();
      // Scan Google Drive for the file
      const files = await this.discoverFiles();
      const found = files.find(f => f.metadata.fileId === fileId);
      return found ? found.metadata : null;
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      return null;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Helper to determine file type from MIME type
   * Matches backend logic for consistency
   */
  private getFileTypeFromMime(mimeType: string): string {
    if (!mimeType) return 'other';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('text')) return 'text'; // Text MIME types map to 'text' fileType
    return 'other';
  }
}

// Singleton instance
let metadataIndexServiceInstance: MetadataIndexService | null = null;

export function getMetadataIndexService(): MetadataIndexService {
  if (!metadataIndexServiceInstance) {
    metadataIndexServiceInstance = new MetadataIndexService();
  }
  return metadataIndexServiceInstance;
}
