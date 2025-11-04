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

    // Initialize Google Drive backend
    const googleDriveBackend = new GoogleDriveBackend();
    this.backends.set('google_drive', googleDriveBackend);

    this.isInitialized = true;
  }

  getBackend(backendId: string): StorageBackend | null {
    return this.backends.get(backendId) || null;
  }

  async aggregateFiles(pnIdentifier?: string): Promise<any[]> {
    await this.ensureInitialized();
    
    const googleDriveBackend = this.getBackend('google_drive');
    if (!googleDriveBackend || !googleDriveBackend.isConnected()) {
      return [];
    }

    try {
      const files = await googleDriveBackend.listFiles(pnIdentifier);
      return files.map(file => ({
        ...file,
        backend: 'google_drive',
        backendFileId: file.id,
      }));
    } catch (error) {
      console.error('Failed to aggregate files from Google Drive:', error);
      return [];
    }
  }
}

let fileAggregatorServiceInstance: FileAggregatorService | null = null;

export function getFileAggregatorService(): FileAggregatorService {
  if (!fileAggregatorServiceInstance) {
    fileAggregatorServiceInstance = new FileAggregatorService();
  }
  return fileAggregatorServiceInstance;
}

