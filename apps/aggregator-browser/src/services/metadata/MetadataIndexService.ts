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
   */
  async discoverFiles(filters?: MetadataFilters, forceRefresh: boolean = false): Promise<IndexedFile[]> {
    try {
      await this.ensureInitialized();

      // Query central aggregator API
      const { CentralMetadataAggregator } = await import('../storage/CentralMetadataAggregator');
      
      const aggregatedEntries = await CentralMetadataAggregator.fetchAggregatedIndex({
        tags: filters?.tags,
        fileType: filters?.fileType,
        authorDid: filters?.authorDid
      }, forceRefresh);

      // Transform to IndexedFile format
      // aggregatedEntries are CentralIndexEntry objects from the API
      // Backend already filters for public files, so we trust what the API returns
      // But we also check: isPublic !== false OR has publicToken (means it's meant to be public)
      // Processing entries from API (logging removed - was too verbose)
      
      let files: IndexedFile[] = aggregatedEntries
        .filter((entry: any) => {
          const metadata = entry.metadata || {};
          const isPublic = metadata.isPublic;
          const hasPublicToken = metadata.publicToken != null;
          
          // Include if: isPublic is true/undefined/null OR has publicToken
          const shouldInclude = isPublic !== false || hasPublicToken;
          
          return shouldInclude;
        })
        .map((entry: any) => {
          // Normalize pnIdentifier - remove "pn-" prefix if present
          const pnId = entry.pnIdentifier;
          const normalizedPnId = pnId && pnId.startsWith('pn-') ? pnId.substring(3) : pnId;
          
          // Preserve textPost and thought data from metadata
          const metadata = entry.metadata || {};
          
          // Debug logging removed for cleaner console - uncomment if needed for debugging
          // if (metadata.fileType === 'text') {
          //   console.log('[MetadataIndexService] Text file from API:', {...});
          // }
          
          return {
            metadata: {
              ...metadata,
              // Explicitly preserve textPost and thought fields
              textPost: metadata.textPost || metadata.thought,
              thought: metadata.thought || metadata.textPost,
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
      
      // After initial filtering (logging removed - was too verbose)

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
   */
  private getFileTypeFromMime(mimeType: string): string {
    if (!mimeType) return 'other';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
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
