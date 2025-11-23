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
  private static readonly CACHE_KEY = 'pn_central_metadata_index';
  private static readonly CACHE_VERSION_KEY = 'pn_central_metadata_index_version';
  private static readonly CACHE_VERSION = '1.0'; // Increment when cache format changes
  private static pendingRequests = new Map<string, Promise<CentralIndexEntry[]>>(); // Request deduplication

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
   * Check if cache is stale (older than 1 hour)
   */
  private static isCacheStale(): boolean {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return true;

      const indexData: CentralIndexResponse = JSON.parse(cached);
      if (!indexData.updatedAt) return true;

      const cacheAge = Date.now() - new Date(indexData.updatedAt).getTime();
      const oneHour = 60 * 60 * 1000;
      return cacheAge > oneHour;
    } catch {
      return true;
    }
  }

  /**
   * Fetch aggregated public metadata from central service
   * Called by aggregator browsers - queries the central API
   * NO CACHE - always fetches fresh data
   * Includes request deduplication to prevent duplicate simultaneous calls
   */
  static async fetchAggregatedIndex(
    filters?: { tags?: string[]; fileType?: string; authorDid?: string },
    forceRefresh: boolean = false
  ): Promise<CentralIndexEntry[]> {
    // Create a unique key for this request to deduplicate
    const requestKey = JSON.stringify(filters || {});
    
    // If there's already a pending request with the same filters, return it
    if (!forceRefresh && this.pendingRequests.has(requestKey)) {
      console.log('⏸️ [CentralMetadataAggregator] Request already in progress, reusing promise');
      return this.pendingRequests.get(requestKey)!;
    }
    
    // Create the request promise
    const requestPromise = this._fetchWithRetry(filters);
    
    // Store it for deduplication
    this.pendingRequests.set(requestKey, requestPromise);
    
    // Clean up after request completes
    requestPromise.finally(() => {
      this.pendingRequests.delete(requestKey);
    });
    
    return requestPromise;
  }
  
  /**
   * Internal method to fetch with exponential backoff retry for 429 errors
   */
  private static async _fetchWithRetry(
    filters?: { tags?: string[]; fileType?: string; authorDid?: string },
    retryCount: number = 0
  ): Promise<CentralIndexEntry[]> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    try {
      // Query par Noir API backend
      const params = new URLSearchParams();
      if (filters?.tags) params.append('tags', filters.tags.join(','));
      if (filters?.fileType) params.append('fileType', filters.fileType);
      if (filters?.authorDid) params.append('authorDid', filters.authorDid);

      console.log(`🔍 [CentralMetadataAggregator] Fetching from API: ${this.API_ENDPOINT}${this.CENTRAL_INDEX_PATH}`);

      const response = await fetch(
        `${this.API_ENDPOINT}${this.CENTRAL_INDEX_PATH}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data: CentralIndexResponse = await response.json();
        console.log(`✅ [CentralMetadataAggregator] Received ${data.files?.length || 0} files from API`);
        
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
        
        return data.files || [];
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
      // Return empty array - no fallback cache
      return [];
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
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) {
        console.log('ℹ️ No cached metadata found');
        return [];
      }

      const indexData: CentralIndexResponse = JSON.parse(cached);
      let files = indexData.files || [];
      
      console.log(`ℹ️ Using cached metadata: ${files.length} files`);

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

  /**
   * Fetch NSFW metadata index from central service
   * Only callable by users with age ZKP and over 18
   * Same structure as public index but filters for NSFW content
   */
  static async fetchNSFWIndex(
    filters?: { tags?: string[]; fileType?: string; authorDid?: string },
    forceRefresh: boolean = false
  ): Promise<CentralIndexEntry[]> {
    // Create a unique key for this request to deduplicate
    const requestKey = `nsfw-${JSON.stringify(filters || {})}`;
    
    // If there's already a pending request with the same filters, return it
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
    filters?: { tags?: string[]; fileType?: string; authorDid?: string },
    retryCount: number = 0
  ): Promise<CentralIndexEntry[]> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    try {
      // Query NSFW index endpoint
      const params = new URLSearchParams();
      if (filters?.tags) params.append('tags', filters.tags.join(','));
      if (filters?.fileType) params.append('fileType', filters.fileType);
      if (filters?.authorDid) params.append('authorDid', filters.authorDid);

      const nsfwIndexPath = '/api/aggregator/nsfw-index';
      console.log(`🔍 [CentralMetadataAggregator] Fetching NSFW index from API: ${this.API_ENDPOINT}${nsfwIndexPath}`);

      const response = await fetch(
        `${this.API_ENDPOINT}${nsfwIndexPath}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data: CentralIndexResponse = await response.json();
        console.log(`✅ [CentralMetadataAggregator] Received ${data.files?.length || 0} NSFW files from API`);
        return data.files || [];
      } else if (response.status === 429 && retryCount < maxRetries) {
        // Rate limited - retry with exponential backoff
        const delay = baseDelay * Math.pow(2, retryCount);
        console.warn(`⏳ [CentralMetadataAggregator] NSFW index rate limited (429), retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._fetchNSFWWithRetry(filters, retryCount + 1);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ [CentralMetadataAggregator] NSFW index API returned ${response.status}:`, errorText);
        // Return empty array if 403/401 (not eligible) or other errors
        return [];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [CentralMetadataAggregator] Failed to fetch NSFW index from API:', errorMessage);
      // Return empty array - no fallback cache
      return [];
    }
  }
}

