/**
 * Central Metadata Aggregator Client
 * Used by aggregator browsers to query the central index
 * NO Google Drive access needed - just queries the API
 */

import { PublicMetadata } from '../../types/aggregator';
import { API_ENDPOINT } from '../../config/api';

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

const TTL_MS = 60_000; // 60 seconds

export class CentralMetadataAggregator {
  private static readonly CENTRAL_INDEX_PATH = '/api/aggregator/metadata-index';
  private static readonly CACHE_KEY = 'pn_central_metadata_index';
  private static readonly CACHE_VERSION_KEY = 'pn_central_metadata_index_version';
  private static pendingRequests = new Map<string, Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }>>();
  private static ttlCache = new Map<string, { files: CentralIndexEntry[]; total: number; hasMore: boolean; ts: number }>();

  /**
   * Clear the localStorage cache
   */
  static clearCache(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY);
      localStorage.removeItem(this.CACHE_VERSION_KEY);
      console.log('✅ [CentralMetadataAggregator] Cache cleared');
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }


  /**
   * Fetch aggregated public metadata from central service
   * Called by aggregator browsers - queries the central API
   * NO CACHE - always fetches fresh data
   * Includes request deduplication to prevent duplicate simultaneous calls
   */
  static async fetchAggregatedIndex(
    filters?: { 
      tags?: string[]; 
      fileType?: string; 
      contentClass?: 'media' | 'thought' | 'collection';
      authorDid?: string;
      limit?: number;      // SCALABILITY: Pagination support
      offset?: number;     // SCALABILITY: Pagination support
    },
    forceRefresh: boolean = false
  ): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const requestKey = JSON.stringify({ ...filters, limit: filters?.limit, offset: filters?.offset });

    // TTL cache: return recent result without hitting the network
    if (!forceRefresh) {
      const cached = this.ttlCache.get(requestKey);
      if (cached && Date.now() - cached.ts < TTL_MS) {
        return { files: cached.files, total: cached.total, hasMore: cached.hasMore };
      }
    }

    // Deduplicate in-flight requests
    if (!forceRefresh && this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    const requestPromise = this._fetchWithRetry(filters).then((res) => {
      if (!forceRefresh) {
        this.ttlCache.set(requestKey, { ...res, ts: Date.now() });
      }
      return res;
    });

    this.pendingRequests.set(requestKey, requestPromise);
    requestPromise.finally(() => {
      this.pendingRequests.delete(requestKey);
    });

    return requestPromise;
  }
  
  /**
   * Internal method to fetch with exponential backoff retry for 429 errors
   */
  private static async _fetchWithRetry(
    filters?: { 
      tags?: string[]; 
      fileType?: string; 
      contentClass?: 'media' | 'thought' | 'collection';
      authorDid?: string;
      limit?: number;
      offset?: number;
    },
    retryCount: number = 0
  ): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    try {
      // Query par Noir API backend
      const params = new URLSearchParams();
      if (filters?.tags) params.append('tags', filters.tags.join(','));
      // Only use contentClass - fileType is for rendering, not filtering
      if (filters?.contentClass) {
        params.append('contentClass', filters.contentClass);
      }
      if (filters?.authorDid) params.append('authorDid', filters.authorDid);
      if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());      // SCALABILITY: Pagination
      if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());    // SCALABILITY: Pagination

      // Removed verbose logging - only log errors

      const response = await fetch(
        `${API_ENDPOINT}${this.CENTRAL_INDEX_PATH}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data: CentralIndexResponse & { total?: number; hasMore?: boolean } = await response.json();
        
        // Warn if NSFW files are found in public index (should never happen)
        if (data.files && data.files.length > 0) {
          data.files.forEach((file: any) => {
            const metadata = file.metadata || {};
            const isNSFW = metadata.isNSFW;
            if (isNSFW === true || String(isNSFW).toLowerCase() === 'true') {
              console.error(`❌ [CentralMetadataAggregator] NSFW file in PUBLIC index: ${file.file_id || metadata.fileId}`);
            }
          });
        }
        
        return {
          files: data.files || [],
          total: data.totalFiles || data.total || 0,
          hasMore: data.hasMore || false
        };
      } else if (response.status === 429 && retryCount < maxRetries) {
        // Rate limited - retry with exponential backoff
        const delay = baseDelay * Math.pow(2, retryCount);
        console.warn(`⏳ [CentralMetadataAggregator] Rate limited (429), retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._fetchWithRetry(filters, retryCount + 1);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ [CentralMetadataAggregator] API returned ${response.status}:`, errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [CentralMetadataAggregator] Failed to fetch from API:', errorMessage);
      // Return empty result - no fallback cache
      return { files: [], total: 0, hasMore: false };
    }
  }


  /**
   * Fetch NSFW metadata index from central service
   * Only callable by users with age ZKP and over 18
   * Same structure as public index but filters for NSFW content
   */
  static async fetchNSFWIndex(
    filters?: { 
      tags?: string[]; 
      fileType?: string; 
      contentClass?: string;
      authorDid?: string;
      limit?: number;      // SCALABILITY: Pagination support
      offset?: number;     // SCALABILITY: Pagination support
    },
    forceRefresh: boolean = false
  ): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    // Create a unique key for this request to deduplicate (include pagination params)
    const requestKey = `nsfw-${JSON.stringify({ ...filters, limit: filters?.limit, offset: filters?.offset })}`;
    
    // If there's already a pending request with the same filters and pagination, return it
    if (!forceRefresh && this.pendingRequests.has(requestKey)) {
      console.log('⏸️ [CentralMetadataAggregator] NSFW request already in progress, reusing promise');
      return this.pendingRequests.get(requestKey)!;
    }
    
    // Create the request promise
    const requestPromise = this._fetchNSFWWithRetry(filters);
    
    // Store it for deduplication
    this.pendingRequests.set(requestKey, requestPromise);
    
    // Clean up after request completes
    requestPromise.finally(() => {
      this.pendingRequests.delete(requestKey);
    });
    
    return requestPromise;
  }

  /**
   * Internal method to fetch NSFW index with exponential backoff retry for 429 errors
   */
  private static async _fetchNSFWWithRetry(
    filters?: { 
      tags?: string[]; 
      fileType?: string; 
      contentClass?: string;
      authorDid?: string;
      limit?: number;
      offset?: number;
    },
    retryCount: number = 0
  ): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    try {
      // Query NSFW index endpoint
      const params = new URLSearchParams();
      if (filters?.tags) params.append('tags', filters.tags.join(','));
      if (filters?.contentClass) params.append('contentClass', filters.contentClass);
      if (filters?.authorDid) params.append('authorDid', filters.authorDid);
      if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());      // SCALABILITY: Pagination
      if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());    // SCALABILITY: Pagination

      const nsfwIndexPath = '/api/aggregator/nsfw-index';
      // Removed verbose logging - only log errors

      const response = await fetch(
        `${API_ENDPOINT}${nsfwIndexPath}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data: CentralIndexResponse & { total?: number; hasMore?: boolean } = await response.json();
        // Removed verbose success logging
        return {
          files: data.files || [],
          total: data.totalFiles || data.total || 0,
          hasMore: data.hasMore || false
        };
      } else if (response.status === 429 && retryCount < maxRetries) {
        // Rate limited - retry with exponential backoff
        const delay = baseDelay * Math.pow(2, retryCount);
        console.warn(`⏳ [CentralMetadataAggregator] NSFW index rate limited (429), retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._fetchNSFWWithRetry(filters, retryCount + 1);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ [CentralMetadataAggregator] NSFW index API returned ${response.status}:`, errorText);
        // Return empty result if 403/401 (not eligible) or other errors
        return { files: [], total: 0, hasMore: false };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [CentralMetadataAggregator] Failed to fetch NSFW index from API:', errorMessage);
      // Return empty result - no fallback cache
      return { files: [], total: 0, hasMore: false };
    }
  }
}

