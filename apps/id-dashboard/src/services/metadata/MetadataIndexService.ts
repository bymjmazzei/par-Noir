/**
 * Metadata Index Service (Dashboard)
 * Manages public metadata index for file discovery
 * Saves to Google Drive and submits to central aggregator API
 */

import { PublicMetadata, AggregatedFile } from '../../types/aggregator';
import { CentralMetadataAggregator, CentralIndexEntry } from '../../services/metadata/CentralMetadataAggregator';

export class MetadataIndexService {
  private isInitialized = false;
  private metadataStore: Map<string, PublicMetadata> = new Map();
  private aliasMap: Map<string, string> = new Map();
  private lastCentralSyncAt: number | null = null;
  private centralSyncPromise: Promise<void> | null = null;
  private centralAggregator: CentralMetadataAggregator;

  constructor() {
    this.centralAggregator = new CentralMetadataAggregator();
  }

  private getPrimaryIdFromMetadata(metadata: PublicMetadata): string | null {
    if (!metadata) {
      return null;
    }

    return (
      metadata.fileId ||
      (metadata as any)?.backendFileId ||
      (metadata as any)?.googleDriveFileId ||
      null
    );
  }

  private registerMetadata(
    metadata: PublicMetadata,
    options?: { skipPersist?: boolean }
  ): boolean {
    const normalized: PublicMetadata = {
      ...metadata,
    };

    if (normalized.isPublic === undefined) {
      const visibility = (normalized as any)?.visibility;
      if (visibility === 'public') {
        normalized.isPublic = true;
      } else if (visibility === 'private') {
        normalized.isPublic = false;
      } else if ((normalized as any)?.publicToken) {
        normalized.isPublic = true;
      }
    }

    const primaryId = this.getPrimaryIdFromMetadata(normalized);
    if (!primaryId) {
      console.warn('⚠️ [MetadataIndexService] Unable to register metadata without identifier', metadata);
      return false;
    }

    // Remove old aliases pointing to this primary id
    for (const [alias, target] of Array.from(this.aliasMap.entries())) {
      if (target === primaryId) {
        this.aliasMap.delete(alias);
      }
    }

    this.metadataStore.set(primaryId, normalized);

    const aliasCandidates = new Set<string>();
    if (normalized.fileId) {
      aliasCandidates.add(normalized.fileId);
    }
    if ((normalized as any)?.backendFileId) {
      aliasCandidates.add((normalized as any).backendFileId);
    }
    if ((normalized as any)?.googleDriveFileId) {
      aliasCandidates.add((normalized as any).googleDriveFileId);
    }
    aliasCandidates.add(primaryId);

    aliasCandidates.forEach((alias) => {
      if (alias) {
        this.aliasMap.set(alias, primaryId);
      }
    });

    if (!options?.skipPersist) {
      this.persistMetadataCache();
    }

    return true;
  }

  private removeMetadata(primaryId: string): void {
    const canonicalId = this.aliasMap.get(primaryId) || primaryId;
    if (!this.metadataStore.has(canonicalId)) {
      return;
    }

    this.metadataStore.delete(canonicalId);
    for (const [alias, target] of Array.from(this.aliasMap.entries())) {
      if (alias === canonicalId || target === canonicalId) {
        this.aliasMap.delete(alias);
      }
    }

    this.persistMetadataCache();
  }

