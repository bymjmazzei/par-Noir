/**
 * Content Type Index Service
 * 
 * Manages separate indices for each content type (media, thoughts, collections).
 * Queries the API with fileType filters and applies content-type specific filtering.
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
   * Uses contentClass parameter (preferred) or falls back to fileType queries (backward compatibility)
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
    
    // Apply content-type specific filtering for edge cases and backward compatibility
    // Primary filter is now contentClass from API, but we still filter for edge cases
    const filtered = this.filterForContentType(allFiles, contentType, config);
    
    // Update index
    this[`${contentType}Index`] = filtered;
    this.lastUpdated.set(contentType, Date.now());
    
    return filtered;
  }
  
  /**
   * Filter files based on content-type specific rules
   * Primary filter is now contentClass from API, but we still apply edge case filters for backward compatibility
   */
  private filterForContentType(
    files: IndexedFile[],
    contentType: ContentType,
    config: ContentTypeConfig
  ): IndexedFile[] {
    return files.filter(file => {
      // Primary filter: check contentClass if available (new approach)
      const fileContentClass = (file.metadata as any).contentClass;
      if (fileContentClass) {
        const expectedContentClass = contentType === 'thoughts' ? 'thought' : contentType === 'collections' ? 'collection' : 'media';
        if (fileContentClass !== expectedContentClass) {
          return false; // contentClass mismatch
        }
      }
      
      // Secondary filters for backward compatibility (files without contentClass)
      // For thoughts: only include thought thumbnails
      if (contentType === 'thoughts' && config.includeOnlyThoughtThumbnails && !fileContentClass) {
        const isThoughtThumbnail = (file.metadata as any).isThoughtThumbnail === true;
        const isThoughtCollectionThumbnail = file.metadata.fileType === 'thought-collection-thumbnail';
        const isThoughtFile = ['thought', 'text'].includes(file.metadata.fileType || '');
        
        // Include if it's a thought thumbnail, thought collection thumbnail, or thought file
        if (!isThoughtThumbnail && !isThoughtCollectionThumbnail && !isThoughtFile) {
          return false;
        }
        
        // Exclude thought collection thumbnails that are part of collections (they appear in the collection, not individually)
        if (isThoughtCollectionThumbnail && (file.metadata as any).isPartOfCollection === true) {
          return false; // These appear in collections, not thoughts feed
        }
      }
      
      // For media: exclude thought thumbnails (backward compatibility)
      if (contentType === 'media' && config.excludeThoughtThumbnails && !fileContentClass) {
        const isThoughtThumbnail = (file.metadata as any).isThoughtThumbnail === true;
        const isThoughtCollectionThumbnail = file.metadata.fileType === 'thought-collection-thumbnail';
        if (isThoughtThumbnail || isThoughtCollectionThumbnail) {
          return false; // Thought thumbnails are not media
        }
      }
      
      return true;
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

