// DID Document Manager - Handles DID document management for identity sync
import { DIDDocumentUpdate } from '../types/identitySync';
import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';

export class DIDDocumentManager {
  /**
   * Update DID document
   */
  async updateDidDocument(did: string, updates: DIDDocumentUpdate): Promise<void> {
    try {
      const didDoc = {
        id: did,
        ...updates,
        updated: new Date().toISOString()
      };

      // Store the updated DID document securely
      // In a real implementation, this would update the actual DID document
      // For now, we'll store it locally
      await this.storeSecurely(`did:${did}`, JSON.stringify(didDoc));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Resolve DID document
   */
  async resolveDidDocument(did: string): Promise<any> {
    try {
      const stored = await this.getFromSecureStorage(`did:${did}`);
      if (!stored) {
        throw new Error('DID document not found');
      }

      const didDoc = JSON.parse(stored);
      if (!didDoc.id || !didDoc.service) {
        throw new Error('Invalid DID document structure');
      }

      return didDoc;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Store data securely
   */
  private async storeSecurely(key: string, data: string): Promise<void> {
    try {
      if (window.crypto && window.crypto.subtle) {
        const encrypted = await this.encryptForStorage(data);
        await this.storeInIndexedDB(key, encrypted);
      } else {
        await this.storeInIndexedDB(key, data);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get data from secure storage
   */
  private async getFromSecureStorage(key: string): Promise<string | null> {
    try {
      const encrypted = await this.getFromIndexedDB(key);
      if (!encrypted) return null;

      if (window.crypto && window.crypto.subtle) {
        return await this.decryptFromStorage(encrypted);
      } else {
        return encrypted;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Encrypt data for storage
   */
  private async encryptForStorage(data: string): Promise<string> {
    const key = await cryptoWorkerManager.generateKey(
      { name: 'AES-GCM', length: 256 } as AesKeyGenParams, 
      true, 
      ['encrypt', 'decrypt']
    ) as CryptoKey;
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    
    const encrypted = await cryptoWorkerManager.encrypt(
      { name: 'AES-GCM', iv } as AesGcmParams, 
      key, 
      encoded
    );
    
    return JSON.stringify({
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    });
  }

  /**
   * Decrypt data from storage
   */
  private async decryptFromStorage(encryptedData: string): Promise<string> {
    try {
      const { data, iv } = JSON.parse(encryptedData);
      const key = await cryptoWorkerManager.generateKey(
        { name: 'AES-GCM', length: 256 } as AesKeyGenParams, 
        true, 
        ['encrypt', 'decrypt']
      ) as CryptoKey;
      
      const decrypted = await cryptoWorkerManager.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) } as AesGcmParams, 
        key, 
        new Uint8Array(data)
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error('Failed to decrypt stored data');
    }
  }

  /**
   * Store data in IndexedDB
   */
  private async storeInIndexedDB(key: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DIDDocumentSync', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        const putRequest = store.put({ key, data, timestamp: Date.now() });
        
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Get data from IndexedDB
   */
  private async getFromIndexedDB(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DIDDocumentSync', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const getRequest = store.get(key);
        
        getRequest.onsuccess = () => {
          const result = getRequest.result;
          resolve(result ? result.data : null);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  }
}
