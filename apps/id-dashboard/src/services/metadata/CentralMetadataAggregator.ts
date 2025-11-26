/**
 * Central Metadata Aggregator Service (Dashboard)
 * Submits and queries public metadata in the central aggregator API
 */

import { PublicMetadata } from '../../types/aggregator';
import { retry } from '../../utils/helpers';

const CENTRAL_API_URL = 'https://api.parnoir.com';
const CENTRAL_INDEX_PATH = '/api/aggregator/metadata-index';

export interface PublicMetadataSubmission {
  fileId: string;
  backend: string;
  backendFileId: string;
  name: string;
  description?: string;
  tags?: string[];
  fileType?: string;
  creator?: any;
  isPublic: boolean;
  uploadDate: string;
  publicToken?: string | any; // Can be string or ShareToken object
  indexingPermissions?: {
    mode?: 'all' | 'custom' | 'none';
    allowed?: string[];
    blocked?: string[];
    updatedAt?: string;
  };
  pnIdentifier?: string;
  // CRITICAL: Include textPost/thought for thoughts to render in feeds
  textPost?: any;
  thought?: any;
  // Include PDF slideshow data
  pdfPageThumbnailIds?: string[];
  pdfPageThumbnailTokens?: string[];
  pdfFileId?: string;
  thumbnailFileId?: string;
  subjects?: string[];
  feedCategories?: string[];
}

export interface CentralIndexEntry {
  fileId: string;
  metadata: PublicMetadata;
  submittedAt: string;
  pnIdentifier?: string;
}

export interface CentralIndexResponse {
  files: CentralIndexEntry[];
  updatedAt: string;
  totalFiles: number;
}

