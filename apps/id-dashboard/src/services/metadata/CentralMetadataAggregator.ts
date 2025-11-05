/**
 * Central Metadata Aggregator Service (Dashboard)
 * Submits public metadata to the central aggregator API
 */

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

      const payload = {
        ...metadata,
        publicToken: publicToken
      };

      // Log payload structure (but not full content if too large)
      const payloadPreview = {
        ...payload,
        publicToken: payload.publicToken ? `${payload.publicToken.substring(0, 50)}... (${payload.publicToken.length} chars)` : undefined
      };
      console.log(`📤 [CentralMetadataAggregator] Payload preview:`, JSON.stringify(payloadPreview, null, 2));
      console.log(`📤 [CentralMetadataAggregator] Full payload size: ${JSON.stringify(payload).length} chars`);

      const response = await fetch(`${CENTRAL_API_URL}${CENTRAL_INDEX_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata: payload }),
      });

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
}

