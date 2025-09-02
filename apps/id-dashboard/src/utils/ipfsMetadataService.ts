// Client-side IPFS service for pN metadata
// Uses secure IPFS HTTP client instead of vulnerable Pinata SDK

import { ipfsService } from './ipfsService';
import { logger } from './logger';

export interface PNMetadata {
  pnId: string;
  name?: string;
  description?: string;
  attributes?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export interface MetadataResult {
  success: boolean;
  data?: PNMetadata;
  cid?: string;
  ipfsUrl?: string;
  error?: string;
}

export class IPFSMetadataService {
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Always use the hardcoded Pinata credentials for now
      const apiKey = '6c557a6d433e0ad1de47';
      const secretKey = '600492827bbfa45b4a9d506faf50a88059b06965b70fefe0856be509b0fe4d87';
      
      logger.debug('Using hardcoded Pinata credentials');
      
      const config = {
        apiKey: apiKey,
        secretKey: secretKey,
        gatewayUrl: 'https://gateway.pinata.cloud'
      };

      logger.debug('Initializing IPFS service with credentials:', { apiKey: config.apiKey.substring(0, 8) + '...', secretKey: config.secretKey.substring(0, 8) + '...' });
      await ipfsService.initialize(config);
      this.isInitialized = true;
      logger.debug('IPFS service initialized with Pinata credentials');
      
    } catch (error) {
      logger.error('IPFS initialization failed:', error);
      this.isInitialized = true; // Still mark as initialized to use fallback
    }
  }

  /**
   * Store pN metadata on IPFS
   */
  async storePNMetadata(metadata: PNMetadata): Promise<MetadataResult> {
    try {
      await this.initialize();

      if (!ipfsService.isAvailable()) {
        throw new Error('IPFS service not available');
      }

      // Create metadata object with timestamp
      const metadataObject = {
        ...metadata,
        updatedAt: new Date().toISOString(),
        version: Date.now()
      };

      // Upload to IPFS
      const result = await ipfsService.uploadFile(metadataObject, 'metadata.json');

      return {
        success: true,
        data: metadataObject,
        cid: result.cid,
        ipfsUrl: result.url
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload encrypted identity data to IPFS for transfer
   */
  async uploadIdentityData(encryptedData: any): Promise<string> {
    try {
      await this.initialize();

      logger.debug('IPFS service available:', ipfsService.isAvailable());
      logger.debug('IPFS service initialized:', this.isInitialized);

      // Try to use configured IPFS service first
      if (ipfsService.isAvailable()) {
        logger.debug('Attempting to upload to IPFS with configured service...');
        const result = await ipfsService.uploadFile(encryptedData, 'identity-data.json');
        logger.debug('IPFS upload successful:', result.cid);
        return result.cid;
      }

      logger.debug('IPFS service not available, trying fallback...');
      // Fallback: Use public IPFS gateway
      return await this.uploadToPublicIPFS(encryptedData);
    } catch (error) {
      logger.error('IPFS upload error:', error);
      throw new Error('Failed to upload identity data to IPFS');
    }
  }

  /**
   * Upload to public IPFS gateway as fallback
   */
  private async uploadToPublicIPFS(data: any): Promise<string> {
    // Since we don't have proper IPFS credentials, we'll throw an error
    // to inform the user that IPFS is not available
    throw new Error('IPFS service is not configured. Please configure IPFS credentials or use the Export feature instead.');
  }

  /**
   * Download identity data from IPFS
   */
  async downloadIdentityData(cid: string): Promise<any> {
    try {
      await this.initialize();

      // Try to use configured IPFS service first
      if (ipfsService.isAvailable()) {
        const data = await ipfsService.getFileAsJSON(cid);
        return data;
      }

      // Fallback: Use public IPFS gateway
      return await this.downloadFromPublicIPFS(cid);
    } catch (error) {
      throw new Error('Failed to download identity data from IPFS');
    }
  }

  /**
   * Download from public IPFS gateway as fallback
   */
  private async downloadFromPublicIPFS(cid: string): Promise<any> {
    try {
      // Try multiple public gateways
      const gateways = [
        `https://ipfs.io/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`
      ];

      for (const gateway of gateways) {
        try {
          const response = await fetch(gateway);
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          // Try next gateway
          continue;
        }
      }

      throw new Error('All IPFS gateways failed');
    } catch (error) {
      throw new Error('Failed to download from public IPFS gateways');
    }
  }

  /**
   * Delete identity data from IPFS
   */
  async deleteIdentityData(cid: string): Promise<void> {
    try {
      await this.initialize();

      if (!ipfsService.isAvailable()) {
        throw new Error('IPFS service not available');
      }

      // Delete data from IPFS
      await ipfsService.deleteFile(cid);
    } catch (error) {
      throw new Error('Failed to delete identity data from IPFS');
    }
  }

  /**
   * Get metadata from IPFS
   */
  async getMetadata(cid: string): Promise<PNMetadata | null> {
    try {
      await this.initialize();

      if (!ipfsService.isAvailable()) {
        throw new Error('IPFS service not available');
      }

      // Get metadata from IPFS
      const data = await ipfsService.getFileAsJSON(cid);
      return data as PNMetadata;
    } catch (error) {
      return null;
    }
  }

  /**
   * List all metadata files
   */
  async listMetadata(): Promise<Array<{ cid: string; name: string; url: string }>> {
    try {
      await this.initialize();

      if (!ipfsService.isAvailable()) {
        throw new Error('IPFS service not available');
      }

      // List files from IPFS
      const files = await ipfsService.listFiles();
      return files.map(file => ({
        cid: file.cid,
        name: file.name,
        url: ipfsService.getGatewayUrl(file.cid)
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if IPFS service is available
   */
  isAvailable(): boolean {
    return this.isInitialized && ipfsService.isAvailable();
  }
}

// Export singleton instance
export const ipfsMetadataService = new IPFSMetadataService();