  private persistMetadataCache(): void {
    const allMetadata = Array.from(this.metadataStore.values()).map((item) =>
      this.stripLargeFields(item)
    );

    try {
      localStorage.setItem('pn_public_metadata_index', JSON.stringify(allMetadata));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('⚠️ [MetadataIndexService] localStorage quota exceeded, clearing old cache and retrying...');
        try {
          localStorage.removeItem('pn_public_metadata_index');
          localStorage.setItem('pn_public_metadata_index', JSON.stringify(allMetadata));
        } catch (retryError) {
          console.error('❌ [MetadataIndexService] Failed to store metadata cache after clearing:', retryError);
        }
      } else {
        console.error('❌ [MetadataIndexService] Failed to persist metadata cache:', error);
      }
    }
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
              this.registerMetadata(item, { skipPersist: true });
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
    const primaryId = this.aliasMap.get(fileId) || (this.metadataStore.has(fileId) ? fileId : null);
    if (!primaryId) {
      return null;
    }
    return this.metadataStore.get(primaryId) || null;
  }

  /**
   * Helper to strip large fields (like thumbnails) from metadata before storing in localStorage
   * Thumbnails are large base64 data URLs that can exceed localStorage quota
   */
  private stripLargeFields(metadata: PublicMetadata): PublicMetadata {
    const { thumbnail, ...rest } = metadata;
    return rest;
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

    // Store locally (with thumbnail) and persist cache
    this.registerMetadata(publicMetadata);

    // Submit to central aggregator API
    // The aggregator browser queries this API to discover public files
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
        publicToken: publicMetadata.publicToken,
        indexingPermissions: publicMetadata.indexingPermissions,
        pnIdentifier,
        // CRITICAL: Include textPost/thought content so thoughts render in feeds
        textPost: publicMetadata.textPost,
        thought: publicMetadata.thought,
        // Include PDF slideshow data
        pdfPageThumbnailIds: publicMetadata.pdfPageThumbnailIds,
        pdfPageThumbnailTokens: publicMetadata.pdfPageThumbnailTokens,
        pdfFileId: publicMetadata.pdfFileId,
        thumbnailFileId: publicMetadata.thumbnailFileId ?? null,
        subjects: publicMetadata.subjects,
        feedCategories: publicMetadata.feedCategories
      });
      console.log('✅ [MetadataIndexService] Metadata submitted to central aggregator API');
    } catch (error) {
      // Error is already logged in CentralMetadataAggregator
      // Continue - metadata is still cached locally and in Google Drive
      console.warn('⚠️ [MetadataIndexService] Metadata submission to central API failed, but file is still indexed in Google Drive');
    }
  }

  /**
   * Remove a file from the public index
   */
  async removeFromIndex(fileId: string): Promise<void> {
    await this.initialize();

    this.removeMetadata(fileId);

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
   * Synchronize metadata from the central aggregator API
   */
  async syncFromCentralAggregator(options?: {
    authorDid?: string | string[];
    tags?: string[];
    fileType?: string;
    force?: boolean;
  }): Promise<void> {
    await this.initialize();

    const now = Date.now();
    const force = options?.force ?? false;

    if (this.centralSyncPromise) {
      return this.centralSyncPromise;
    }

    if (!force && this.lastCentralSyncAt && now - this.lastCentralSyncAt < 60000) {
      // Skip sync if we synced within the last minute
      return;
    }

    const authorIds = options?.authorDid
      ? Array.isArray(options.authorDid)
        ? options.authorDid.filter(Boolean)
        : [options.authorDid]
      : [undefined];

    this.centralSyncPromise = (async () => {
      let updated = false;

      for (const authorId of authorIds) {
        const filters = {
          tags: options?.tags,
          fileType: options?.fileType,
          authorDid: authorId,
        };

        const entries: CentralIndexEntry[] = await this.centralAggregator.fetchPublicMetadata(filters);

        if (!entries || entries.length === 0) {
          continue;
        }

        entries.forEach((entry) => {
          if (entry?.metadata) {
            const didUpdate = this.registerMetadata(entry.metadata, { skipPersist: true });
            updated = updated || didUpdate;
          }
        });
      }

      if (updated) {
        this.persistMetadataCache();
      }

      this.lastCentralSyncAt = Date.now();
    })()
      .catch((error) => {
        console.error('❌ [MetadataIndexService] Failed to sync central metadata:', error);
      })
      .finally(() => {
        this.centralSyncPromise = null;
      });

    return this.centralSyncPromise;
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

