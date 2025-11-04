/**
 * Central Metadata Aggregator Client
 * Used by aggregator browsers to query the central index
 * NO Google Drive access needed - just queries the API
 */

import { PublicMetadata } from '../../types/aggregator';

export interface CentralIndexEntry {
  fileId: string;
  metadata: PublicMetadata;
  submittedAt: string;
  pnIdentifier: string;
}

export interface CentralIndexResponse {
  files: CentralIndexEntry[];
  updatedAt: string;
  totalFiles: number;
}

export class CentralMetadataAggregator {
  private static readonly API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
  private static readonly CENTRAL_INDEX_PATH = '/api/aggregator/metadata-index';

  /**
   * Fetch aggregated public metadata from central service
   * Called by aggregator browsers (no Google Drive access needed)
   */
  static async fetchAggregatedIndex(
    filters?: { tags?: string[]; fileType?: string; authorDid?: string }
  ): Promise<CentralIndexEntry[]> {
    try {
      // Query par Noir API backend
      const params = new URLSearchParams();
      if (filters?.tags) params.append('tags', filters.tags.join(','));
      if (filters?.fileType) params.append('fileType', filters.fileType);
      if (filters?.authorDid) params.append('authorDid', filters.authorDid);

      const response = await fetch(
        `${this.API_ENDPOINT}${this.CENTRAL_INDEX_PATH}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            // TODO: Add par Noir license token for licensed aggregators
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data: CentralIndexResponse = await response.json();
        return data.files || [];
      } else if (response.status === 404) {
        // API not implemented yet - fallback to localStorage cache
        console.log('ℹ️ Central aggregator API not yet implemented, using localStorage cache');
        return this.fetchFromLocalStorageCache(filters);
      } else {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (error) {
      console.warn('⚠️ Central aggregator API not available, using localStorage cache:', error);
      return this.fetchFromLocalStorageCache(filters);
    }
  }

  /**
   * Fallback: Fetch from localStorage cache
   * This is populated when dashboard submits metadata
   */
  private static fetchFromLocalStorageCache(
    filters?: { tags?: string[]; fileType?: string; authorDid?: string }
  ): CentralIndexEntry[] {
    try {
      const cached = localStorage.getItem('pn_central_metadata_index');
      if (!cached) {
        return [];
      }

      const indexData: CentralIndexResponse = JSON.parse(cached);
      let files = indexData.files || [];

      // Apply filters
      if (filters) {
        if (filters.tags && filters.tags.length > 0) {
          files = files.filter(f => {
            const keywords = f.metadata.keywords || f.metadata.tags || [];
            return keywords.some(tag => filters.tags!.includes(tag));
          });
        }
        if (filters.fileType) {
          files = files.filter(f => f.metadata.fileType === filters.fileType);
        }
        if (filters.authorDid) {
          files = files.filter(f => {
            // Support both new creator structure and legacy author structure
            const did = f.metadata.creator?.identifier?.value || 
                       f.metadata.creator?.["@id"] || 
                       f.metadata.author?.did;
            return did === filters.authorDid;
          });
        }
      }

      return files;
    } catch (error) {
      console.warn('Failed to load cached index:', error);
      return [];
    }
  }
}

