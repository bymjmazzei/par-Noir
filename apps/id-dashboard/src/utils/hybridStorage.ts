/**
 * Hybrid Storage Strategy for Identity Protocol
 * Provides different storage strategies for PWA vs WebApp
 */

export interface StorageConfig {
  mode: 'pwa' | 'webapp' | 'auto';
  encryptionEnabled: boolean;
  syncEnabled: boolean;
  maxStorageSize: number; // in bytes
}

export interface StorageStats {
  totalSize: number;
  usedSize: number;
  availableSize: number;
  itemCount: number;
  lastSync: string;
  syncStatus: 'synced' | 'pending' | 'error';
}

export class HybridStorage {
  private config: StorageConfig;
  private isPWA: boolean = false;
  private storageMode: 'localStorage' | 'indexedDB' | 'hybrid' = 'hybrid';

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      mode: 'auto',
      encryptionEnabled: true,
      syncEnabled: true,
      maxStorageSize: 50 * 1024 * 1024, // 50MB
      ...config
    };

    this.detectEnvironment();
  }

  /**
   * Detect if running as PWA or WebApp
   */
  private detectEnvironment(): void {
    // Check if running as PWA
    this.isPWA = this.checkPWAMode();
    
    // Determine storage mode
    if (this.config.mode === 'pwa' || (this.config.mode === 'auto' && this.isPWA)) {
      this.storageMode = 'localStorage';
    } else if (this.config.mode === 'webapp') {
      this.storageMode = 'indexedDB';
    } else {
      this.storageMode = 'hybrid';
    }
  }

  /**
   * Check if running in PWA mode
   */
  private checkPWAMode(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      window.location.protocol === 'file:'
    );
  }

  /**
   * Initialize storage
   */
  async initialize(): Promise<void> {
    try {
      if (this.storageMode === 'localStorage') {
        await this.initializeLocalStorage();
      } else if (this.storageMode === 'indexedDB') {
        await this.initializeIndexedDB();
      } else {
        await this.initializeHybrid();
      }
    } catch (error) {
      throw new Error(`Failed to initialize storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize localStorage for PWA
   */
  private async initializeLocalStorage(): Promise<void> {
    // Test localStorage availability
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (error) {
      throw new Error('localStorage is not available');
    }
  }

  /**
   * Initialize IndexedDB for WebApp
   */
  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IdentityProtocolDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => resolve();

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('identities')) {
          db.createObjectStore('identities', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Initialize hybrid storage
   */
  private async initializeHybrid(): Promise<void> {
    // Try IndexedDB first, fallback to localStorage
    try {
      await this.initializeIndexedDB();
      this.storageMode = 'indexedDB';
    } catch (error) {
      try {
        await this.initializeLocalStorage();
        this.storageMode = 'localStorage';
      } catch (localStorageError) {
        throw new Error('No storage method available');
      }
    }
  }

  /**
   * Store data with appropriate strategy
   */
  async store(key: string, data: any): Promise<void> {
    try {
      if (this.storageMode === 'localStorage') {
        await this.storeInLocalStorage(key, data);
      } else if (this.storageMode === 'indexedDB') {
        await this.storeInIndexedDB(key, data);
      } else {
        // Hybrid: try IndexedDB, fallback to localStorage
        try {
          await this.storeInIndexedDB(key, data);
        } catch (error) {
          await this.storeInLocalStorage(key, data);
        }
      }
    } catch (error) {
      throw new Error(`Failed to store data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store data in localStorage
   */
  private async storeInLocalStorage(key: string, data: any): Promise<void> {
    const serializedData = JSON.stringify({
      data,
      timestamp: Date.now(),
      version: '1.0'
    });

    // Check storage quota
    if (this.getLocalStorageSize() + serializedData.length > this.config.maxStorageSize) {
      throw new Error('Storage quota exceeded');
    }

    localStorage.setItem(key, serializedData);
  }

  /**
   * Store data in IndexedDB
   */
  private async storeInIndexedDB(key: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IdentityProtocolDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['identities'], 'readwrite');
        const store = transaction.objectStore('identities');

        const storeData = {
          id: key,
          data,
          timestamp: Date.now(),
          version: '1.0'
        };

        const putRequest = store.put(storeData);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(new Error('Failed to store data in IndexedDB'));
      };
    });
  }

  /**
   * Retrieve data with appropriate strategy
   */
  async retrieve(key: string): Promise<any> {
    try {
      if (this.storageMode === 'localStorage') {
        return await this.retrieveFromLocalStorage(key);
      } else if (this.storageMode === 'indexedDB') {
        return await this.retrieveFromIndexedDB(key);
      } else {
        // Hybrid: try IndexedDB first, fallback to localStorage
        try {
          return await this.retrieveFromIndexedDB(key);
        } catch (error) {
          return await this.retrieveFromLocalStorage(key);
        }
      }
    } catch (error) {
      throw new Error(`Failed to retrieve data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve data from localStorage
   */
  private async retrieveFromLocalStorage(key: string): Promise<any> {
    const stored = localStorage.getItem(key);
    if (!stored) {
      throw new Error('Data not found');
    }

    const parsed = JSON.parse(stored);
    return parsed.data;
  }

  /**
   * Retrieve data from IndexedDB
   */
  private async retrieveFromIndexedDB(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IdentityProtocolDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['identities'], 'readonly');
        const store = transaction.objectStore('identities');

        const getRequest = store.get(key);
        getRequest.onsuccess = () => {
          if (getRequest.result) {
            resolve(getRequest.result.data);
          } else {
            reject(new Error('Data not found'));
          }
        };
        getRequest.onerror = () => reject(new Error('Failed to retrieve data from IndexedDB'));
      };
    });
  }

  /**
   * Delete data with appropriate strategy
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.storageMode === 'localStorage') {
        localStorage.removeItem(key);
      } else if (this.storageMode === 'indexedDB') {
        await this.deleteFromIndexedDB(key);
      } else {
        // Hybrid: try both
        try {
          await this.deleteFromIndexedDB(key);
        } catch (error) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      throw new Error(`Failed to delete data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete data from IndexedDB
   */
  private async deleteFromIndexedDB(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IdentityProtocolDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['identities'], 'readwrite');
        const store = transaction.objectStore('identities');

        const deleteRequest = store.delete(key);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(new Error('Failed to delete data from IndexedDB'));
      };
    });
  }

  /**
   * Get all keys
   */
  async getAllKeys(): Promise<string[]> {
    try {
      if (this.storageMode === 'localStorage') {
        return Object.keys(localStorage);
      } else if (this.storageMode === 'indexedDB') {
        return await this.getAllKeysFromIndexedDB();
      } else {
        // Hybrid: combine both
        const localStorageKeys = Object.keys(localStorage);
        const indexedDBKeys = await this.getAllKeysFromIndexedDB();
        return [...new Set([...localStorageKeys, ...indexedDBKeys])];
      }
    } catch (error) {
      throw new Error(`Failed to get keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all keys from IndexedDB
   */
  private async getAllKeysFromIndexedDB(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IdentityProtocolDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['identities'], 'readonly');
        const store = transaction.objectStore('identities');

        const getAllKeysRequest = store.getAllKeys();
        getAllKeysRequest.onsuccess = () => {
          resolve(getAllKeysRequest.result as string[]);
        };
        getAllKeysRequest.onerror = () => reject(new Error('Failed to get keys from IndexedDB'));
      };
    });
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    try {
      if (this.storageMode === 'localStorage') {
        localStorage.clear();
      } else if (this.storageMode === 'indexedDB') {
        await this.clearIndexedDB();
      } else {
        // Hybrid: clear both
        localStorage.clear();
        await this.clearIndexedDB();
      }
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear IndexedDB
   */
  private async clearIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IdentityProtocolDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['identities'], 'readwrite');
        const store = transaction.objectStore('identities');

        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(new Error('Failed to clear IndexedDB'));
      };
    });
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    try {
      let totalSize = 0;
      let itemCount = 0;

      if (this.storageMode === 'localStorage') {
        totalSize = this.getLocalStorageSize();
        itemCount = localStorage.length;
      } else if (this.storageMode === 'indexedDB') {
        const stats = await this.getIndexedDBStats();
        totalSize = stats.totalSize;
        itemCount = stats.itemCount;
      } else {
        // Hybrid: combine both
        const localStorageSize = this.getLocalStorageSize();
        const localStorageCount = localStorage.length;
        const indexedDBStats = await this.getIndexedDBStats();
        
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

  /**
   * Get localStorage size
   */
  private getLocalStorageSize(): number {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        size += key.length + localStorage.getItem(key)!.length;
      }
    }
    return size;
  }

  /**
   * Get IndexedDB statistics
   */
  private async getIndexedDBStats(): Promise<{ totalSize: number; itemCount: number }> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IdentityProtocolDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['identities'], 'readonly');
        const store = transaction.objectStore('identities');

        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const items = getAllRequest.result;
          const totalSize = JSON.stringify(items).length;
          resolve({
            totalSize,
            itemCount: items.length
          });
        };
        getAllRequest.onerror = () => reject(new Error('Failed to get IndexedDB stats'));
      };
    });
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
    return this.isPWA;
  }

  /**
   * Migrate data between storage types
   */
  async migrateData(fromMode: 'localStorage' | 'indexedDB', toMode: 'localStorage' | 'indexedDB'): Promise<void> {
    try {
      // Get all data from source
      const allData: { [key: string]: any } = {};

      if (fromMode === 'localStorage') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            allData[key] = await this.retrieveFromLocalStorage(key);
          }
        }
      } else {
        const keys = await this.getAllKeysFromIndexedDB();
        for (const key of keys) {
          allData[key] = await this.retrieveFromIndexedDB(key);
        }
      }

      // Store in destination
      for (const [key, data] of Object.entries(allData)) {
        if (toMode === 'localStorage') {
          await this.storeInLocalStorage(key, data);
        } else {
          await this.storeInIndexedDB(key, data);
        }
      }

      // Clear source
      if (fromMode === 'localStorage') {
        localStorage.clear();
      } else {
        await this.clearIndexedDB();
      }
    } catch (error) {
      throw new Error(`Failed to migrate data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
