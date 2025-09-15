import { DIDDocument, VerificationMethod, Service } from './types/distributedIdentityManager';

export class DIDDocumentManager {
  /**
   * Create DID document
   */
  createDidDocument(did: string, publicKeyString: string): DIDDocument {
    const now = new Date().toISOString();
    
    const verificationMethod: VerificationMethod = {
      id: `${did}#keys-1`,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: publicKeyString
    };

    const service: Service = {
      id: `${did}#linked-domain`,
      type: 'LinkedDomains',
      serviceEndpoint: 'https://example.com'
    };

    const didDocument: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: did,
      verificationMethod: [verificationMethod],
      authentication: [`${did}#keys-1`],
      assertionMethod: [`${did}#keys-1`],
      keyAgreement: [`${did}#keys-1`],
      capabilityInvocation: [`${did}#keys-1`],
      capabilityDelegation: [`${did}#keys-1`],
      service: [service],
      created: now,
      updated: now
    };

    return didDocument;
  }

  /**
   * Store DID document securely using IndexedDB
   */
  async storeDidDocument(did: string, didDocument: DIDDocument): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use IndexedDB for secure storage instead of localStorage
        const request = indexedDB.open('DIDDocuments', 1);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('documents')) {
            db.createObjectStore('documents', { keyPath: 'id' });
          }
        };
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['documents'], 'readwrite');
          const store = transaction.objectStore('documents');
          const putRequest = store.put({ id: did, document: didDocument, timestamp: Date.now() });
          
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to store DID document'));
        };
        
        request.onerror = () => {
          reject(new Error('Failed to open IndexedDB for DID document storage'));
        };
      } catch (error) {
        reject(new Error('Failed to store DID document securely'));
      }
    });
  }

  /**
   * Retrieve DID document from secure storage
   */
  async getDidDocument(did: string): Promise<DIDDocument | null> {
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('DIDDocuments', 1);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['documents'], 'readonly');
          const store = transaction.objectStore('documents');
          const getRequest = store.get(did);
          
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            resolve(result ? result.document : null);
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
   * Update DID document
   */
  async updateDidDocument(did: string, updates: Partial<DIDDocument>): Promise<DIDDocument | null> {
    try {
      const existing = await this.getDidDocument(did);
      if (!existing) return null;

      const updated: DIDDocument = {
        ...existing,
        ...updates,
        updated: new Date().toISOString()
      };

      await this.storeDidDocument(did, updated);
      return updated;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete DID document from secure storage
   */
  async deleteDidDocument(did: string): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const request = indexedDB.open('DIDDocuments', 1);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['documents'], 'readwrite');
          const store = transaction.objectStore('documents');
          const deleteRequest = store.delete(did);
          
          deleteRequest.onsuccess = () => {
            resolve(true);
          };
          
          deleteRequest.onerror = () => {
            resolve(false);
          };
        };
        
        request.onerror = () => {
          resolve(false);
        };
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate DID document structure
   */
  validateDidDocument(didDocument: any): boolean {
    try {
      // Basic validation
      if (!didDocument || typeof didDocument !== 'object') return false;
      if (!didDocument.id || typeof didDocument.id !== 'string') return false;
      if (!didDocument.verificationMethod || !Array.isArray(didDocument.verificationMethod)) return false;
      if (!didDocument.created || typeof didDocument.created !== 'string') return false;
      if (!didDocument.updated || typeof didDocument.updated !== 'string') return false;

      // Validate verification methods
      for (const vm of didDocument.verificationMethod) {
        if (!vm.id || !vm.type || !vm.controller) return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Export DID document
   */
  exportDidDocument(did: string): string | null {
    try {
      const didDocument = this.getDidDocument(did);
      if (!didDocument) return null;

      return JSON.stringify(didDocument, null, 2);
    } catch (error) {
      // Console statement removed for production
      return null;
    }
  }

  /**
   * Import DID document
   */
  importDidDocument(did: string, didDocumentData: string): boolean {
    try {
      const didDocument = JSON.parse(didDocumentData);
      
      if (!this.validateDidDocument(didDocument)) {
        throw new Error('Invalid DID document structure');
      }

      this.storeDidDocument(did, didDocument);
      return true;
    } catch (error) {
      // Console statement removed for production
      return false;
    }
  }

  /**
   * List all stored DID documents
   */
  async listStoredDIDs(): Promise<string[]> {
    try {
      return new Promise((resolve) => {
        const request = indexedDB.open('DIDDocuments', 1);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['documents'], 'readonly');
          const store = transaction.objectStore('documents');
          const getAllRequest = store.getAll();
          
          getAllRequest.onsuccess = () => {
            const results = getAllRequest.result;
            const dids = results.map((item: any) => item.id);
            resolve(dids);
          };
          
          getAllRequest.onerror = () => {
            resolve([]);
          };
        };
        
        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get DID document size in bytes
   */
  async getDidDocumentSize(did: string): Promise<number> {
    try {
      const document = await this.getDidDocument(did);
      if (!document) return 0;
      
      return new Blob([JSON.stringify(document)]).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get total storage usage for DID documents
   */
  async getTotalStorageUsage(): Promise<number> {
    try {
      let totalSize = 0;
      const dids = await this.listStoredDIDs();
      
      for (const did of dids) {
        totalSize += await this.getDidDocumentSize(did);
      }
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }
}
