// IPFS Client for Dashboard
// Supports both development (mock) and production (real) modes

export interface IPFSConfig {
  host: string;
  port: number;
  protocol: string;
  gateway: string;
  apiKey?: string;
  timeout?: number;
}

export interface IPFSFile {
  cid: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface IPFSClient {
  add(data: string | Buffer): Promise<{ cid: { toString(): string } }>;
  cat(cid: string): AsyncIterable<Uint8Array>;
}

export class DashboardIPFSClient {
  private config: IPFSConfig;
  private ipfsClient: IPFSClient | null = null;
  private isDevelopment: boolean;
  private mockFiles: Map<string, any> = new Map();

  constructor(config?: Partial<IPFSConfig>) {
    this.config = {
      host: import.meta.env.VITE_IPFS_HOST || 'ipfs.infura.io',
      port: parseInt(import.meta.env.VITE_IPFS_PORT || '5001'),
      protocol: import.meta.env.VITE_IPFS_PROTOCOL || 'https',
      gateway: import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/',
      apiKey: import.meta.env.VITE_IPFS_API_KEY,
      timeout: parseInt(import.meta.env.VITE_IPFS_TIMEOUT || '30000'),
      ...config
    };

    this.isDevelopment = import.meta.env.DEV || 
                        import.meta.env.VITE_IPFS_MODE === 'mock' ||
                        !this.config.apiKey;

    if (!this.isDevelopment) {
      this.initializeRealIPFS();
    }

    // IPFS Client initialized
  }

  private async initializeRealIPFS(): Promise<void> {
    try {
      // Check if ipfs-http-client is available
      try {
        // @ts-ignore - Dynamic import that may not be available
        const { create } = await import('ipfs-http-client');
        
        this.ipfsClient = create({
          host: this.config.host,
          port: this.config.port,
          protocol: this.config.protocol,
          headers: this.config.apiKey ? {
            'Authorization': `Bearer ${this.config.apiKey}`
        } : undefined
        });

        // Real IPFS client initialized
      } catch (importError) {
        // ipfs-http-client not available, falling back to mock mode
        this.isDevelopment = true;
      }
    } catch (error) {
      // Failed to initialize real IPFS, falling back to mock mode
      this.isDevelopment = true;
    }
  }

  async upload(data: any): Promise<string> {
    try {
      if (this.isDevelopment || !this.ipfsClient) {
        return this.mockUpload(data);
      }

      return await this.realUpload(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload to IPFS: ${errorMessage}`);
    }
  }

  private async mockUpload(data: any): Promise<string> {
    const jsonData = JSON.stringify(data, null, 2);
    const mockCid = `bafybeig${Buffer.from(jsonData).toString('hex').substring(0, 44)}`;
    
    // Store in mock storage
    this.mockFiles.set(mockCid, data);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return mockCid;
  }

  private async realUpload(data: any): Promise<string> {
    if (!this.ipfsClient) {
      throw new Error('IPFS client not initialized');
    }

    const jsonData = JSON.stringify(data, null, 2);
    const result = await this.ipfsClient.add(jsonData);
    const cid = result.cid.toString();
    
    return cid;
  }

  async download(cid: string): Promise<any> {
    try {
      if (this.isDevelopment || !this.ipfsClient) {
        return this.mockDownload(cid);
      }

      return await this.realDownload(cid);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download from IPFS: ${errorMessage}`);
    }
  }

  private async mockDownload(cid: string): Promise<any> {
    // Check if we have this file in mock storage
    const stored = this.mockFiles.get(cid);
    if (stored) {
      return stored;
    }

    // Return mock data for unknown CIDs
    const mockData = {
      message: 'Mock IPFS data',
      cid,
      timestamp: new Date().toISOString()
    };
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return mockData;
  }

  private async realDownload(cid: string): Promise<any> {
    if (!this.ipfsClient) {
      throw new Error('IPFS client not initialized');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of this.ipfsClient.cat(cid)) {
      chunks.push(chunk);
    }
    
    const data = Buffer.concat(chunks).toString();
    const result = JSON.parse(data);
    
    return result;
  }

  async uploadFile(file: File): Promise<IPFSFile> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      let cid: string;
      if (this.isDevelopment || !this.ipfsClient) {
        cid = await this.mockUpload(buffer);
      } else {
        if (!this.ipfsClient) {
          throw new Error('IPFS client not initialized');
        }
        const result = await this.ipfsClient.add(buffer);
        cid = result.cid.toString();
      }

      const ipfsFile: IPFSFile = {
        cid,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString()
      };

      return ipfsFile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload file to IPFS: ${errorMessage}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.isDevelopment) {
              // Mock connection test
      await new Promise(resolve => setTimeout(resolve, 50));
      return true;
      }

      // Real connection test
      const response = await fetch(`${this.config.gateway}QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.config.timeout || 30000)
      });
      
      const isConnected = response.ok;
      return isConnected;
    } catch (error) {
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

// Create singleton instance
export const ipfsClient = new DashboardIPFSClient();

// Export for use in components
export default ipfsClient;
