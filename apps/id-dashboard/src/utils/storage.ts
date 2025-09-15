import { EncryptedIdentity, AuthSession } from './crypto';

export interface StoredIdentity {
  publicKey: string;
  encryptedData: string;
  iv: string;
  salt: string;
  lastAccessed: string;
  // Additional properties for compatibility
  id?: string;
  username?: string;
  nickname?: string;
  createdAt?: string;
  profilePicture?: string;
}

export interface StoredSession {
  id: string;
  accessToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface StoredCustodian {
  id: string;
  identityId: string;
  name: string;
  type: 'self-recovery' | 'person' | 'service';
  status: 'active' | 'pending';
  addedAt: string;
  lastVerified?: string;
  canApprove: boolean;
  contactType?: 'email' | 'phone';
  contactValue?: string;
  invitationId?: string;
  invitationExpires?: string;
}

// Recovery keys are now encrypted and stored within each identity's encryptedData
// No separate interface needed

export interface StoredDevice {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'tablet' | 'other';
  lastSync: string;
  status: 'active' | 'inactive';
  location?: string;
  ipAddress?: string;
  isPrimary: boolean;
  deviceFingerprint: string;
  syncKey: string;
  pairedAt: string;
}

export class SecureStorage {
  private static readonly DB_NAME = 'IdentityProtocolDB';
  private static readonly DB_VERSION = 1;
  private db: IDBDatabase | null = null;

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SecureStorage.DB_NAME, SecureStorage.DB_VERSION);

      request.onerror = () => reject(new Error('Failed to open database'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('identities')) {
          const identityStore = db.createObjectStore('identities', { keyPath: 'publicKey' });
          identityStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }

        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('custodians')) {
          const custodianStore = db.createObjectStore('custodians', { keyPath: 'id' });
          custodianStore.createIndex('identityId', 'identityId', { unique: false });
        }

        // Recovery keys are now encrypted and stored within each identity's encryptedData
        // No separate object store needed

