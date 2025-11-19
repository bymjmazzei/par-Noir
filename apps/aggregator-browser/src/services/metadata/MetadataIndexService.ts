/**
 * Metadata Index Service (Aggregator Browser)
 * Accesses metadata index from Google Drive via par Noir's licensed authentication
 */

import {
  PublicMetadata,
  MetadataFilters,
  IndexedFile,
  ContentRating
} from '../../types/aggregator';
import { isRatingAcceptable, RATING_ORDER } from '../../constants/contentRatings';

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
      console.log(`🔍 [MetadataIndexService] Processing ${aggregatedEntries.length} entries from API`);
      
      let files: IndexedFile[] = aggregatedEntries
        .filter((entry: any) => {
          const metadata = entry.metadata || {};
          const isPublic = metadata.isPublic;
          const hasPublicToken = metadata.publicToken != null;
          
          // Debug logging for first entry
          if (aggregatedEntries.indexOf(entry) === 0) {
            console.log('🔍 [MetadataIndexService] Sample entry:', {
              fileId: metadata.fileId,
              isPublic,
              hasPublicToken,
              name: metadata.name
            });
          }
          
          // Include if: isPublic is true/undefined/null OR has publicToken
          const shouldInclude = isPublic !== false || hasPublicToken;
          
          if (!shouldInclude && aggregatedEntries.indexOf(entry) < 3) {
            console.log(`⚠️ [MetadataIndexService] Filtered out entry:`, {
              fileId: metadata.fileId,
              isPublic,
              hasPublicToken
            });
          }
          
          return shouldInclude;
        })
        .map((entry: any) => ({
          metadata: {
            ...entry.metadata,
            // Use pnIdentifier as creatorId - they're the same thing
            creatorId: entry.pnIdentifier || entry.metadata.creatorId
          },
          thumbnail: entry.metadata?.thumbnail
        }));
      
      console.log(`✅ [MetadataIndexService] After initial filtering: ${files.length} files`);

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
        
        // Rating filters
        if (filters.maxRating) {
          files = files.filter(file => {
            const fileRating = file.metadata.contentRating;
            // If file has no rating, include it (assume safe default)
            // Only filter out if file has a rating that exceeds user's preference
            if (!fileRating) return true; // No rating = include (changed from exclude)
            return isRatingAcceptable(fileRating, filters.maxRating!);
          });
        }
        
        if (filters.excludeRatings && filters.excludeRatings.length > 0) {
          files = files.filter(file => {
            const fileRating = file.metadata.contentRating;
            if (!fileRating) return true; // No rating = include
            return !filters.excludeRatings!.includes(fileRating);
          });
        }
        
        if (filters.warningTags && filters.warningTags.length > 0) {
          files = files.filter(file => {
            const fileWarnings = file.metadata.warningTags || [];
            return filters.warningTags!.some(tag => fileWarnings.includes(tag));
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
      
      console.log(`✅ [MetadataIndexService] After all filters: ${files.length} files (was ${beforeFilters} before filters)`);
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
