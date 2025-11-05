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
      // Ensure publicToken is stringified if it's an object
      const payload = {
        ...metadata,
        publicToken: metadata.publicToken 
          ? (typeof metadata.publicToken === 'string' 
              ? metadata.publicToken 
              : JSON.stringify(metadata.publicToken))
          : undefined
      };

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
        
        console.error(`❌ [CentralMetadataAggregator] API error ${response.status}:`, errorText);
        console.error('❌ [CentralMetadataAggregator] Payload sent:', JSON.stringify(payload, null, 2));
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      console.log('✅ [CentralMetadataAggregator] Metadata submitted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('⚠️ [CentralMetadataAggregator] Failed to submit to central aggregator API:', errorMessage);
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

