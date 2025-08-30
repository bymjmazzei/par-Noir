// IPFS service using direct Pinata API calls for decentralized file storage
// This avoids the deprecated SDK and axios vulnerabilities

export interface IPFSConfig {
  apiKey: string;
  secretKey: string;
  gatewayUrl: string;
}

export interface IPFSUploadResult {
  cid: string;
  url: string;
  size: number;
  name: string;
}

export interface IPFSFile {
  cid: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

class IPFSService {
  private config: IPFSConfig | null = null;
  private isInitialized = false;

  async initialize(config: IPFSConfig): Promise<void> {
    try {
      this.config = config;
      this.isInitialized = true;
    } catch (error) {
      throw new Error('Failed to initialize IPFS service');
    }
  }

  async uploadFile(data: any, name: string = 'data.json'): Promise<IPFSUploadResult> {
    if (!this.isInitialized || !this.config) {
      throw new Error('IPFS service not initialized');
    }

    try {
      // Convert data to JSON string
      const jsonData = JSON.stringify(data);
      
      // Create a blob from the JSON data
      const blob = new Blob([jsonData], { type: 'application/json' });
      const file = new File([blob], name, { type: 'application/json' });

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Add metadata
      const metadata = {
        name: name,
        keyvalues: {
          type: 'json-data',
          uploadedAt: new Date().toISOString()
        }
      };
      formData.append('pinataMetadata', JSON.stringify(metadata));

      // Upload to Pinata using direct API
      const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'pinata_api_key': this.config.apiKey,
          'pinata_secret_api_key': this.config.secretKey
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      const uploadResult: IPFSUploadResult = {
        cid: result.IpfsHash,
        url: `${this.config.gatewayUrl}/ipfs/${result.IpfsHash}`,
        size: jsonData.length,
        name: name
      };

      return uploadResult;
    } catch (error) {
      throw new Error('Failed to upload file to IPFS');
    }
  }

  async getFile(cid: string): Promise<Response> {
    try {
      const response = await fetch(`${this.config!.gatewayUrl}/ipfs/${cid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      throw new Error('Failed to fetch file from IPFS');
    }
  }

  async getFileAsJSON(cid: string): Promise<any> {
    try {
      const response = await this.getFile(cid);
      return await response.json();
    } catch (error) {
      throw new Error('Failed to fetch JSON file from IPFS');
    }
  }

  async getFileAsText(cid: string): Promise<string> {
    try {
      const response = await this.getFile(cid);
      return await response.text();
    } catch (error) {
      throw new Error('Failed to fetch text file from IPFS');
    }
  }

  async listFiles(): Promise<IPFSFile[]> {
    if (!this.isInitialized || !this.config) {
      throw new Error('IPFS service not initialized');
    }

    try {
      // Get list of pinned files from Pinata
      const response = await fetch('https://api.pinata.cloud/pinning/pinList?status=pinned', {
        method: 'GET',
        headers: {
          'pinata_api_key': this.config.apiKey,
          'pinata_secret_api_key': this.config.secretKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const result = await response.json();

      const files: IPFSFile[] = result.rows.map((item: any) => ({
        cid: item.ipfs_pin_hash,
        name: item.metadata?.name || 'Unknown',
        size: item.size || 0,
        type: item.metadata?.keyvalues?.fileType || 'unknown',
        uploadedAt: item.date_pinned || new Date().toISOString()
      }));

      return files;
    } catch (error) {
      throw new Error('Failed to list IPFS files');
    }
  }

  async deleteFile(cid: string): Promise<void> {
    if (!this.isInitialized || !this.config) {
      throw new Error('IPFS service not initialized');
    }

    try {
      // Unpin the file from Pinata
      const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
        method: 'DELETE',
        headers: {
          'pinata_api_key': this.config.apiKey,
          'pinata_secret_api_key': this.config.secretKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error('Failed to delete IPFS file');
    }
  }

  async pinFile(cid: string): Promise<void> {
    if (!this.isInitialized || !this.config) {
      throw new Error('IPFS service not initialized');
    }

    try {
      // Pin a hash to IPFS
      const response = await fetch('https://api.pinata.cloud/pinning/pinHashToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': this.config.apiKey,
          'pinata_secret_api_key': this.config.secretKey
        },
        body: JSON.stringify({
          hashToPin: cid
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to pin file: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error('Failed to pin IPFS file');
    }
  }

  async unpinFile(cid: string): Promise<void> {
    await this.deleteFile(cid);
  }

  // Utility method to check if IPFS is available
  isAvailable(): boolean {
    return this.isInitialized && this.config !== null;
  }

  // Get gateway URL for a CID
  getGatewayUrl(cid: string): string {
    if (!this.config) {
      throw new Error('IPFS service not configured');
    }
    return `${this.config.gatewayUrl}/ipfs/${cid}`;
  }
}

// Export singleton instance
export const ipfsService = new IPFSService();
