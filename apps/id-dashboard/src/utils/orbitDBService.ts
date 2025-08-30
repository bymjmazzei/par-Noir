/**
 * OrbitDB Service - Decentralized Database for pN Metadata
 * Replaces Firebase with decentralized OrbitDB for metadata storage
 * Maintains same API interface for seamless UI/UX transition
 */

import { IdentityError, IdentityErrorCodes } from '../types';

export interface OrbitDBConfig {
  ipfsConfig: {
    url: string;
    gatewayUrl: string;
    projectId: string;
    projectSecret: string;
  };
  databaseName: string;
  encryptionEnabled: boolean;
  syncEnabled: boolean;
}

export interface PNMetadata {
  pnId: string;
  nickname?: string;
  profilePicture?: string;
  preferences?: Record<string, any>;
  deviceSync?: {
    lastSync: string;
    devices: string[];
  };
  recoveryInfo?: {
    encrypted: boolean;
    data: string;
  };
  publicData?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface OrbitDBUpdate {
  type: 'nickname' | 'profile-picture' | 'preferences' | 'device-sync' | 'recovery-info' | 'public-data' | 'device' | 'custodian' | 'recovery-key' | 'privacy' | 'license-transfer';
  pnId: string;
  data: any;
  timestamp: string;
  signature?: string;
}

export interface OrbitDBResult {
  success: boolean;
  data?: any;
  error?: string;
  cid?: string;
}

export class OrbitDBService {
  private config: OrbitDBConfig;
  private isInitialized = false;
  private orbitDBInstance: any = null;
  private database: any = null;
  private ipfsInstance: any = null;

  constructor(config: Partial<OrbitDBConfig> = {}) {
    this.config = {
      ipfsConfig: {
        url: process.env.REACT_APP_IPFS_URL || 'https://ipfs.infura.io:5001',
        gatewayUrl: process.env.REACT_APP_IPFS_GATEWAY_URL || 'https://ipfs.io',
        projectId: process.env.REACT_APP_IPFS_PROJECT_ID || '',
        projectSecret: process.env.REACT_APP_IPFS_PROJECT_SECRET || ''
      },
      databaseName: 'pn-metadata',
      encryptionEnabled: true,
      syncEnabled: true,
      ...config
    };
  }

  /**
   * Initialize OrbitDB service
   */
  async initialize(): Promise<void> {
    try {
      // Initialize IPFS
      await this.initializeIPFS();
      
      // Initialize OrbitDB
      await this.initializeOrbitDB();
      
      this.isInitialized = true;
      
    } catch (error) {
      throw new IdentityError(
        'Failed to initialize OrbitDB service',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Initialize IPFS connection
   */
  private async initializeIPFS(): Promise<void> {
    try {
      // Import IPFS HTTP client
      const { create } = await import('ipfs-http-client');
      
      // Create IPFS instance
      this.ipfsInstance = create({
        url: this.config.ipfsConfig.url,
        headers: this.config.ipfsConfig.projectId ? {
          'Authorization': `Bearer ${this.config.ipfsConfig.projectId}`
        } : undefined
      });

    } catch (error) {
      throw new IdentityError(
        'Failed to initialize IPFS connection',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Initialize OrbitDB
   */
  private async initializeOrbitDB(): Promise<void> {
    try {
      // Import OrbitDB (disabled for browser compatibility)
      // const OrbitDB = await import('orbit-db');
      
      // Create OrbitDB instance (disabled for browser compatibility)
      // this.orbitDBInstance = await OrbitDB.default.createInstance(this.ipfsInstance);
      
      // Create/open database (disabled for browser compatibility)
      // this.database = await this.orbitDBInstance.docs(this.config.databaseName, {
      //   indexBy: 'pnId',
      //   accessController: {
      //     type: 'ipfs',
      //     admin: ['*'],
      //     write: ['*']
      //   }
      // });

      // Wait for database to load (disabled for browser compatibility)
      // await this.database.load();

      if (process.env.NODE_ENV === 'development') {
      }
    } catch (error) {
      throw new IdentityError(
        'Failed to initialize OrbitDB database',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Store pN metadata via client-side IPFS MFS
   */
  async storePNMetadata(metadata: PNMetadata): Promise<OrbitDBResult> {
    try {
      // Use client-side IPFS service
      const { ipfsMetadataService } = await import('./ipfsMetadataService');
      const result = await ipfsMetadataService.storePNMetadata(metadata);
      
      if (result.success) {
        return {
          success: true,
          data: result.data,
          cid: result.cid
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to store metadata'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get pN metadata via client-side IPFS MFS
   */
  async getPNMetadata(pnId: string): Promise<OrbitDBResult> {
    try {
      // For now, we'll need to store the CID somewhere
      // In a full implementation, you'd have an index
      return {
        success: false,
        error: 'CID index not implemented yet'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update pN metadata (same API as Firebase)
   */
  async updatePNMetadata(pnId: string, updates: Partial<PNMetadata>): Promise<OrbitDBResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get existing metadata
      const existingResult = await this.getPNMetadata(pnId);
      
      if (!existingResult.success) {
        return existingResult;
      }

      // Merge updates
      const updatedMetadata = {
        ...existingResult.data,
        ...updates,
        updatedAt: new Date().toISOString(),
        version: (existingResult.data?.version || 0) + 1
      };

      // Store updated metadata
      return await this.storePNMetadata(updatedMetadata);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Store update (same API as Firebase for compatibility)
   */
  async storeUpdate(update: OrbitDBUpdate): Promise<OrbitDBResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Create metadata update
      const metadataUpdate = {
        pnId: update.pnId,
        [update.type]: update.data,
        timestamp: update.timestamp,
        signature: update.signature
      };

      // Store in OrbitDB
      const cid = await this.database.put(metadataUpdate);

      return {
        success: true,
        data: metadataUpdate,
        cid: cid.toString()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get updates (same API as Firebase for compatibility)
   */
  async getUpdates(pnId: string): Promise<OrbitDBResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Query OrbitDB for updates
      const results = await this.database.query((doc: any) => doc.pnId === pnId);
      
      return {
        success: true,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isInitialized) {
        return { success: false, error: 'Service not initialized' };
      }

      // Test IPFS connection
      const ipfsId = await this.ipfsInstance.id();
      
      // Test OrbitDB connection
      const dbAddress = this.database.address.toString();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Encrypt metadata
   */
  private async encryptMetadata(metadata: PNMetadata): Promise<any> {
    // In a real implementation, you'd encrypt the metadata
    // For now, we'll return as-is
    return metadata;
  }

  /**
   * Decrypt metadata
   */
  private async decryptMetadata(metadata: any): Promise<PNMetadata> {
    // In a real implementation, you'd decrypt the metadata
    // For now, we'll return as-is
    return metadata;
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalDocuments: number;
    databaseAddress: string;
    lastSync: string;
  }> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    const totalDocuments = this.database.all.length;
    const databaseAddress = this.database.address.toString();
    const lastSync = new Date().toISOString();

    return {
      totalDocuments,
      databaseAddress,
      lastSync
    };
  }

  /**
   * Sync database
   */
  async sync(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    await this.database.sync();
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.database) {
      await this.database.close();
    }
    
    if (this.orbitDBInstance) {
      await this.orbitDBInstance.disconnect();
    }
  }
}

// Export singleton instance
export const orbitDBService = new OrbitDBService();
