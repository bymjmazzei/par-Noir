/**
 * IndexedDB storage layer for the Identity Protocol
 */

import { DID, IdentityError, IdentityErrorCodes } from '../types';
import { CryptoManager } from '../encryption/crypto';

export interface StorageConfig {
  databaseName: string;
  version: number;
  storeName: string;
}

export class IndexedDBStorage {
  private config: StorageConfig;
  private db: IDBDatabase | null = null;

  constructor(config: StorageConfig = {
    databaseName: 'IdentityProtocol',
    version: 1,
    storeName: 'dids'
  }) {
    this.config = config;
  }

  /**
   * Initialize the database
   */
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

  /**
   * Store encrypted DID with enhanced security
   */
  async storeDID(did: DID, passcode: string): Promise<void> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    try {
      // Validate DID structure
      this.validateDIDStructure(did);

      // Encrypt the DID data with enhanced security
      const didData = JSON.stringify(did);
      
      // Validate data size (prevent DoS)
      if (didData.length > 1024 * 1024) { // 1MB limit
        throw new IdentityError(
          'DID data too large',
          IdentityErrorCodes.VALIDATION_ERROR
        );
      }

      const encryptedData = await CryptoManager.encrypt(didData, passcode);

      // Verify encryption was successful
      const testDecrypt = await CryptoManager.decrypt(encryptedData, passcode);
      if (testDecrypt !== didData) {
        throw new IdentityError(
          'Encryption verification failed',
          IdentityErrorCodes.ENCRYPTION_ERROR
        );
      }

      const transaction = this.db.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);

