import { IPFSConfig, IPFSStats, IPFSPinResponse } from '../types/ipfsService';
import { FileManager } from './fileManager';
import { ConnectionManager } from './connectionManager';

export class IPFSService {
  private config: IPFSConfig;
  
  // Modular managers
  private fileManager: FileManager;
  private connectionManager: ConnectionManager;

  constructor(config: IPFSConfig) {
    this.config = config;
    this.fileManager = new FileManager();
    this.connectionManager = new ConnectionManager(config);
  }

  async initialize(): Promise<void> {
    await this.connectionManager.initialize();
  }

  async uploadFile(file: File | ArrayBuffer, name?: string) {
    return this.fileManager.uploadFile(file, name);
  }

  async downloadFile(cid: string) {
    return this.fileManager.downloadFile(cid);
  }

  async deleteFile(cid: string): Promise<boolean> {
    return this.fileManager.deleteFile(cid);
  }

  async getFileMetadata(cid: string) {
    return this.fileManager.getFileMetadata(cid);
  }

  async listFiles() {
    return this.fileManager.listFiles();
  }

  async pinFile(cid: string): Promise<IPFSPinResponse> {
    try {
      const success = await this.fileManager.pinFile(cid);
      return {
        success,
        cid,
        pinned: success
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async unpinFile(cid: string): Promise<IPFSPinResponse> {
    try {
      const success = await this.fileManager.unpinFile(cid);
      return {
        success,
        cid,
        pinned: !success
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  getStats(): IPFSStats {
    return {
      totalFiles: this.fileManager.getFileCount(),
      totalSize: this.fileManager.getTotalSize(),
      pinnedFiles: this.fileManager.getPinnedFileCount(),
      gatewayRequests: 0
    };
  }

  getGatewayUrl(cid: string): string {
    return this.fileManager.getGatewayUrl(cid);
  }

  isReady(): boolean {
    return this.connectionManager.isReady();
  }

  getConfig(): IPFSConfig {
    return this.connectionManager.getConfig();
  }

  async updateConfig(newConfig: Partial<IPFSConfig>): Promise<void> {
    await this.connectionManager.updateConfig(newConfig);
  }

  getFileManager(): FileManager {
    return this.fileManager;
  }

  getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  async testConnection(): Promise<boolean> {
    return this.connectionManager.testConnection();
  }

  async reconnect(): Promise<boolean> {
    return this.connectionManager.reconnect();
  }

  disconnect(): void {
    this.connectionManager.disconnect();
  }

  getConnectionStatus() {
    return this.connectionManager.getConnectionStatus();
  }
}