export class CentralMetadataAggregator {
  /**
   * Submit public metadata to the central aggregator API
   */
  async submitPublicMetadata(metadata: PublicMetadataSubmission): Promise<void> {
    try {
      const fileType = metadata.fileType || 'unknown';
      console.log(`📤 [CentralMetadataAggregator] Submitting ${fileType} metadata for file: ${metadata.fileId}`);
      
      // Ensure publicToken is stringified if it's an object
      // But handle large tokens carefully - they might cause issues
      let publicToken: string | undefined = undefined;
      if (metadata.publicToken) {
        if (typeof metadata.publicToken === 'string') {
          publicToken = metadata.publicToken;
          console.log(`📤 [CentralMetadataAggregator] publicToken is string, length: ${publicToken.length}`);
        } else {
          try {
            publicToken = JSON.stringify(metadata.publicToken);
            console.log(`📤 [CentralMetadataAggregator] publicToken stringified, length: ${publicToken.length}`);
            
            // Check if token is too large (might cause issues)
            if (publicToken.length > 100000) {
              console.warn(`⚠️ [CentralMetadataAggregator] publicToken is very large (${publicToken.length} chars), this might cause issues`);
            }
          } catch (stringifyError) {
            console.error(`❌ [CentralMetadataAggregator] Failed to stringify publicToken:`, stringifyError);
            // Don't include token if we can't stringify it
            publicToken = undefined;
          }
        }
      } else {
        console.log(`📤 [CentralMetadataAggregator] No publicToken provided`);
      }

      const { pnIdentifier, ...metadataWithoutIdentity } = metadata;

      const payload = {
        ...metadataWithoutIdentity,
        publicToken: publicToken
      };

      // Log payload structure (but not full content if too large)
      const payloadPreview = {
        ...payload,
        publicToken: payload.publicToken ? `${payload.publicToken.substring(0, 50)}... (${payload.publicToken.length} chars)` : undefined
      };
      console.log(`📤 [CentralMetadataAggregator] Payload preview:`, JSON.stringify(payloadPreview, null, 2));
      console.log(`📤 [CentralMetadataAggregator] Full payload size: ${JSON.stringify(payload).length} chars`);

      // Retry on 429 (rate limit) errors with exponential backoff
      const response = await retry(
        async () => {
          const res = await fetch(`${CENTRAL_API_URL}${CENTRAL_INDEX_PATH}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              metadata: payload,
              pnIdentifier
            }),
          });

          // If 429, throw to trigger retry
          if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
            const error = new Error(`Rate limited (429). ${delay ? `Retry after ${delay}ms` : 'Retrying...'}`);
            (error as any).status = 429;
            (error as any).retryAfter = delay;
            throw error;
          }

          return res;
        },
        3, // maxAttempts
        2000 // baseDelay (2 seconds)
      );

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = `Failed to read error response: ${e}`;
        }
        
        console.error(`❌ [CentralMetadataAggregator] API error ${response.status} for ${fileType} file:`, errorText);
        console.error(`❌ [CentralMetadataAggregator] File ID: ${metadata.fileId}`);
        console.error(`❌ [CentralMetadataAggregator] Payload keys:`, Object.keys(payload));
        console.error(`❌ [CentralMetadataAggregator] Payload preview:`, JSON.stringify(payloadPreview, null, 2));
        
        // Try to parse error response as JSON
        try {
          const errorJson = JSON.parse(errorText);
          console.error(`❌ [CentralMetadataAggregator] Error details:`, errorJson);
        } catch {
          // Not JSON, that's fine
        }
        
        throw new Error(`API returned ${response.status}: ${errorText.substring(0, 500)}`);
      }

      console.log(`✅ [CentralMetadataAggregator] ${fileType} metadata submitted successfully for file: ${metadata.fileId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const fileType = metadata.fileType || 'unknown';
      console.error(`❌ [CentralMetadataAggregator] Failed to submit ${fileType} metadata to central aggregator API:`, errorMessage);
      console.error(`❌ [CentralMetadataAggregator] File ID: ${metadata.fileId}`);
      // Don't throw - allow the process to continue with Google Drive fallback
      // The metadata is still stored in Google Drive and can be discovered that way
    }
  }

  /**
   * Remove public metadata from the central aggregator API
   */
  async removePublicMetadata(fileId: string): Promise<void> {
    try {
      const response = await fetch(`${CENTRAL_API_URL}${CENTRAL_INDEX_PATH}/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      console.log('✅ [CentralMetadataAggregator] Metadata removed successfully');
    } catch (error) {
      console.warn('⚠️ Central aggregator API not available:', error);
      // Don't throw - removal is best-effort
    }
  }

  /**
   * Fetch public metadata from the central aggregator API
   */
  async fetchPublicMetadata(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
  }): Promise<CentralIndexEntry[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.tags && filters.tags.length > 0) {
        params.append('tags', filters.tags.join(','));
      }
      if (filters?.fileType) {
        params.append('fileType', filters.fileType);
      }
      if (filters?.authorDid) {
        params.append('authorDid', filters.authorDid);
      }
      if (filters?.indexerId) {
        params.append('indexerId', filters.indexerId);
      }

      const response = await fetch(
        `${CENTRAL_API_URL}${CENTRAL_INDEX_PATH}${params.toString() ? `?${params.toString()}` : ''}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data: CentralIndexResponse = await response.json();
      const files = data.files || [];
      
      // CLIENT-SIDE VERIFICATION: Verify files exist in Google Drive
      // Google Drive is the source of truth - filter out deleted files
      const verifiedFiles = await this.verifyFilesExist(files);
      
      if (verifiedFiles.length !== files.length) {
        console.log(`✅ [CentralMetadataAggregator] Filtered ${files.length - verifiedFiles.length} deleted file(s) from API response`);
      }
      
      return verifiedFiles;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ [CentralMetadataAggregator] Failed to fetch public metadata:', message);
      return [];
    }
  }

  /**
   * Verify files exist in Google Drive (client-side verification)
   * Tries to verify using Google Drive API - filters out deleted files
   * Note: This may not work for all files without auth, but will catch most deleted files
   */
  private async verifyFilesExist(files: CentralIndexEntry[]): Promise<CentralIndexEntry[]> {
    if (files.length === 0) {
      return files;
    }
    
    console.log(`🔍 [CentralMetadataAggregator] Verifying ${files.length} files from API...`);
    
    // Verify files in parallel (with rate limiting - batch of 5 at a time)
    const verifiedFiles: CentralIndexEntry[] = [];
    const batchSize = 5;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map(async (file) => {
        const googleDriveFileId = file.metadata?.googleDriveFileId || file.metadata?.backendFileId;
        
        if (!googleDriveFileId) {
          // No Google Drive ID - keep it (might be from other backends)
          return file;
        }
        
        try {
          // Try to verify file exists using Google Drive API
          // For public files shared with "anyone with the link", this might work
          // For private files, this will fail but we'll assume they exist
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${googleDriveFileId}?fields=id,trashed`,
            {
              method: 'GET',
              // No auth header - will work for public files, fail for private (which is OK)
            }
          );

          if (response.status === 404) {
            console.log(`🗑️ [CentralMetadataAggregator] File ${googleDriveFileId} not found (404) - filtering out: ${file.metadata?.name || 'unknown'}`);
            return null; // File doesn't exist
          }

          if (response.status === 403 || response.status === 401) {
            // Private file or auth required - assume it exists (can't verify without auth)
            return file;
          }

          if (!response.ok) {
            // Other error - assume file exists to avoid false positives
            return file;
          }

          const fileData = await response.json();
          // File exists and is not trashed
          if (fileData.trashed) {
            console.log(`🗑️ [CentralMetadataAggregator] File ${googleDriveFileId} is trashed - filtering out: ${file.metadata?.name || 'unknown'}`);
            return null;
          }
          
          return file; // File exists
        } catch (error) {
          // On error (network, CORS, etc.), assume file exists to avoid false positives
          // This is conservative - we'd rather show a file that might be deleted than hide a valid one
          return file;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const validFiles = batchResults.filter((file): file is CentralIndexEntry => file !== null);
      verifiedFiles.push(...validFiles);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    if (verifiedFiles.length !== files.length) {
      console.log(`✅ [CentralMetadataAggregator] Filtered ${files.length - verifiedFiles.length} deleted file(s) from API response`);
    }
    
    return verifiedFiles;
  }
}

