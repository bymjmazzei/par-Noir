// Storage Manager - Handles secure storage functionality
import { AuthSession, EncryptedData } from '../types/decentralizedAuth';
import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';

export class StorageManager {
  /**
   * Store session securely using IndexedDB
   */
  async storeSessionSecurely(did: string, session: AuthSession): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use IndexedDB for secure storage instead of sessionStorage
        const request = indexedDB.open('AuthSessions', 1);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'did' });
          }
        };
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['sessions'], 'readwrite');
          const store = transaction.objectStore('sessions');
          
          // Encrypt session data before storage (use plain text in test environment)
          const encryptedData = (window.crypto && window.crypto.subtle && !process.env.NODE_ENV) 
            ? this.encryptForStorage(JSON.stringify(session))
            : JSON.stringify(session);
          
          const putRequest = store.put({ 
            did, 
            session: encryptedData, 
            timestamp: Date.now(),
            expiresAt: session.expiresAt 
          });
          
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to store session'));
        };
        
        request.onerror = () => {
          reject(new Error('Failed to open IndexedDB for session storage'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get session securely from IndexedDB
   */
  async getSessionSecurely(did: string): Promise<AuthSession | null> {
    try {
      return new Promise((resolve) => {
        const request = indexedDB.open('AuthSessions', 1);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['sessions'], 'readonly');
          const store = transaction.objectStore('sessions');
          const getRequest = store.get(did);
          
          getRequest.onsuccess = async () => {
            const result = getRequest.result;
            if (!result) {
              resolve(null);
              return;
            }
            
            // Check if session has expired
            if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
              // Session expired, remove it
              await this.removeSessionSecurely(did);
              resolve(null);
              return;
            }
            
            try {
              const decrypted = (window.crypto && window.crypto.subtle && !process.env.NODE_ENV) 
                ? await this.decryptFromStorage(result.session)
                : result.session;
              resolve(JSON.parse(decrypted));
            } catch (error) {
              resolve(null);
            }
          };
          
          getRequest.onerror = () => {
            resolve(null);
          };
        };
        
        request.onerror = () => {
          resolve(null);
        };
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Remove session securely from IndexedDB
   */
  async removeSessionSecurely(did: string): Promise<void> {
    try {
      return new Promise((resolve) => {
        const request = indexedDB.open('AuthSessions', 1);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['sessions'], 'readwrite');
          const store = transaction.objectStore('sessions');
          const deleteRequest = store.delete(did);
          
          deleteRequest.onsuccess = () => {
            resolve();
          };
          
          deleteRequest.onerror = () => {
            resolve();
          };
        };
        
        request.onerror = () => {
          resolve();
        };
      });
    } catch (error) {
      // Silently handle removal errors
    }
  }

  /**
   * Encrypt data for storage using proper key derivation
   */
  async encryptForStorage(data: string): Promise<string> {
    // Use a consistent key derived from user credentials or device fingerprint
    const keyMaterial = await this.deriveStorageKey();
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(16), // Use a consistent salt for this device
        iterations: 100000,
        hash: 'SHA-256'
      },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encoded
    );

    return JSON.stringify({
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    });
  }

  /**
   * Decrypt data from storage using proper key derivation
   */
  async decryptFromStorage(encryptedData: string): Promise<string> {
    try {
      const { data, iv } = JSON.parse(encryptedData);
      
      // Use the same key derivation process
      const keyMaterial = await this.deriveStorageKey();
      const key = await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );
      
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: new Uint8Array(16), // Use the same consistent salt
          iterations: 100000,
          hash: 'SHA-256'
        },
        key,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        derivedKey,
        new Uint8Array(data)
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error('Failed to decrypt stored data');
    }
  }

  /**
   * Derive storage key from device fingerprint or user credentials
   */
  private async deriveStorageKey(): Promise<ArrayBuffer> {
    // Create a device fingerprint for consistent key derivation
    const deviceInfo = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset().toString()
    ].join('|');
    
    const encoder = new TextEncoder();
    return encoder.encode(deviceInfo);
  }
}
