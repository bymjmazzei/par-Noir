// Local Storage Utility for Identity Dashboard
// Provides secure, encrypted storage with offline-first capabilities

interface StorageItem {
  data: any;
  timestamp: number;
  version: string;
  checksum: string;
}

interface StorageConfig {
  encryptionKey?: string;
  maxAge?: number; // in milliseconds
  version?: string;
}

class SecureLocalStorage {
  private encryptionKey: string;
  private maxAge: number;
  private version: string;
  private db: IDBDatabase | null = null;
  private dbName = 'IdentityDashboardDB';
  private dbVersion = 1;

  constructor(config: StorageConfig = {}) {
    this.encryptionKey = config.encryptionKey || this.generateKey();
    this.maxAge = config.maxAge || 30 * 24 * 60 * 60 * 1000; // 30 days
    this.version = config.version || '1.0.0';
    this.initIndexedDB();
  }

  // Initialize IndexedDB for larger data storage
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('identities')) {
          const identityStore = db.createObjectStore('identities', { keyPath: 'id' });
          identityStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('recovery')) {
          const recoveryStore = db.createObjectStore('recovery', { keyPath: 'id' });
          recoveryStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('sync')) {
          const syncStore = db.createObjectStore('sync', { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // Generate encryption key
  private generateKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Encrypt data
  private async encrypt(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.encryptionKey),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );

    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  // Decrypt data
  private async decrypt(encryptedData: string): Promise<string> {
    try {
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(this.encryptionKey),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      throw new Error('Failed to decrypt data');
    }
  }

  // Generate checksum
  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Store data securely
  async setItem(key: string, data: any, useIndexedDB = false): Promise<void> {
    const item: StorageItem = {
      data,
      timestamp: Date.now(),
      version: this.version,
      checksum: this.generateChecksum(JSON.stringify(data))
    };

    const encryptedData = await this.encrypt(JSON.stringify(item));

    if (useIndexedDB && this.db) {
      await this.setItemIndexedDB(key, encryptedData);
    } else {
      localStorage.setItem(key, encryptedData);
    }
  }

  // Get data securely
  async getItem(key: string, useIndexedDB = false): Promise<any> {
    try {
      let encryptedData: string;

      if (useIndexedDB && this.db) {
        encryptedData = await this.getItemIndexedDB(key);
      } else {
        encryptedData = localStorage.getItem(key) || '';
      }

      if (!encryptedData) {
        return null;
      }

      const decryptedData = await this.decrypt(encryptedData);
      const item: StorageItem = JSON.parse(decryptedData);

      // Check version compatibility
      if (item.version !== this.version) {
        if (process.env.NODE_ENV === 'development') {
        }
      }

      // Check data integrity
      const currentChecksum = this.generateChecksum(JSON.stringify(item.data));
      if (item.checksum !== currentChecksum) {
        throw new Error('Data integrity check failed');
      }

      // Check expiration
      if (Date.now() - item.timestamp > this.maxAge) {
        if (process.env.NODE_ENV === 'development') {
        }
        this.removeItem(key, useIndexedDB);
        return null;
      }

      return item.data;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      }
      return null;
    }
  }

  // Remove data
  async removeItem(key: string, useIndexedDB = false): Promise<void> {
    if (useIndexedDB && this.db) {
      await this.removeItemIndexedDB(key);
    } else {
      localStorage.removeItem(key);
    }
  }

  // Clear all data
  async clear(useIndexedDB = false): Promise<void> {
    if (useIndexedDB && this.db) {
      await this.clearIndexedDB();
    } else {
      localStorage.clear();
    }
  }

  // IndexedDB operations
  private async setItemIndexedDB(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction(['identities', 'recovery', 'settings', 'sync'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getItemIndexedDB(key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : '');
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async removeItemIndexedDB(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async clearIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const transaction = this.db.transaction(['identities', 'recovery', 'settings', 'sync'], 'readwrite');
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      ['identities', 'recovery', 'settings', 'sync'].forEach(storeName => {
        const store = transaction.objectStore(storeName);
        store.clear();
      });
    });
  }

  // Identity-specific storage methods
  async saveIdentity(identity: any): Promise<void> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readwrite');
      const store = transaction.objectStore('identities');
      const request = store.put({
        id: identity.id,
        data: identity,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getIdentity(id: string): Promise<any> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readonly');
      const store = transaction.objectStore('identities');
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllIdentities(): Promise<any[]> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readonly');
      const store = transaction.objectStore('identities');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        resolve(results.map(item => item.data));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteIdentity(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readwrite');
      const store = transaction.objectStore('identities');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Export/Import functionality
  async exportData(): Promise<string> {
    const data = {
      identities: await this.getAllIdentities(),
      settings: await this.getItem('settings', true),
      timestamp: Date.now(),
      version: this.version
    };

    return btoa(JSON.stringify(data));
  }

  async importData(exportedData: string): Promise<void> {
    try {
      const data = JSON.parse(atob(exportedData));
      
      if (data.version !== this.version) {
        // Silently handle version mismatches during import in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
      }

      // Clear existing data
      await this.clear(true);

      // Import identities
      for (const identity of data.identities) {
        await this.saveIdentity(identity);
      }

      // Import settings
      if (data.settings) {
        await this.setItem('settings', data.settings, true);
      }

      // Silently handle successful data import in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle data import failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      throw new Error('Invalid import data');
    }
  }

  // Get storage statistics
  async getStorageStats(): Promise<{
    totalSize: number;
    itemCount: number;
    identitiesCount: number;
    lastBackup: number | null;
  }> {
    try {
      const identities = await this.getAllIdentities();
      const settings = await this.getItem('settings', true);
      
      return {
        totalSize: JSON.stringify({ identities, settings }).length,
        itemCount: identities.length + (settings ? 1 : 0),
        identitiesCount: identities.length,
        lastBackup: await this.getItem('lastBackup', true)
      };
    } catch (error) {
      // Return default stats if IndexedDB is not initialized
      // Silently handle IndexedDB unavailability in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      return {
        totalSize: 0,
        itemCount: 0,
        identitiesCount: 0,
        lastBackup: null
      };
    }
  }
}

// Create and export singleton instance
export const secureStorage = new SecureLocalStorage();

// Export types
export type { StorageItem, StorageConfig }; 