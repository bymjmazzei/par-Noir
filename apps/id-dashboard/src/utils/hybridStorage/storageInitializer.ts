// Storage Initializer - Handles initialization for different storage types
export class StorageInitializer {
  /**
   * Initialize storage based on mode
   */
  async initialize(storageMode: 'localStorage' | 'indexedDB' | 'hybrid'): Promise<void> {
    try {
      if (storageMode === 'localStorage') {
        await this.initializeLocalStorage();
      } else if (storageMode === 'indexedDB') {
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
    } catch (error) {
      try {
        await this.initializeLocalStorage();
      } catch (localStorageError) {
        throw new Error('No storage method available');
      }
    }
  }
}
