/**
 * File Aggregator Service
 * Manages multiple storage backends and aggregates files
 */

import { StorageBackend } from '../../types/aggregator';
import { GoogleDriveBackend } from '../storage/GoogleDriveBackend';

export class FileAggregatorService {
  private backends: Map<string, StorageBackend> = new Map();
  private isInitialized = false;

  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // No default backends; they will be registered as users connect accounts
    this.isInitialized = true;
  }

  registerBackend(backendId: string, backend: StorageBackend): void {
    this.backends.set(backendId, backend);
  }

  removeBackend(backendId: string): void {
    this.backends.delete(backendId);
  }

  listBackendEntries(): Array<{ id: string; backend: StorageBackend }> {
    return Array.from(this.backends.entries()).map(([id, backend]) => ({ id, backend }));
  }

  getAllBackends(): Map<string, StorageBackend> {
    return this.backends;
  }

  async getAggregatedStorageQuota(): Promise<Map<string, any>> {
    await this.ensureInitialized();
    const result = new Map<string, any>();

    for (const [backendId, backend] of this.backends.entries()) {
      if (!backend.isConnected()) {
        continue;
      }

      try {
        const quota = await backend.getQuota?.();
        if (quota) {
          result.set(backendId, quota);
        }
      } catch (error) {
        console.warn(`Failed to get quota for backend ${backendId}:`, error);
      }
    }

    return result;
  }

  async getAggregatedUserInfo(): Promise<Map<string, any>> {
    await this.ensureInitialized();
    const result = new Map<string, any>();

    for (const [backendId, backend] of this.backends.entries()) {
      if (!backend.isConnected()) {
        continue;
      }

      try {
        const info = await backend.getUserInfo?.();
        if (info) {
          result.set(backendId, info);
        }
      } catch (error) {
        console.warn(`Failed to get user info for backend ${backendId}:`, error);
      }
    }

    return result;
  }

  getBackend(backendId: string): StorageBackend | null {
    return this.backends.get(backendId) || null;
  }

  async aggregateFiles(pnIdentifier?: string): Promise<any[]> {
    await this.ensureInitialized();
    
    const aggregated: any[] = [];

    for (const [backendId, backend] of this.backends.entries()) {
      if (!backend.isConnected()) {
        continue;
    }

    try {
        const files = await backend.listFiles(undefined, pnIdentifier);
        files.forEach(file => {
          aggregated.push({
        ...file,
            backend: backendId,
        backendFileId: file.id,
          });
        });
    } catch (error) {
        console.error(`Failed to aggregate files from backend ${backendId}:`, error);
      }
    }

    return aggregated;
  }

  async downloadFromBackend(backendId: string, fileId: string): Promise<Blob> {
    await this.ensureInitialized();
    
    const backend = this.getBackend(backendId);
    if (!backend) {
      throw new Error(`Backend ${backendId} not found`);
    }

    if (!backend.isConnected()) {
      throw new Error(`Backend ${backendId} is not connected`);
    }

    return await backend.downloadFile(fileId);
  }

  async uploadToBackend(
    backendId: string,
    file: File,
    folderId?: string,
    options?: { fileName?: string; pnIdentifier?: string }
  ): Promise<any> {
    await this.ensureInitialized();
    
    const backend = this.getBackend(backendId);
    if (!backend) {
      throw new Error(`Backend ${backendId} not found`);
    }

    if (!backend.isConnected()) {
      throw new Error(`Backend ${backendId} is not connected`);
    }

    // Pass options as metadata to match GoogleDriveBackend.uploadFile signature
    return await backend.uploadFile(file, folderId, options);
  }
}

let fileAggregatorServiceInstance: FileAggregatorService | null = null;

export function getFileAggregatorService(): FileAggregatorService {
  if (!fileAggregatorServiceInstance) {
    fileAggregatorServiceInstance = new FileAggregatorService();
  }
  return fileAggregatorServiceInstance;
}

