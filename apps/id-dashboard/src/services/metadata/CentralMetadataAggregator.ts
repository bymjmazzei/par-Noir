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
  publicToken?: string;
}

export class CentralMetadataAggregator {
  /**
   * Submit public metadata to the central aggregator API
   */
  async submitPublicMetadata(metadata: PublicMetadataSubmission): Promise<void> {
    try {
      const response = await fetch(`${CENTRAL_API_URL}${CENTRAL_INDEX_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      console.log('✅ [CentralMetadataAggregator] Metadata submitted successfully');
    } catch (error) {
      console.warn('⚠️ Central aggregator API not available, using Google Drive fallback:', error);
      throw error;
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

