// Client-side IPFS service for pN metadata
// Uses secure IPFS HTTP client instead of vulnerable Pinata SDK

import { ipfsService } from './ipfsService';

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
      // Initialize IPFS service with environment variables
      const config = {
        apiKey: process.env.REACT_APP_PINATA_API_KEY || '',
        secretKey: process.env.REACT_APP_PINATA_SECRET_KEY || '',
        gatewayUrl: process.env.REACT_APP_IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud'
      };

      if (!config.apiKey || !config.secretKey) {
        throw new Error('IPFS configuration missing');
      }

      await ipfsService.initialize(config);
      this.isInitialized = true;
    } catch (error) {
      // Don't throw - IPFS is optional
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

      if (!ipfsService.isAvailable()) {
        throw new Error('IPFS service not available');
      }

      // Upload encrypted data to IPFS
      const result = await ipfsService.uploadFile(encryptedData, 'identity-data.json');
      return result.cid;
    } catch (error) {
      throw new Error('Failed to upload identity data to IPFS');
    }
  }

  /**
   * Download identity data from IPFS
   */
  async downloadIdentityData(cid: string): Promise<any> {
    try {
      await this.initialize();

      if (!ipfsService.isAvailable()) {
        throw new Error('IPFS service not available');
      }

      // Download data from IPFS
      const data = await ipfsService.getFileAsJSON(cid);
      return data;
    } catch (error) {
      throw new Error('Failed to download identity data from IPFS');
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
