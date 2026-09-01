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
import { mapCentralIndexEntryToIndexedFile } from './mapCentralIndexEntry';

export interface MetadataIndexResult {
  success: boolean;
  error?: string;
  cid?: string;
}

export class MetadataIndexService {
  private isInitialized = false;

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
    filters?: MetadataFilters & { limit?: number; offset?: number; indexerId?: string }, 
    forceRefresh: boolean = false
  ): Promise<IndexedFile[] | { files: IndexedFile[]; total: number; hasMore: boolean }> {
    try {
      await this.ensureInitialized();

      // Query central aggregator API
      const { CentralMetadataAggregator } = await import('../storage/CentralMetadataAggregator');
      
      const result = await CentralMetadataAggregator.fetchAggregatedIndex({
        tags: filters?.tags,
        contentClass: filters?.contentClass,
        authorDid: filters?.authorDid,
        indexerId: filters?.indexerId,
        limit: filters?.limit,      // SCALABILITY: Pagination support
        offset: filters?.offset      // SCALABILITY: Pagination support
      }, forceRefresh);

      // Transform to IndexedFile format
      // result.files are CentralIndexEntry objects from the API
      // Backend already filters for public files (isPublic = 'true' or isPublic = true)
      // So we just use what the backend returns - no additional filtering needed
      let files: IndexedFile[] = result.files;
      files = files.map((entry: any) => mapCentralIndexEntryToIndexedFile(entry) as IndexedFile);

      // Apply filters
      const beforeFilters = files.length;
      if (filters) {
        if (filters.tags && filters.tags.length > 0) {
          files = files.filter(file => {
            const keywords = file.metadata.keywords || file.metadata.tags || [];
            return keywords.some(tag => filters.tags!.includes(tag));
          });
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
          // Map feedId to contentClass - we have content class indices, use them!
          const feedIdToContentClass: Record<string, 'media' | 'thought' | 'collection'> = {
            'media': 'media',
            'thoughts': 'thought',
            'collections': 'collection'
          };
          const contentClass = feedIdToContentClass[filters.feedId];
          if (contentClass) {
            files = files.filter(file => {
              const fileContentClass = (file.metadata as any).contentClass;
              return fileContentClass === contentClass;
            });
          } else {
            // Fallback to old feedIds array check for custom feeds only
            files = files.filter(file => {
              const fileFeedIds = file.metadata.feedIds || [];
              return fileFeedIds.includes(filters.feedId!);
            });
          }
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
      
      // After all filters - only log relevant filters (exclude fileType since it's not used for filtering)
      if (beforeFilters > files.length) {
        const relevantFilters = { ...filters };
        delete relevantFilters.fileType; // fileType is only for rendering, not filtering
        console.log(`⚠️ [MetadataIndexService] Filtered out ${beforeFilters - files.length} files due to filters:`, relevantFilters);
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
      const result = await this.discoverFiles();
      const files = Array.isArray(result) ? result : result.files;
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

}

// Singleton instance
let metadataIndexServiceInstance: MetadataIndexService | null = null;

export function getMetadataIndexService(): MetadataIndexService {
  if (!metadataIndexServiceInstance) {
    metadataIndexServiceInstance = new MetadataIndexService();
  }
  return metadataIndexServiceInstance;
}
