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
export type { StorageFile, StorageQuota, StorageUserInfo, StorageBackendConfig };

export abstract class AbstractStorageBackend {
  protected config: StorageBackendConfig | null = null;
  readonly id: string;
  readonly name: string;
  readonly type: string;

  constructor(config?: StorageBackendConfig) {
    this.config = config ?? null;
    this.id = config?.id ?? '';
    this.name = config?.name ?? '';
    this.type = config?.type ?? 'local';
  }

  abstract connect(credentials: any): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;
  abstract listFiles(folderId?: string, pnIdentifier?: string): Promise<StorageFile[]>;
  abstract uploadFile(file: File, folderId?: string, metadata?: unknown): Promise<StorageFile>;
  abstract downloadFile(fileId: string): Promise<Blob>;
  abstract deleteFile(fileId: string): Promise<void>;
  abstract getUserInfo(): Promise<StorageUserInfo | null>;

  async getQuota(): Promise<StorageQuota | null> {
    return null;
  }

  getAccessToken(): string | null {
    return null;
  }
  
  configure(config: StorageBackendConfig): void {
    this.config = config;
  }
}

export type StorageBackend = AbstractStorageBackend;

