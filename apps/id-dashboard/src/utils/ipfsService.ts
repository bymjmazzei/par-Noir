// IPFS service using Pinata for decentralized file storage
// import { PinataSDK } from '@pinata/sdk'; // Temporarily disabled for Netlify

export interface IPFSConfig {
  apiKey: string;
  gatewayUrl: string;
}

export interface IPFSFile {
  cid: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface IPFSUploadResult {
  cid: string;
  url: string;
  size: number;
  name: string;
}

export class IPFSService {
  private config: IPFSConfig;
  private pinata: PinataSDK | null = null;
  private isInitialized = false;

  constructor(config: IPFSConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize Pinata SDK
      this.pinata = new PinataSDK({ pinataJWTKey: this.config.apiKey });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Pinata IPFS service initialized');
      }
      
      this.isInitialized = true;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to initialize Pinata IPFS service:', error);
      }
      throw error;
    }
  }

  async uploadFile(file: File, metadata?: any): Promise<IPFSUploadResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.pinata) {
      throw new Error('Pinata client not initialized');
    }

    try {
      // Prepare metadata for Pinata
      const pinataMetadata = {
        name: file.name,
        keyvalues: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          fileType: file.type,
          fileSize: file.size
        }
      };

      // Upload file to Pinata
      const result = await this.pinata.pinFileToIPFS(file, {
        pinataMetadata: pinataMetadata
      });

      const uploadResult: IPFSUploadResult = {
        cid: result.IpfsHash,
        url: `${this.config.gatewayUrl}/ipfs/${result.IpfsHash}`,
        size: file.size,
        name: file.name
      };

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ File uploaded to IPFS: ${result.IpfsHash}`);
      }

      return uploadResult;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to upload file to IPFS:', error);
      }
      throw error;
    }
  }

  async uploadIdentityFile(identityData: any, filename: string): Promise<IPFSUploadResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.pinata) {
      throw new Error('Pinata client not initialized');
    }

    try {
      // Convert identity data to JSON string
      const jsonData = JSON.stringify(identityData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      // Create a File object from the blob
      const file = new File([blob], filename, { type: 'application/json' });

      // Prepare metadata for identity file
      const metadata = {
        type: 'identity-backup',
        version: '1.0',
        timestamp: new Date().toISOString(),
        identityName: identityData.nickname || 'unknown'
      };

      return await this.uploadFile(file, metadata);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to upload identity file:', error);
      }
      throw error;
    }
  }

  async uploadJSON(data: any, name: string): Promise<IPFSUploadResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.pinata) {
      throw new Error('Pinata client not initialized');
    }

    try {
      // Upload JSON data to Pinata
      const result = await this.pinata.pinJSONToIPFS(data, {
        pinataMetadata: {
          name: name,
          keyvalues: {
            type: 'json-data',
            uploadedAt: new Date().toISOString()
          }
        }
      });

      const uploadResult: IPFSUploadResult = {
        cid: result.IpfsHash,
        url: `${this.config.gatewayUrl}/ipfs/${result.IpfsHash}`,
        size: JSON.stringify(data).length,
        name: name
      };

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ JSON uploaded to IPFS: ${result.IpfsHash}`);
      }

      return uploadResult;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to upload JSON to IPFS:', error);
      }
      throw error;
    }
  }

  async getFile(cid: string): Promise<Response> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/ipfs/${cid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to get file from IPFS:', error);
      }
      throw error;
    }
  }

  async getFileAsJSON(cid: string): Promise<any> {
    try {
      const response = await this.getFile(cid);
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to get JSON from IPFS:', error);
      }
      throw error;
    }
  }

  async getFileAsText(cid: string): Promise<string> {
    try {
      const response = await this.getFile(cid);
      return await response.text();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to get text from IPFS:', error);
      }
      throw error;
    }
  }

  async listFiles(): Promise<IPFSFile[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.pinata) {
      throw new Error('Pinata client not initialized');
    }

    try {
      // Get list of pinned files from Pinata
      const result = await this.pinata.pinList({
        status: 'pinned'
      });

      const files: IPFSFile[] = result.rows.map((item: any) => ({
        cid: item.ipfs_pin_hash,
        name: item.metadata?.name || 'Unknown',
        size: item.size || 0,
        type: item.metadata?.keyvalues?.fileType || 'unknown',
        uploadedAt: item.date_pinned || new Date().toISOString()
      }));

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Found ${files.length} files on IPFS`);
      }

      return files;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to list files from IPFS:', error);
      }
      throw error;
    }
  }

  async deleteFile(cid: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.pinata) {
      throw new Error('Pinata client not initialized');
    }

    try {
      // Unpin file from Pinata
      await this.pinata.unpin(cid);

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ File unpinned from IPFS: ${cid}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to delete file from IPFS:', error);
      }
      throw error;
    }
  }

  getConfig(): IPFSConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<IPFSConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize with new config
    this.isInitialized = false;
    this.pinata = null;
    await this.initialize();
  }
}

// Create IPFS service instance with environment variables
export const ipfsService = new IPFSService({
  apiKey: process.env.REACT_APP_PINATA_API_KEY || '',
  gatewayUrl: process.env.REACT_APP_IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud'
});
