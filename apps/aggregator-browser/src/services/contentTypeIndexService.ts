/**
 * Content Type Index Service
 * 
 * Manages separate indices for each content type (media, thoughts, collections).
 * Queries the API with contentClass filters and applies contentClass-based filtering.
 */

import { IndexedFile, MetadataFilters } from '../types/aggregator';
import { getMetadataIndexService } from './metadata/MetadataIndexService';
import { ContentType, CONTENT_TYPE_MAP, ContentTypeConfig } from '../types/contentTypes';

export class ContentTypeIndexService {
  private mediaIndex: IndexedFile[] = [];
  private thoughtsIndex: IndexedFile[] = [];
  private collectionsIndex: IndexedFile[] = [];
  private lastUpdated: Map<ContentType, number> = new Map();
  
  /**
   * Load a content-type index from the API
   * Uses contentClass parameter to query and filter files
   */
  async loadContentTypeIndex(
    contentType: ContentType,
    filters?: MetadataFilters & { limit?: number; offset?: number },
    forceRefresh: boolean = false
  ): Promise<IndexedFile[]> {
    const config = CONTENT_TYPE_MAP[contentType];
    const metadataService = getMetadataIndexService();
    
    // Map ContentType to contentClass for API query
    const contentClassMap: Record<ContentType, 'media' | 'thought' | 'collection'> = {
      'media': 'media',
      'thoughts': 'thought',
      'collections': 'collection'
    };
    const contentClass = contentClassMap[contentType];
    
    // Query API using contentClass (preferred approach)
    const result = await metadataService.discoverFiles({
      ...filters,
      contentClass,
    }, forceRefresh);
    
    const allFiles = Array.isArray(result) ? result : result.files;
    
    // Apply contentClass-based filtering
    const filtered = this.filterForContentType(allFiles, contentType, config);
    
    // Update index
    this[`${contentType}Index`] = filtered;
    this.lastUpdated.set(contentType, Date.now());
    
    return filtered;
  }
  
  /**
   * Filter files based on contentClass
   */
  private filterForContentType(
    files: IndexedFile[],
    contentType: ContentType,
    config: ContentTypeConfig // Kept for interface compatibility, not used
  ): IndexedFile[] {
    const expectedContentClass = contentType === 'thoughts' ? 'thought' : contentType === 'collections' ? 'collection' : 'media';
    return files.filter(file => {
      const fileContentClass = (file.metadata as any).contentClass;
      return fileContentClass === expectedContentClass;
    });
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

