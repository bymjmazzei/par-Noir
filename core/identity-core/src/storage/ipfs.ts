// IPFS client implementation with environment-based switching
// Development mode: Mock implementation
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
  private mockFiles: Map<string, IPFSMetadata> = new Map();

  constructor(config: IPFSConfig) {
    this.config = config;
    this.isDevelopment = process.env.NODE_ENV === 'development' || 
                        process.env.IPFS_MODE === 'mock' ||
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
          console.log('✅ Real IPFS client initialized');
        }
      } catch (importError) {
        console.warn('⚠️ ipfs-http-client not available, falling back to mock mode');
        this.isDevelopment = true;
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize real IPFS, falling back to mock mode:', error);
      this.isDevelopment = true;
    }
  }

  async uploadMetadata(metadata: IPFSMetadata): Promise<string> {
    try {
      if (this.isDevelopment || !this.ipfsClient) {
        return this.mockUpload(metadata);
      }

      return await this.realUpload(metadata);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload metadata to IPFS: ${errorMessage}`);
    }
  }

  private async mockUpload(metadata: IPFSMetadata): Promise<string> {
    const data = JSON.stringify(metadata, null, 2);
    const mockCid = `bafybeig${Buffer.from(data).toString('hex').substring(0, 44)}`;
    
    // Store in mock storage
    this.mockFiles.set(mockCid, metadata);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // console.log('🔧 Mock IPFS upload:', mockCid);
    return mockCid;
  }

  private async realUpload(metadata: IPFSMetadata): Promise<string> {
    if (!this.ipfsClient) {
      throw new Error('IPFS client not initialized');
    }

    const data = JSON.stringify(metadata, null, 2);
    const result = await this.ipfsClient.add(data);
    const cid = result.cid.toString();
    
    // console.log('🚀 Real IPFS upload:', cid);
    return cid;
  }

  async downloadMetadata(cid: string): Promise<IPFSMetadata> {
    try {
      if (this.isDevelopment || !this.ipfsClient) {
        return this.mockDownload(cid);
      }

      return await this.realDownload(cid);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download metadata from IPFS: ${errorMessage}`);
    }
  }

  private async mockDownload(cid: string): Promise<IPFSMetadata> {
    // Check if we have this file in mock storage
    const stored = this.mockFiles.get(cid);
    if (stored) {
      // console.log('🔧 Mock IPFS download (cached):', cid);
      return stored;
    }

    // Return mock data for unknown CIDs
    const mockMetadata: IPFSMetadata = {
      did: 'mock-did',
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // console.log('🔧 Mock IPFS download (new):', cid);
    return mockMetadata;
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
    
    // console.log('🚀 Real IPFS download:', cid);
    return metadata;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.isDevelopment) {
        // Mock connection test
        await new Promise(resolve => setTimeout(resolve, 50));
        console.log('🔧 Mock IPFS connection test: OK');
        return true;
      }

      if (!this.ipfsClient) {
        return false;
      }

      // Real connection test using IPFS client
      await this.ipfsClient.version();
      console.log('🚀 Real IPFS connection test: OK');
      return true;
    } catch (error) {
      console.error('❌ IPFS connection test failed:', error);
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
      filesCount: this.mockFiles.size,
      isConnected
    };
  }
}

export function createIPFSStorage(): IPFSStorage {
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       process.env.IPFS_MODE === 'mock' ||
                       !process.env.IPFS_API_KEY;

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