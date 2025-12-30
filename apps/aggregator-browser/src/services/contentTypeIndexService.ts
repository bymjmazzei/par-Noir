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
   * Queries for each fileType in the content type config and applies filtering
   */
  async loadContentTypeIndex(
    contentType: ContentType,
    filters?: MetadataFilters & { limit?: number; offset?: number },
    forceRefresh: boolean = false
  ): Promise<IndexedFile[]> {
    const config = CONTENT_TYPE_MAP[contentType];
    const metadataService = getMetadataIndexService();
    
    // Query API for each fileType in the content type
    const allFiles: IndexedFile[] = [];
    for (const fileType of config.apiFileTypes) {
      const result = await metadataService.discoverFiles({
        ...filters,
        fileType,
      }, forceRefresh);
      
      const files = Array.isArray(result) ? result : result.files;
      allFiles.push(...files);
    }
    
    // Apply content-type specific filtering AFTER combining all fileTypes
    // This is important for thoughts which need to filter 'image' files to only thought thumbnails
    const filtered = this.filterForContentType(allFiles, contentType, config);
    
    // Update index
    this[`${contentType}Index`] = filtered;
    this.lastUpdated.set(contentType, Date.now());
    
    return filtered;
  }
  
  /**
   * Filter files based on content-type specific rules
   */
  private filterForContentType(
    files: IndexedFile[],
    contentType: ContentType,
    config: ContentTypeConfig
  ): IndexedFile[] {
    return files.filter(file => {
      // For thoughts: only include thought thumbnails
      // Thought thumbnails have isThoughtThumbnail: true OR fileType: 'thought-collection-thumbnail'
      // OR fileType: 'thought'/'text' (legacy thought files, if any exist)
      if (contentType === 'thoughts' && config.includeOnlyThoughtThumbnails) {
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
      
      // For media: exclude thought thumbnails
      if (contentType === 'media' && config.excludeThoughtThumbnails) {
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

