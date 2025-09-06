// Storage Stats - Handles storage statistics and monitoring
import { StorageStats, StorageConfig } from '../types/hybridStorage';
import { LocalStorageManager } from './localStorageManager';
import { IndexedDBManager } from './indexedDBManager';

export class StorageStatsManager {
  private config: StorageConfig;
  private localStorageManager: LocalStorageManager;
  private indexedDBManager: IndexedDBManager;

  constructor(config: StorageConfig) {
    this.config = config;
    this.localStorageManager = new LocalStorageManager(config);
    this.indexedDBManager = new IndexedDBManager();
  }

  /**
   * Get storage statistics
   */
  async getStats(storageMode: 'localStorage' | 'indexedDB' | 'hybrid'): Promise<StorageStats> {
    try {
      let totalSize = 0;
      let itemCount = 0;

      if (storageMode === 'localStorage') {
        totalSize = this.localStorageManager.getLocalStorageSize();
        itemCount = this.localStorageManager.getItemCount();
      } else if (storageMode === 'indexedDB') {
        const stats = await this.indexedDBManager.getStats();
        totalSize = stats.totalSize;
        itemCount = stats.itemCount;
      } else {
        // Hybrid: combine both
        const localStorageSize = this.localStorageManager.getLocalStorageSize();
        const localStorageCount = this.localStorageManager.getItemCount();
        const indexedDBStats = await this.indexedDBManager.getStats();
        
        totalSize = localStorageSize + indexedDBStats.totalSize;
        itemCount = localStorageCount + indexedDBStats.itemCount;
      }

      return {
        totalSize,
        usedSize: totalSize,
        availableSize: this.config.maxStorageSize - totalSize,
        itemCount,
        lastSync: new Date().toISOString(),
        syncStatus: 'synced'
      };
    } catch (error) {
      throw new Error(`Failed to get storage stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
