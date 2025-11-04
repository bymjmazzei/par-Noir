/**
 * Metadata Index Service (Aggregator Browser)
 * Accesses metadata index from Google Drive via par Noir's licensed authentication
 */

import {
  PublicMetadata,
  MetadataFilters,
  IndexedFile
} from '../../types/aggregator';

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
   * - Queries central aggregator service (api.parnoir.com)
   * - No Google Drive access needed - aggregators just query the API
   */
  async discoverFiles(filters?: MetadataFilters): Promise<IndexedFile[]> {
    try {
      await this.ensureInitialized();

      // Query central aggregator service
      const { CentralMetadataAggregator } = await import('../storage/CentralMetadataAggregator');
      
      const aggregatedEntries = await CentralMetadataAggregator.fetchAggregatedIndex({
        tags: filters?.tags,
        fileType: filters?.fileType,
        authorDid: filters?.authorDid
      });

      // Transform to IndexedFile format
      const files: IndexedFile[] = aggregatedEntries
        .filter(entry => entry.metadata.isPublic)
        .map(entry => ({
          metadata: entry.metadata,
          thumbnail: entry.metadata.thumbnail
        }));

      // Apply date range filter if provided (not supported by API yet)
      if (filters?.dateRange) {
          const from = new Date(filters.dateRange.from);
          const to = new Date(filters.dateRange.to);
        return files.filter(file => {
            const uploadDate = new Date(file.metadata.uploadDate);
            return uploadDate >= from && uploadDate <= to;
          });
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
      await this.loadIndexFromGoogleDrive();
      return this.metadataStore.get(fileId) || null;
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

  // NOTE: Removed Google Drive scanning - aggregators now query central API
  // No Google Drive access needed for aggregators
}

// Singleton instance
let metadataIndexServiceInstance: MetadataIndexService | null = null;

export function getMetadataIndexService(): MetadataIndexService {
  if (!metadataIndexServiceInstance) {
    metadataIndexServiceInstance = new MetadataIndexService();
  }
  return metadataIndexServiceInstance;
}
