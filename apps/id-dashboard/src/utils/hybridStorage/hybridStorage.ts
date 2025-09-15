import { cryptoWorkerManager } from './cryptoWorkerManager';
// Main HybridStorage Class - Maintains backward compatibility while using modular components
import { StorageConfig, StorageStats } from '../types/hybridStorage';
import { EnvironmentDetector } from './environmentDetector';
import { StorageInitializer } from './storageInitializer';
import { LocalStorageManager } from './localStorageManager';
import { IndexedDBManager } from './indexedDBManager';
import { StorageStatsManager } from './storageStats';
import { DataMigrator } from './dataMigrator';

export class HybridStorage {
  private config: StorageConfig;
  private environmentDetector: EnvironmentDetector;
  private storageInitializer: StorageInitializer;
  private localStorageManager: LocalStorageManager;
  private indexedDBManager: IndexedDBManager;
  private storageStatsManager: StorageStatsManager;
  private dataMigrator: DataMigrator;
  private storageMode: 'localStorage' | 'indexedDB' | 'hybrid' = 'hybrid';

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      mode: 'auto',
      encryptionEnabled: true,
      syncEnabled: true,
      maxStorageSize: 50 * 1024 * 1024, // 50MB
      ...config
    };

    // Initialize components
    this.environmentDetector = new EnvironmentDetector();
    this.storageInitializer = new StorageInitializer();
    this.localStorageManager = new LocalStorageManager(this.config);
    this.indexedDBManager = new IndexedDBManager();
    this.storageStatsManager = new StorageStatsManager(this.config);
    this.dataMigrator = new DataMigrator(this.localStorageManager, this.indexedDBManager);

    // Detect environment
    this.storageMode = this.environmentDetector.detectEnvironment(this.config.mode);
  }

  /**
   * Initialize storage
   */
  async initialize(): Promise<void> {
    await this.storageInitializer.initialize(this.storageMode);
  }

  /**
   * Store data with appropriate strategy
   */
  async store(key: string, data: any): Promise<void> {
    try {
      if (this.storageMode === 'localStorage') {
        await this.localStorageManager.store(key, data);
      } else if (this.storageMode === 'indexedDB') {
        await this.indexedDBManager.store(key, data);
      } else {
        // Hybrid: try IndexedDB, fallback to localStorage
        try {
          await this.indexedDBManager.store(key, data);
        } catch (error) {
          await this.localStorageManager.store(key, data);
        }
      }
    } catch (error) {
      throw new Error(`Failed to store data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve data with appropriate strategy
   */
  async retrieve(key: string): Promise<any> {
    try {
      if (this.storageMode === 'localStorage') {
        return await this.localStorageManager.retrieve(key);
      } else if (this.storageMode === 'indexedDB') {
        return await this.indexedDBManager.retrieve(key);
      } else {
        // Hybrid: try IndexedDB first, fallback to localStorage
        try {
          return await this.indexedDBManager.retrieve(key);
        } catch (error) {
          return await this.localStorageManager.retrieve(key);
        }
      }
    } catch (error) {
      throw new Error(`Failed to retrieve data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete data with appropriate strategy
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.storageMode === 'localStorage') {
        await this.localStorageManager.delete(key);
      } else if (this.storageMode === 'indexedDB') {
        await this.indexedDBManager.delete(key);
      } else {
        // Hybrid: try both
        try {
          await this.indexedDBManager.delete(key);
        } catch (error) {
          await this.localStorageManager.delete(key);
        }
      }
    } catch (error) {
      throw new Error(`Failed to delete data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all keys
   */
  async getAllKeys(): Promise<string[]> {
    try {
      if (this.storageMode === 'localStorage') {
        return await this.localStorageManager.getAllKeys();
      } else if (this.storageMode === 'indexedDB') {
        return await this.indexedDBManager.getAllKeys();
      } else {
        // Hybrid: combine both
        const localStorageKeys = await this.localStorageManager.getAllKeys();
        const indexedDBKeys = await this.indexedDBManager.getAllKeys();
        return [...new Set([...localStorageKeys, ...indexedDBKeys])];
      }
    } catch (error) {
      throw new Error(`Failed to get keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    try {
      if (this.storageMode === 'localStorage') {
        await this.localStorageManager.clear();
      } else if (this.storageMode === 'indexedDB') {
        await this.indexedDBManager.clear();
      } else {
        // Hybrid: clear both
        await this.localStorageManager.clear();
        await this.indexedDBManager.clear();
      }
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    return await this.storageStatsManager.getStats(this.storageMode);
  }

  /**
   * Get storage mode
   */
  getStorageMode(): string {
    return this.storageMode;
  }

  /**
   * Check if running as PWA
   */
  isPWAMode(): boolean {
    return this.environmentDetector.isPWAMode();
  }

  /**
   * Migrate data between storage types
   */
  async migrateData(fromMode: 'localStorage' | 'indexedDB', toMode: 'localStorage' | 'indexedDB'): Promise<void> {
    return await this.dataMigrator.migrateData(fromMode, toMode);
  }
}
