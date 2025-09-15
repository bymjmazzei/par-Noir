// IPFS client implementation with environment-based switching
// Production IPFS implementation
// Production mode: Real IPFS integration

export interface IPFSConfig {
  url: string;
  gateway: string;
  timeout?: number;
  host?: string;
  port?: number;
  protocol?: string;
  apiKey?: string;
  apiSecret?: string;
}

export interface IPFSMetadata {
  did: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  version: string;
}

// Use the actual IPFS HTTP client type
import type { IPFSHTTPClient } from 'ipfs-http-client';

export interface IPFSClient extends IPFSHTTPClient {}

export class IPFSStorage {
  private config: IPFSConfig;
  private ipfsClient: IPFSClient | null = null;
  private isDevelopment: boolean;
  // Production implementation required

  constructor(config: IPFSConfig) {
    this.config = config;
    this.isDevelopment = process.env.NODE_ENV === 'development' || 
                        
                        !process.env.IPFS_API_KEY;
    
    if (!this.isDevelopment) {
      this.initializeRealIPFS();
    }
  }

  private async initializeRealIPFS(): Promise<void> {
    try {
      // Check if ipfs-http-client is available
      try {
        const { create } = await import('ipfs-http-client');
        
        this.ipfsClient = create({
          url: this.config.url || 'https://ipfs.infura.io:5001',
          headers: this.config.apiKey ? {
            'Authorization': `Bearer ${this.config.apiKey}`
          } : undefined
        });

        // Test the connection
        if (this.ipfsClient) {
          await this.ipfsClient.version();
          // Console statement removed for production
        }
      } catch (importError) {
        
        this.isDevelopment = true;
      }
    } catch (error) {
      
      this.isDevelopment = true;
    }
  }

  async uploadMetadata(metadata: IPFSMetadata): Promise<string> {
    try {
      if (this.isDevelopment || !this.ipfsClient) {
        throw new Error("IPFS client not available");
      }

      return await this.realUpload(metadata);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload metadata to IPFS: ${errorMessage}`);
    }
  }

  

  private async realUpload(metadata: IPFSMetadata): Promise<string> {
    if (!this.ipfsClient) {
      throw new Error('IPFS client not initialized');
    }

    const data = JSON.stringify(metadata, null, 2);
    const result = await this.ipfsClient.add(data);
    const cid = result.cid.toString();
    
    // // Console statement removed for production
    return cid;
  }

  async downloadMetadata(cid: string): Promise<IPFSMetadata> {
    try {
      if (this.isDevelopment || !this.ipfsClient) {
        throw new Error("IPFS client not available");
      }

      return await this.realDownload(cid);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download metadata from IPFS: ${errorMessage}`);
    }
  }

  

  private async realDownload(cid: string): Promise<IPFSMetadata> {
    if (!this.ipfsClient) {
      throw new Error('IPFS client not initialized');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of this.ipfsClient.cat(cid)) {
      chunks.push(chunk);
    }
    
    const data = Buffer.concat(chunks).toString();
    const metadata = JSON.parse(data);
    
    // // Console statement removed for production
    return metadata;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.isDevelopment) {
        // Production implementation required
        throw new Error('IPFS mock mode not supported in production. Please configure real IPFS client.');
      }

      if (!this.ipfsClient) {
        return false;
      }

      // Real connection test using IPFS client
      await this.ipfsClient.version();
      // Console statement removed for production
      return true;
    } catch (error) {
      // Console statement removed for production
      return false;
    }
  }

  getGatewayURL(cid: string): string {
    return `${this.config.gateway}${cid}`;
  }

  getMode(): 'development' | 'production' {
    return this.isDevelopment ? 'development' : 'production';
  }

  async getStats(): Promise<{ mode: string; filesCount: number; isConnected: boolean }> {
    const isConnected = await this.testConnection();
    return {
      mode: this.getMode(),
      filesCount: 0, // Real IPFS implementation
      isConnected
    };
  }
}

export function createIPFSStorage(): IPFSStorage {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const config: IPFSConfig = {
    url: process.env.IPFS_API_URL || 'https://ipfs.infura.io:5001',
    gateway: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/',
    timeout: parseInt(process.env.IPFS_TIMEOUT || '30000'),
    host: process.env.IPFS_HOST || 'ipfs.infura.io',
    port: parseInt(process.env.IPFS_PORT || '5001'),
    protocol: process.env.IPFS_PROTOCOL || 'https',
    apiKey: process.env.IPFS_API_KEY,
    apiSecret: process.env.IPFS_API_SECRET
  };

      // IPFS Storage initialized
  
  return new IPFSStorage(config);
} 