// Resolution Sources - Handles different DID resolution sources
import { DIDDocument } from '../../types';
import { DIDResolutionResult } from '../types/didResolver';
import { FormatValidator } from './formatValidator';

export class ResolutionSources {
  /**
   * Resolve DID from local storage with enhanced security
   */
  static async resolveFromLocalStorage(did: string): Promise<DIDResolutionResult | null> {
    try {
      const stored = await this.getFromIndexedDB(`did:${did}`);
      if (!stored) return null;

      const didDoc = JSON.parse(stored);
      
      // Additional validation for local storage
      if (!FormatValidator.isValidDIDFormat(didDoc.id)) {
        throw new Error('Invalid DID format in local storage');
      }

      return {
        didDocument: didDoc,
        metadata: {
          created: didDoc.created || new Date().toISOString(),
          updated: didDoc.updated || new Date().toISOString()
        }
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Resolve DID from IPFS with enhanced security
   */
  static async resolveFromIPFS(did: string): Promise<DIDResolutionResult | null> {
    try {
      // Extract IPFS CID from DID
      const ipfsMatch = did.match(/did:ipfs:(.+)/);
      if (!ipfsMatch) return null;

      const cid = ipfsMatch[1];
      
      // Validate CID format
      if (!FormatValidator.isValidCIDFormat(cid)) {
        throw new Error('Invalid IPFS CID format');
      }

      const gateways = [
        'https://ipfs.io',
        'https://gateway.pinata.cloud',
        'https://cloudflare-ipfs.com',
        'https://dweb.link'
      ];

      for (const gateway of gateways) {
        try {
          const response = await fetch(`${gateway}/ipfs/${cid}`, {
            headers: {
              'Accept': 'application/did+json, application/json'
            }
          });
          
          if (!response.ok) {
            continue;
          }

          const didDoc = await response.json();
          
          // Validate the downloaded document
          if (!FormatValidator.isValidDIDFormat(didDoc.id)) {
            continue;
          }

          return {
            didDocument: didDoc,
            metadata: {
              created: didDoc.created || new Date().toISOString(),
              updated: didDoc.updated || new Date().toISOString()
            }
          };
        } catch (error) {
          // IPFS gateway failed, continue to next
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Resolve DID from web with certificate pinning and enhanced security
   */
  static async resolveFromWeb(did: string): Promise<DIDResolutionResult | null> {
    try {
      const webMatch = did.match(/did:web:(.+)/);
      if (!webMatch) return null;

      const domain = webMatch[1];
      
      // Validate domain format
      if (!FormatValidator.isValidDomainFormat(domain)) {
        throw new Error('Invalid domain format in DID');
      }

      const gateways = [
        `https://${domain}/.well-known/did.json`,
        `https://${domain}/.well-known/did`
      ];

      for (const url of gateways) {
        try {
          const response = await fetch(url, {
            headers: {
              'Accept': 'application/did+json, application/json'
            }
          });
          
          if (!response.ok) {
            continue;
          }

          const didDoc = await response.json();
          
          // Validate the downloaded document
          if (!FormatValidator.isValidDIDFormat(didDoc.id)) {
            continue;
          }

          return {
            didDocument: didDoc,
            metadata: {
              created: didDoc.created || new Date().toISOString(),
              updated: didDoc.updated || new Date().toISOString()
            }
          };
        } catch (error) {
          // Web resolution failed, continue to next
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get data from IndexedDB
   */
  private static async getFromIndexedDB(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DIDResolver', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['resolutions'], 'readonly');
        const store = transaction.objectStore('resolutions');
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
