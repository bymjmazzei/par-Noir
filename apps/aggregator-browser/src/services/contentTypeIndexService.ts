/**
 * Content Type Index Service
 * 
 * Manages separate indices for each content type (media, thoughts, collections).
 * Queries the API with contentClass filters and applies contentClass-based filtering.
 */

import { IndexedFile, MetadataFilters } from '../types/aggregator';
import { getMetadataIndexService } from './metadata/MetadataIndexService';
import { ContentType } from '../types/contentTypes';

export class ContentTypeIndexService {
  private mediaIndex: IndexedFile[] = [];
  private thoughtsIndex: IndexedFile[] = [];
  private collectionsIndex: IndexedFile[] = [];
  private lastUpdated: Map<ContentType, number> = new Map();
  
  /**
   * Load a content-type index from the API
   * Uses contentClass parameter to query and filter files.
   * When limit/offset are passed, returns { files, hasMore } for pagination.
   */
  async loadContentTypeIndex(
    contentType: ContentType,
    filters?: MetadataFilters & { limit?: number; offset?: number },
    forceRefresh: boolean = false
  ): Promise<{ files: IndexedFile[]; hasMore: boolean }> {
    const metadataService = getMetadataIndexService();

    // Map ContentType to contentClass for API query
    const contentClassMap: Record<ContentType, 'media' | 'thought' | 'collection'> = {
      'media': 'media',
      'thoughts': 'thought',
      'collections': 'collection'
    };
    const contentClass = contentClassMap[contentType];

    // Query API with contentClass and optional limit/offset
    const result = await metadataService.discoverFiles(
      { contentClass, limit: filters?.limit, offset: filters?.offset },
      forceRefresh
    );

    const files = Array.isArray(result) ? result : result.files;
    const hasMore = Array.isArray(result) ? true : (result.hasMore ?? false);

    // Update in-memory index with the fetched slice
    this[`${contentType}Index`] = files;
    this.lastUpdated.set(contentType, Date.now());

    return { files, hasMore };
  }
  
  
  /**
   * Get a content-type index
   */
  getContentTypeIndex(contentType: ContentType): IndexedFile[] {
    return this[`${contentType}Index`];
  }
  
  /**
   * Combine multiple content-type indices
   */
  combineIndices(contentTypes: ContentType[]): IndexedFile[] {
    const combined: IndexedFile[] = [];
    for (const contentType of contentTypes) {
      combined.push(...this.getContentTypeIndex(contentType));
    }
    return combined;
  }
  
  /**
   * Get last updated timestamp for a content type
   */
  getLastUpdated(contentType: ContentType): number | undefined {
    return this.lastUpdated.get(contentType);
  }
  
  /**
   * Clear all indices (useful for refresh)
   */
  clearIndices(): void {
    this.mediaIndex = [];
    this.thoughtsIndex = [];
    this.collectionsIndex = [];
    this.lastUpdated.clear();
  }
}

