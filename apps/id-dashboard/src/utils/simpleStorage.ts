/**
 * Simple Storage System - SECURE VERSION
 * 
 * Migrated from localStorage to IndexedDB for enhanced security.
 * IndexedDB is harder for browser extensions to access and provides better isolation.
 */

export interface SimpleIdentity {
  id: string;
  nickname: string;
  // SECURITY: pnName is a SECRET and must NOT be stored in plaintext
  // Use pnNameHash for lookup instead
  pnNameHash?: string; // Optional hash for lookup (first 16 chars of SHA-256)
  publicKey: string;
  encryptedData: any;
  createdAt: string;
  lastAccessed: string;
}

export class SimpleStorage {
  private static instance: SimpleStorage;
  private static readonly DB_NAME = 'SimpleIdentityStorageDB';
  private static readonly DB_VERSION = 1;
  private static readonly STORE_NAME = 'identities';
  private db: IDBDatabase | null = null;
  
  private constructor() {
    this.init();
  }
  
  static getInstance(): SimpleStorage {
    if (!SimpleStorage.instance) {
      SimpleStorage.instance = new SimpleStorage();
    }
    return SimpleStorage.instance;
  }

  /**
   * Initialize IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SimpleStorage.DB_NAME, SimpleStorage.DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open SimpleStorage IndexedDB');
        // Fallback to localStorage for compatibility
        resolve();
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(SimpleStorage.STORE_NAME)) {
          const store = db.createObjectStore(SimpleStorage.STORE_NAME, { keyPath: 'id' });
          store.createIndex('publicKey', 'publicKey', { unique: true });
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };
    });
  }

  /**
   * Perform a transaction
   */
  private async performTransaction<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => Promise<T> | T
  ): Promise<T> {
    await this.init();
    
    if (!this.db) {
      // Fallback to localStorage if IndexedDB not available
      return this.fallbackToLocalStorage(mode, callback);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(SimpleStorage.STORE_NAME, mode);
      const store = transaction.objectStore(SimpleStorage.STORE_NAME);

      transaction.onerror = () => reject(transaction.error);

      try {
        const callbackResult = callback(store);
        if (callbackResult instanceof Promise) {
          callbackResult
            .then(res => {
              transaction.oncomplete = () => resolve(res);
            })
            .catch(reject);
        } else {
          transaction.oncomplete = () => resolve(callbackResult);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Fallback to localStorage for compatibility (legacy support)
   * SECURITY: This is less secure than IndexedDB but provides backward compatibility
   */
  private async fallbackToLocalStorage<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => Promise<T> | T
  ): Promise<T> {
    const STORAGE_KEY = 'simple_identities';
    
    if (mode === 'readonly') {
      const stored = localStorage.getItem(STORAGE_KEY);
      const identities: SimpleIdentity[] = stored ? JSON.parse(stored) : [];
      // Create a mock store-like object for callback
      const mockStore = {
        getAll: () => {
          return new Promise<SimpleIdentity[]>((resolve) => {
            resolve(identities);
          });
        },
        get: (id: string) => {
          return new Promise<SimpleIdentity | null>((resolve) => {
            resolve(identities.find(i => i.id === id) || null);
          });
        }
      } as any;
      return callback(mockStore) as T;
    } else {
      // For write operations, read from localStorage, modify, write back
      const stored = localStorage.getItem(STORAGE_KEY);
      const identities: SimpleIdentity[] = stored ? JSON.parse(stored) : [];
      
      const mockStore = {
        put: (identity: SimpleIdentity) => {
          return new Promise<void>((resolve) => {
            const index = identities.findIndex(i => i.id === identity.id);
            if (index >= 0) {
              identities[index] = identity;
            } else {
              identities.push(identity);
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(identities));
            resolve();
          });
        },
        delete: (id: string) => {
          return new Promise<void>((resolve) => {
            const filtered = identities.filter(i => i.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
            resolve();
          });
        },
        clear: () => {
          return new Promise<void>((resolve) => {
            localStorage.removeItem(STORAGE_KEY);
            resolve();
          });
        }
      } as any;
      
      const result = await callback(mockStore);
      return result;
    }
  }
  
  /**
   * Store an identity
   */
  async storeIdentity(identity: SimpleIdentity): Promise<void> {
    return this.performTransaction('readwrite', async (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put(identity);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }
  
  /**
   * Get all stored identities
   */
  async getIdentities(): Promise<SimpleIdentity[]> {
    return this.performTransaction('readonly', (store) => {
      return new Promise<SimpleIdentity[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as SimpleIdentity[]);
        request.onerror = () => reject(request.error);
      });
    });
  }
  
  /**
   * Get a specific identity by ID
   */
  async getIdentity(id: string): Promise<SimpleIdentity | null> {
    return this.performTransaction('readonly', (store) => {
      return new Promise<SimpleIdentity | null>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result as SimpleIdentity || null);
        request.onerror = () => reject(request.error);
      });
    });
  }
  
  /**
   * Update an identity's nickname
   */
  async updateNickname(id: string, newNickname: string): Promise<void> {
    return this.performTransaction('readwrite', async (store) => {
      const identity = await new Promise<SimpleIdentity | null>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result as SimpleIdentity || null);
        request.onerror = () => reject(request.error);
      });

      if (!identity) {
        throw new Error('Identity not found');
      }

      identity.nickname = newNickname;
      identity.lastAccessed = new Date().toISOString();

      return new Promise<void>((resolve, reject) => {
        const request = store.put(identity);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Update an identity completely
   */
  async updateIdentity(updatedIdentity: SimpleIdentity): Promise<void> {
    updatedIdentity.lastAccessed = new Date().toISOString();
    return this.storeIdentity(updatedIdentity);
  }
  
  /**
   * Delete an identity
   */
  async deleteIdentity(id: string): Promise<void> {
    return this.performTransaction('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }
  
  /**
   * Clear all identities
   */
  async clearAll(): Promise<void> {
    return this.performTransaction('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Migrate data from localStorage to IndexedDB (one-time migration)
   */
  async migrateFromLocalStorage(): Promise<void> {
    const STORAGE_KEY = 'simple_identities';
    const stored = localStorage.getItem(STORAGE_KEY);
    
    if (!stored) return; // Nothing to migrate

    try {
      const identities: SimpleIdentity[] = JSON.parse(stored);
      
      // Store each identity in IndexedDB
      for (const identity of identities) {
        await this.storeIdentity(identity);
      }
      
      // Clear localStorage after successful migration
      localStorage.removeItem(STORAGE_KEY);
      console.log(`[SimpleStorage] Migrated ${identities.length} identities from localStorage to IndexedDB`);
    } catch (error) {
      console.error('[SimpleStorage] Migration failed:', error);
      // Don't throw - allow app to continue with IndexedDB
    }
  }
}

export default SimpleStorage;
