// Data Migrator - Handles data migration between storage types
import { LocalStorageManager } from './localStorageManager';
import { IndexedDBManager } from './indexedDBManager';

export class DataMigrator {
  private localStorageManager: LocalStorageManager;
  private indexedDBManager: IndexedDBManager;

  constructor(localStorageManager: LocalStorageManager, indexedDBManager: IndexedDBManager) {
    this.localStorageManager = localStorageManager;
    this.indexedDBManager = indexedDBManager;
  }

  /**
   * Migrate data between storage types
   */
  async migrateData(fromMode: 'localStorage' | 'indexedDB', toMode: 'localStorage' | 'indexedDB'): Promise<void> {
    try {
      // Get all data from source
      const allData: { [key: string]: any } = {};

      if (fromMode === 'localStorage') {
        const keys = await this.localStorageManager.getAllKeys();
        for (const key of keys) {
          allData[key] = await this.localStorageManager.retrieve(key);
        }
      } else {
        const keys = await this.indexedDBManager.getAllKeys();
        for (const key of keys) {
          allData[key] = await this.indexedDBManager.retrieve(key);
        }
      }

      // Store in tination
      for (const [key, data] of Object.entries(allData)) {
        if (toMode === 'localStorage') {
          await this.localStorageManager.store(key, data);
        } else {
          await this.indexedDBManager.store(key, data);
        }
      }

      // Clear source
      if (fromMode === 'localStorage') {
        await this.localStorageManager.clear();
      } else {
        await this.indexedDBManager.clear();
      }
    } catch (error) {
      throw new Error(`Failed to migrate data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
