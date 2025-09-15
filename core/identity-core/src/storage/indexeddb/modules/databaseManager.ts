import { StorageConfig, DID } from '../types/indexeddb';
// Simple error handling for compilation
class IdentityError extends Error {
  constructor(message: string, code?: string, cause?: any) {
    super(message);
    this.name = 'IdentityError';
  }
}

const IdentityErrorCodes = {
  STORAGE_ERROR: 'STORAGE_ERROR'
};

export class DatabaseManager {
  private config: StorageConfig;
  private db: IDBDatabase | null = null;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.databaseName, this.config.version);

      request.onerror = () => {
        reject(new IdentityError(
          'Failed to open IndexedDB',
          IdentityErrorCodes.STORAGE_ERROR,
          request.error
        ));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const store = db.createObjectStore(this.config.storeName, { keyPath: 'id' });
          store.createIndex('pnName', 'pnName', { unique: true });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  getDatabase(): IDBDatabase | null {
    return this.db;
  }

  getConfig(): StorageConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<StorageConfig>): Promise<void> {
    if (newConfig.databaseName !== this.config.databaseName || 
        newConfig.version !== this.config.version) {
      await this.close();
      this.config = { ...this.config, ...newConfig };
      await this.initialize();
    } else {
      this.config = { ...this.config, ...newConfig };
    }
  }

  async clearDatabase(): Promise<void> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new IdentityError(
          'Failed to clear database',
          IdentityErrorCodes.STORAGE_ERROR,
          request.error
        ));
      };
    });
  }

  async getDatabaseSize(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const data = request.result;
        const size = JSON.stringify(data).length;
        resolve(size);
      };

      request.onerror = () => resolve(0);
    });
  }

  async getObjectStoreNames(): Promise<string[]> {
    if (!this.db) {
      return [];
    }
    return Array.from(this.db.objectStoreNames);
  }

  async createObjectStore(name: string, keyPath: string, options?: IDBObjectStoreParameters): Promise<void> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    if (this.db.objectStoreNames.contains(name)) {
      return; // Store already exists
    }

    // Note: Creating object stores requires a version upgrade
    // This is a simplified implementation
    // Console statement removed for production
  }
}