      const request = store.put({
        id: did.id,
        pnName: did.pnName,
        encryptedData: encryptedData,
        createdAt: did.createdAt,
        updatedAt: did.updatedAt,
        status: did.status,
        // Add security metadata
        security: {
          lastModified: new Date().toISOString(),
          checksum: await CryptoManager.hash(didData),
          version: '1.0'
        }
      });

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => {
          reject(new IdentityError(
            'Failed to store DID',
            IdentityErrorCodes.STORAGE_ERROR,
            request.error
          ));
        };
      });
    } catch (error) {
      throw new IdentityError(
        'Failed to encrypt and store DID',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Get DID with enhanced security validation
   */
  async getDID(didId: string, passcode: string): Promise<DID> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    try {
      const transaction = this.db.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.get(didId);

      return new Promise((resolve, reject) => {
        request.onsuccess = async () => {
          if (!request.result) {
            reject(new IdentityError(
              'DID not found',
              IdentityErrorCodes.NOT_FOUND_ERROR
            ));
            return;
          }

          const storedData = request.result;
          
          // Validate stored data structure
          if (!storedData.encryptedData || !storedData.security) {
            reject(new IdentityError(
              'Invalid stored data structure',
              IdentityErrorCodes.STORAGE_ERROR
            ));
            return;
          }

          try {
            // Decrypt the DID data
            const decryptedData = await CryptoManager.decrypt(storedData.encryptedData, passcode);
            const did: DID = JSON.parse(decryptedData);

            // Verify data integrity
            const expectedChecksum = storedData.security.checksum;
            const actualChecksum = await CryptoManager.hash(decryptedData);
            
            if (expectedChecksum !== actualChecksum) {
              reject(new IdentityError(
                'Data integrity check failed',
                IdentityErrorCodes.STORAGE_ERROR
              ));
              return;
            }

            // Validate decrypted DID structure
            this.validateDIDStructure(did);

            resolve(did);
          } catch (error) {
            reject(new IdentityError(
              'Failed to decrypt DID',
              IdentityErrorCodes.ENCRYPTION_ERROR,
              error
            ));
          }
        };

        request.onerror = () => {
          reject(new IdentityError(
            'Failed to retrieve DID',
            IdentityErrorCodes.STORAGE_ERROR,
            request.error
          ));
        };
      });
    } catch (error) {
      throw new IdentityError(
        'Failed to decrypt DID',
        IdentityErrorCodes.ENCRYPTION_ERROR,
        error
      );
    }
  }

  /**
   * Get all DIDs (without decryption)
   */
  async getAllDIDs(): Promise<Array<{ id: string; pnName: string; createdAt: string; status: string }>> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    const transaction = this.db.transaction([this.config.storeName], 'readonly');
    const store = transaction.objectStore(this.config.storeName);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const results = request.result.map(item => ({
          id: item.id,
          pnName: item.pnName,
          createdAt: item.createdAt,
          status: item.status
        }));
        resolve(results);
      };

      request.onerror = () => {
        reject(new IdentityError(
          'Failed to retrieve DIDs',
          IdentityErrorCodes.STORAGE_ERROR,
          request.error
        ));
      };
    });
  }

  /**
   * Update DID with enhanced security
   */
  async updateDID(did: DID, passcode: string): Promise<void> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    try {
      // Validate DID structure
      this.validateDIDStructure(did);

      // Update timestamp
      did.updatedAt = new Date().toISOString();

      // Re-encrypt with fresh salt
      const didData = JSON.stringify(did);
      const encryptedData = await CryptoManager.encrypt(didData, passcode);

      const transaction = this.db.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);

      const request = store.put({
        id: did.id,
        pnName: did.pnName,
        encryptedData: encryptedData,
        createdAt: did.createdAt,
        updatedAt: did.updatedAt,
        status: did.status,
        security: {
          lastModified: new Date().toISOString(),
          checksum: await CryptoManager.hash(didData),
          version: '1.0'
        }
      });

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => {
          reject(new IdentityError(
            'Failed to update DID',
            IdentityErrorCodes.STORAGE_ERROR,
            request.error
          ));
        };
      });
    } catch (error) {
      throw new IdentityError(
        'Failed to update DID',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Delete DID with secure cleanup
   */
  async deleteDID(didId: string): Promise<void> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    try {
      const transaction = this.db.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.delete(didId);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          // Perform secure cleanup
          this.performSecureCleanup();
          resolve();
        };
        request.onerror = () => {
          reject(new IdentityError(
            'Failed to delete DID',
            IdentityErrorCodes.STORAGE_ERROR,
            request.error
          ));
        };
      });
    } catch (error) {
      throw new IdentityError(
        'Failed to delete DID',
        IdentityErrorCodes.STORAGE_ERROR,
        error
      );
    }
  }

  /**
   * Check if DID exists
   */
  async hasDID(didId: string): Promise<boolean> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    const transaction = this.db.transaction([this.config.storeName], 'readonly');
    const store = transaction.objectStore(this.config.storeName);
    const request = store.count(didId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result > 0);
      };

      request.onerror = () => {
        reject(new IdentityError(
          'Failed to check DID existence',
          IdentityErrorCodes.STORAGE_ERROR,
          request.error
        ));
      };
    });
  }

  /**
   * Get DID by pN Name
   */
  async getDIDByPNName(pnName: string): Promise<{ id: string; pnName: string; createdAt: string; status: string } | null> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    const transaction = this.db.transaction([this.config.storeName], 'readonly');
    const store = transaction.objectStore(this.config.storeName);
    const index = store.index('pnName');
    const request = index.get(pnName);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
        } else {
          resolve({
            id: result.id,
            pnName: result.pnName,
            createdAt: result.createdAt,
            status: result.status
          });
        }
      };

      request.onerror = () => {
        reject(new IdentityError(
          'Failed to retrieve DID by username',
          IdentityErrorCodes.STORAGE_ERROR,
          request.error
        ));
      };
    });
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new IdentityError(
        'Database not initialized',
        IdentityErrorCodes.STORAGE_ERROR
      );
    }

    const transaction = this.db.transaction([this.config.storeName], 'readwrite');
    const store = transaction.objectStore(this.config.storeName);
    const request = store.clear();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new IdentityError(
          'Failed to clear storage',
          IdentityErrorCodes.STORAGE_ERROR,
          request.error
        ));
      };
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Validate DID structure for security
   */
  private validateDIDStructure(did: DID): void {
    // Required fields
    if (!did.id || !did.pnName || !did.createdAt || !did.updatedAt) {
      throw new IdentityError(
        'Invalid DID structure: missing required fields',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate DID format
    if (!did.id.startsWith('did:key:')) {
      throw new IdentityError(
        'Invalid DID format',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate pnName format
    if (!/^[a-zA-Z0-9-]{3,20}$/.test(did.pnName)) {
      throw new IdentityError(
        'Invalid username format',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate dates
    const createdAt = new Date(did.createdAt);
    const updatedAt = new Date(did.updatedAt);
    
    if (isNaN(createdAt.getTime()) || isNaN(updatedAt.getTime())) {
      throw new IdentityError(
        'Invalid date format',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    if (updatedAt < createdAt) {
      throw new IdentityError(
        'Updated date cannot be before created date',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate status
    if (!['active', 'inactive', 'suspended'].includes(did.status)) {
      throw new IdentityError(
        'Invalid DID status',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate metadata structure
    if (!did.metadata || typeof did.metadata !== 'object') {
      throw new IdentityError(
        'Invalid metadata structure',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }

    // Validate keys structure
    if (!did.keys || !did.keys.publicKey || !did.keys.privateKey) {
      throw new IdentityError(
        'Invalid keys structure',
        IdentityErrorCodes.VALIDATION_ERROR
      );
    }
  }

  /**
   * Perform secure cleanup after deletion
   */
  private performSecureCleanup(): void {
    // Clear any cached data
    if (typeof window !== 'undefined' && window.caches) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName);
        });
      });
    }

    // Clear session storage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }

    // Clear any IndexedDB caches
    if (this.db) {
      const transaction = this.db.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      
      // Clear any temporary data
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        // Force garbage collection if available
        if (typeof window !== 'undefined' && (window as any).gc) {
          (window as any).gc();
        }
      };
    }
  }
} 