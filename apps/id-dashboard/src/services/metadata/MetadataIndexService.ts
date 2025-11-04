/**
 * Metadata Index Service (Dashboard)
 * Manages public metadata index for file discovery
 * Saves to Google Drive and submits to central aggregator API
 */

import { PublicMetadata, AggregatedFile } from '../../types/aggregator';
import { CentralMetadataAggregator } from '../../services/metadata/CentralMetadataAggregator';

export class MetadataIndexService {
  private isInitialized = false;
  private metadataStore: Map<string, PublicMetadata> = new Map();
  private centralAggregator: CentralMetadataAggregator;

  constructor() {
    this.centralAggregator = new CentralMetadataAggregator();
  }

  /**
   * Initialize the metadata index service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load existing metadata from localStorage cache
      const cachedMetadata = localStorage.getItem('pn_public_metadata_index');
      if (cachedMetadata) {
        try {
          const parsed = JSON.parse(cachedMetadata);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: PublicMetadata) => {
              if (item.fileId) {
                this.metadataStore.set(item.fileId, item);
              }
            });
          }
        } catch (e) {
          console.warn('Failed to parse cached metadata:', e);
        }
      }

      this.isInitialized = true;
    } catch (error) {
      console.warn('Metadata index initialization failed:', error);
      this.isInitialized = true; // Continue anyway
    }
  }

  /**
   * Get metadata for a specific file
   */
  async getFileMetadata(fileId: string): Promise<PublicMetadata | null> {
    await this.initialize();
    return this.metadataStore.get(fileId) || null;
  }

  /**
   * Index a file with public metadata
   * Saves to Google Drive (if connected) and submits to central API
   */
  async indexFile(
    file: AggregatedFile,
    publicMetadata: PublicMetadata,
    pnIdentifier?: string
  ): Promise<void> {
    await this.initialize();

    // Store in memory
    this.metadataStore.set(file.id, publicMetadata);

    // Save to localStorage cache
    const allMetadata = Array.from(this.metadataStore.values());
    localStorage.setItem('pn_public_metadata_index', JSON.stringify(allMetadata));

    // Submit to central aggregator API
    try {
      await this.centralAggregator.submitPublicMetadata({
        fileId: file.id,
        backend: file.backend,
        backendFileId: file.backendFileId,
        name: publicMetadata.name || file.name,
        description: publicMetadata.description || '',
        tags: publicMetadata.keywords || [],
        fileType: publicMetadata.fileType || 'other',
        creator: publicMetadata.creator,
        isPublic: publicMetadata.isPublic || false,
        uploadDate: publicMetadata.uploadDate || new Date().toISOString(),
        publicToken: publicMetadata.publicToken
      });
      console.log('✅ [MetadataIndexService] Metadata submitted to central aggregator');
    } catch (error) {
      console.warn('⚠️ [MetadataIndexService] Failed to submit to central aggregator:', error);
      // Continue - metadata is still cached locally
    }
  }

  /**
   * Remove a file from the public index
   */
  async removeFromIndex(fileId: string): Promise<void> {
    await this.initialize();

    // Remove from memory
    this.metadataStore.delete(fileId);

    // Update localStorage cache
    const allMetadata = Array.from(this.metadataStore.values());
    localStorage.setItem('pn_public_metadata_index', JSON.stringify(allMetadata));

    // Remove from central aggregator API
    try {
      await this.centralAggregator.removePublicMetadata(fileId);
      console.log('✅ [MetadataIndexService] Metadata removed from central aggregator');
    } catch (error) {
      console.warn('⚠️ [MetadataIndexService] Failed to remove from central aggregator:', error);
      // Continue - metadata is still removed locally
    }
  }

  /**
   * Get all public metadata
   */
  async getAllPublicMetadata(): Promise<PublicMetadata[]> {
    await this.initialize();
    return Array.from(this.metadataStore.values()).filter(m => m.isPublic !== false);
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