        if (!db.objectStoreNames.contains('devices')) {
          const deviceStore = db.createObjectStore('devices', { keyPath: 'id' });
          deviceStore.createIndex('identityId', 'identityId', { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Store encrypted identity
   */
  async storeIdentity(identity: EncryptedIdentity): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const storedIdentity: StoredIdentity = {
      publicKey: identity.publicKey,
      encryptedData: identity.encryptedData,
      iv: identity.iv,
      salt: identity.salt,
      lastAccessed: new Date().toISOString()
    };

    return this.performTransaction('identities', 'readwrite', (store) => {
      store.put(storedIdentity);
    });
  }

  /**
   * Get all stored identities
   */
  async getIdentities(): Promise<StoredIdentity[]> {
    return this.performTransaction('identities', 'readonly', (store) => {
      return new Promise<StoredIdentity[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as StoredIdentity[]);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Get a specific identity by public key
   */
  async getIdentity(publicKey: string): Promise<StoredIdentity | null> {
    return this.performTransaction('identities', 'readonly', (store) => {
      return new Promise<StoredIdentity | null>((resolve, reject) => {
        const request = store.get(publicKey);
        request.onsuccess = () => resolve(request.result as StoredIdentity | null);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Create a new identity
   */
  async createIdentity(name: string): Promise<StoredIdentity> {
    // Generate secure identity data
    const identityId = this.generateSecureId();
    const publicKey = await this.generatePublicKey();
    const encryptedData = await this.encryptIdentityData({
      pnName: name,
      nickname: name,
      email: '',
      phone: '',
      recoveryEmail: '',
      recoveryPhone: '',
      createdAt: new Date().toISOString(),
      status: 'active',
      custodiansRequired: false,
      custodiansSetup: false
    });
    
    const identity: StoredIdentity = {
      publicKey,
      encryptedData: encryptedData.data,
      iv: encryptedData.iv,
      salt: encryptedData.salt,
      lastAccessed: new Date().toISOString(),
      id: identityId,
      username: name,
      nickname: name,
      createdAt: new Date().toISOString()
    };
    
    await this.storeIdentity(identity as any);
    return identity;
  }

  /**
   * Generate a secure random ID
   */
  private generateSecureId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate a public key for the identity
   */
  private async generatePublicKey(): Promise<string> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
      );
      
      const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      return btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));
    } catch (error) {
      // Fallback to timestamp-based key if crypto fails
      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      const randomString = Array.from(randomBytes).map(b => b.toString(36)).join('').substring(0, 8);
      return `pk_${Date.now()}_${randomString}`;
    }
  }

  /**
   * Encrypt identity data
   */
  private async encryptIdentityData(data: any): Promise<{data: string, iv: string, salt: string}> {
    try {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      
      const dataString = JSON.stringify(data);
      const dataBuffer = new TextEncoder().encode(dataString);
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataBuffer
      );
      
      return {
        data: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
        iv: btoa(String.fromCharCode(...iv)),
        salt: btoa(String.fromCharCode(...salt))
      };
    } catch (error) {
      // Fallback to base64 encoding if crypto fails
      const dataString = JSON.stringify(data);
      return {
        data: btoa(dataString),
        iv: btoa('fallback-iv'),
        salt: btoa('fallback-salt')
      };
    }
  }

  /**
   * Update an existing identity
   */
  async updateIdentity(id: string, newName: string): Promise<StoredIdentity> {
    // Mock implementation - in real app, this would update the encrypted identity
    const existingIdentity = await this.getIdentity(id);
    if (!existingIdentity) {
      throw new Error('Identity not found');
    }
    
    const updatedIdentity: StoredIdentity = {
      ...existingIdentity,
      nickname: newName,
      lastAccessed: new Date().toISOString()
    };
    
    await this.storeIdentity(updatedIdentity as any);
    return updatedIdentity;
  }

  /**
   * Delete identity by public key
   */
  async deleteIdentity(publicKey: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return this.performTransaction('identities', 'readwrite', (store) => {
      store.delete(publicKey);
    });
  }

  /**
   * Store authentication session
   */
  async storeSession(session: AuthSession): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const storedSession: StoredSession = {
      id: session.id,
      accessToken: session.accessToken,
      expiresAt: new Date(Date.now() + session.expiresIn * 1000).toISOString(),
      createdAt: session.authenticatedAt
    };

    return this.performTransaction('sessions', 'readwrite', (store) => {
      store.put(storedSession);
    });
  }

  /**
   * Get current valid session
   */
  async getCurrentSession(): Promise<StoredSession | null> {
    return this.performTransaction('sessions', 'readonly', (store) => {
      return new Promise<StoredSession | null>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const sessions = request.result as StoredSession[];
          const validSession = sessions.find(session =>
            new Date(session.expiresAt) > new Date()
          );
          resolve(validSession || null);
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Clear expired sessions
   */
  async clearExpiredSessions(): Promise<void> {
    return this.performTransaction('sessions', 'readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const sessions = request.result as StoredSession[];
          const expiredSessions = sessions.filter(session =>
            new Date(session.expiresAt) <= new Date()
          );
          
          expiredSessions.forEach(session => store.delete(session.id));
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Store custodian
   */
  async storeCustodian(custodian: StoredCustodian): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return this.performTransaction('custodians', 'readwrite', (store) => {
      store.put(custodian);
    });
  }

  /**
   * Get custodians for an identity
   */
  async getCustodians(identityId: string): Promise<StoredCustodian[]> {
    return this.performTransaction('custodians', 'readonly', (store) => {
      return new Promise<StoredCustodian[]>((resolve, reject) => {
        const index = store.index('identityId');
        const request = index.getAll(identityId);
        request.onsuccess = () => resolve(request.result as StoredCustodian[]);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Recovery keys are now encrypted and stored within each identity's encryptedData
   * No separate storage is needed - keys are retrieved by decrypting the identity
   */

  /**
   * Store device
   */
  async storeDevice(device: StoredDevice): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return this.performTransaction('devices', 'readwrite', (store) => {
      store.put(device);
    });
  }

  /**
   * Get devices for an identity
   */
  async getDevices(identityId: string): Promise<StoredDevice[]> {
    return this.performTransaction('devices', 'readonly', (store) => {
      return new Promise<StoredDevice[]>((resolve, reject) => {
        const index = store.index('identityId');
        const request = index.getAll(identityId);
        request.onsuccess = () => resolve(request.result as StoredDevice[]);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Store setting
   */
  async storeSetting(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return this.performTransaction('settings', 'readwrite', (store) => {
      store.put({ key, value: JSON.stringify(value) });
    });
  }

  /**
   * Get a setting value
   */
  async getSetting(key: string): Promise<any> {
    return this.performTransaction('settings', 'readonly', (store) => {
      return new Promise<any>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? JSON.parse(result.value) : null);
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Get all settings
   */
  async getAllSettings(): Promise<Record<string, any>> {
    return this.performTransaction('settings', 'readonly', (store) => {
      return new Promise<Record<string, any>>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const settings: Record<string, any> = {};
          const results = request.result as Array<{ key: string; value: string }>;
          
          for (const item of results) {
            settings[item.key] = JSON.parse(item.value);
          }
          
          resolve(settings);
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Export all data for backup
   */
  async exportData(): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    // Export ONLY the static identity data
    // Dynamic data (sessions, custodians, devices, settings) stays in dashboard metadata
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      identities: await this.getIdentities()
      // Note: All other data (sessions, custodians, devices, settings) 
      // is dashboard metadata and not part of the static ID file
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import data from backup
   */
  async importData(backupData: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const data = JSON.parse(backupData);
    
    // Clear existing identities only
    await this.clearAllData();

    // Import ONLY identities (static data)
    for (const identity of data.identities || []) {
      await this.storeIdentity(identity as EncryptedIdentity);
    }

    // Note: Dynamic data (sessions, custodians, devices, settings) 
    // is not imported as it's dashboard metadata, not part of the ID file
  }

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Only clear identities since that's all we import from ID files
    // Other data (sessions, custodians, devices, settings) is dashboard metadata
    await this.performTransaction('identities', 'readwrite', (store) => {
      store.clear();
    });
  }

  /**
   * Perform database transaction
   */
  private async performTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => T | Promise<T>
  ): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      transaction.onerror = () => reject(new Error('Transaction failed'));

      try {
        const result = operation(store);
        if (result instanceof Promise) {
          result.then(resolve).catch(reject);
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(error);
      }
    });
  }
} 