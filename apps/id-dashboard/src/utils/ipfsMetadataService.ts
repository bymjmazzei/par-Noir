// Client-side IPFS MFS service for pN metadata
// This works immediately without Firebase Functions deployment

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
  private pinataApiKey: string;
  private pinataSecretKey: string;

  constructor() {
    // Use your new Pinata API keys
    this.pinataApiKey = '6c557a6d433e0ad1de47';
    this.pinataSecretKey = '600492827bbfa45b4a9d506faf50a88059b06965b70fefe0856be509b0fe4d87';
  }

  /**
   * Store pN metadata on IPFS
   */
  async storePNMetadata(metadata: PNMetadata): Promise<MetadataResult> {
    try {
      // Create metadata object with timestamp
      const metadataObject = {
        ...metadata,
        updatedAt: new Date().toISOString(),
        version: Date.now()
      };

      // Convert to JSON
      const metadataJson = JSON.stringify(metadataObject, null, 2);
      const metadataBuffer = new Blob([metadataJson], { type: 'application/json' });

      // Create form data
      const formData = new FormData();
      formData.append('file', metadataBuffer, 'metadata.json');

      // Add to IPFS using Pinata with proper authentication
      const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const cid = result.IpfsHash;

      return {
        success: true,
        data: metadataObject,
        cid: cid,
        ipfsUrl: `https://gateway.pinata.cloud/ipfs/${cid}`
      };
    } catch (error) {
      console.error('Failed to store pN metadata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get pN metadata from IPFS
   */
  async getPNMetadata(cid: string): Promise<MetadataResult> {
    try {
      // Get from IPFS using Pinata gateway
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
      
      if (!response.ok) {
        throw new Error(`IPFS retrieval failed: ${response.status} ${response.statusText}`);
      }

      const metadata = await response.json();

      return {
        success: true,
        data: metadata,
        cid: cid,
        ipfsUrl: `https://gateway.pinata.cloud/ipfs/${cid}`
      };
    } catch (error) {
      console.error('Failed to get pN metadata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update pN metadata (creates new version)
   */
  async updatePNMetadata(pnId: string, updates: Partial<PNMetadata>): Promise<MetadataResult> {
    try {
      // For now, we'll create a new metadata entry
      // In a full implementation, you'd update the index
      const updatedMetadata: PNMetadata = {
        pnId,
        ...updates,
        updatedAt: new Date().toISOString(),
        version: Date.now()
      };

      return await this.storePNMetadata(updatedMetadata);
    } catch (error) {
      console.error('Failed to update pN metadata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test the service
   */
  async testConnection(): Promise<boolean> {
    try {
      const testMetadata: PNMetadata = {
        pnId: 'test-connection',
        name: 'Connection Test',
        description: 'Testing IPFS connection'
      };

      const result = await this.storePNMetadata(testMetadata);
      return result.success;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const ipfsMetadataService = new IPFSMetadataService();
