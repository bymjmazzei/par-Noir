/**
 * Storage Backend Abstract Base Class
 * Defines the interface for all storage backends
 */

import {
  StorageFile,
  StorageQuota,
  StorageUserInfo,
  StorageBackendConfig
} from '../../types/aggregator';

export abstract class AbstractStorageBackend {
  protected config: StorageBackendConfig | null = null;

  abstract connect(credentials: any): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
  abstract listFiles(pnIdentifier?: string): Promise<StorageFile[]>;
  abstract uploadFile(file: File, pnIdentifier?: string): Promise<StorageFile>;
  abstract downloadFile(fileId: string): Promise<Blob>;
  abstract deleteFile(fileId: string): Promise<void>;
  abstract getQuota(): Promise<StorageQuota | null>;
  abstract getUserInfo(): Promise<StorageUserInfo | null>;
  
  configure(config: StorageBackendConfig): void {
    this.config = config;
  }
}

export type StorageBackend = AbstractStorageBackend;

