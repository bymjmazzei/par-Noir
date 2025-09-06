/**
 * IndexedDB Storage Implementation for Identity SDK
 */

export interface IndexedDBConfig {
  databaseName: string;
  version: number;
  storeName: string;
}

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private config: IndexedDBConfig;

  constructor(config: Partial<IndexedDBConfig> = {}) {
    this.config = {
      databaseName: 'IdentitySDKDB',
      version: 1,
      storeName: 'identity-data',
      ...config
    };
  }

  /**
   * Initialize the IndexedDB database
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.databaseName, this.config.version);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const store = db.createObjectStore(this.config.storeName, { keyPath: 'key' });
          store.createIndex('key', 'key', { unique: true });
        }
      };
    });
  }

  /**
   * Set a value in IndexedDB
   */
  async setItem(key: string, value: string): Promise<void> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      
      const request = store.put({ key, value, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store data in IndexedDB'));
    });
  }

  /**
   * Get a value from IndexedDB
   */
  async getItem(key: string): Promise<string | null> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      
      request.onerror = () => reject(new Error('Failed to retrieve data from IndexedDB'));
    });
  }

  /**
   * Remove a value from IndexedDB
   */
  async removeItem(key: string): Promise<void> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to remove data from IndexedDB'));
    });
  }

  /**
   * Clear all data from IndexedDB
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear IndexedDB'));
    });
  }

  /**
   * Get all keys from IndexedDB
   */
  async keys(): Promise<string[]> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const keys = request.result as string[];
        resolve(keys);
      };
      
      request.onerror = () => reject(new Error('Failed to get keys from IndexedDB'));
    });
  }

  /**
   * Get the length of stored data
   */
  async length(): Promise<number> {
    const keys = await this.keys();
    return keys.length;
  }

  /**
   * Check if IndexedDB is supported
   */
  static isSupported(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
