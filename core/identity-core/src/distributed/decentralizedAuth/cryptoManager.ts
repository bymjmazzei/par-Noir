// Crypto Manager - Handles cryptographic operations
import { DIDDocument } from '../../types';
import { KeyPair, EncryptedData } from '../types/decentralizedAuth';
import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';

export class CryptoManager {
  /**
   * Generate authentication challenge
   */
  generateChallenge(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(64));
    return btoa(String.fromCharCode(...randomBytes));
  }

  /**
   * Extract public key from DID document
   */
  extractPublicKey(didDocument: DIDDocument): string | null {
    try {
      const verificationMethod = didDocument.verificationMethod?.[0];
      if (!verificationMethod) return null;

      if (!verificationMethod.id || !verificationMethod.type || !verificationMethod.controller) {
        return null;
      }

      if (verificationMethod.publicKeyMultibase) {
        if (!this.isValidMultibaseFormat(verificationMethod.publicKeyMultibase)) {
          return null;
        }
        return verificationMethod.publicKeyMultibase;
      }

      if (verificationMethod.publicKeyJwk) {
        return this.jwkToRaw(verificationMethod.publicKeyJwk);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify signature
   */
  async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      if (!this.isValidSignatureFormat({ signature, publicKey })) {
        return false;
      }

      const signatureBytes = new Uint8Array(atob(signature).split('').map(char => char.charCodeAt(0)));
      const publicKeyBytes = new Uint8Array(atob(publicKey).split('').map(char => char.charCodeAt(0)));
      
      const cryptoKey = await cryptoWorkerManager.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']);
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(message);
      
      const isValid = await cryptoWorkerManager.verify({ name: 'Ed25519' }, cryptoKey, signatureBytes, messageBytes);
      
      return isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert JWK to raw format
   */
  jwkToRaw(jwk: any): string {
    try {
      if (!jwk.kty || !jwk.crv || !jwk.x) {
        throw new Error('Invalid JWK structure');
      }
      return btoa(JSON.stringify(jwk));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get device ID from secure storage
   */
  async getDeviceId(): Promise<string> {
    let deviceId = await this.getStoredDeviceId();
    if (!deviceId) {
      const timestamp = Date.now();
      const random = crypto.getRandomValues(new Uint8Array(16));
      const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
      deviceId = `device-${timestamp}-${entropy}`;
      await this.storeDeviceId(deviceId);
    }
    return deviceId;
  }

  /**
   * Get stored device ID from IndexedDB
   */
  private async getStoredDeviceId(): Promise<string | null> {
    try {
      return new Promise((resolve) => {
        const request = indexedDB.open('DeviceStorage', 1);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('device')) {
            db.createObjectStore('device', { keyPath: 'id' });
          }
        };
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['device'], 'readonly');
          const store = transaction.objectStore('device');
          const getRequest = store.get('deviceId');
          
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            resolve(result ? result.value : null);
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
   * Store device ID in IndexedDB
   */
  private async storeDeviceId(deviceId: string): Promise<void> {
    try {
      return new Promise((resolve) => {
        const request = indexedDB.open('DeviceStorage', 1);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction(['device'], 'readwrite');
          const store = transaction.objectStore('device');
          store.put({ id: 'deviceId', value: deviceId, timestamp: Date.now() });
          resolve();
        };
        
        request.onerror = () => {
          resolve();
        };
      });
    } catch (error) {
      // Silently handle storage errors
    }
  }

  /**
   * Create signature
   */
  async createSignature(challenge: string, privateKey: CryptoKey): Promise<{ challenge: string; signature: string; publicKey: string; timestamp: string }> {
    try {
      if (!this.isValidChallengeFormat(challenge)) {
        throw new Error('Invalid challenge format');
      }

      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(challenge);
      const signature = await cryptoWorkerManager.sign({ name: 'Ed25519' }, privateKey, messageBytes);

      return {
        challenge,
        signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
        publicKey: '',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate key pair
   */
  async generateKeyPair(): Promise<KeyPair> {
    try {
      const keyPair = await cryptoWorkerManager.generateKey({
        name: 'Ed25519'
      }, true, ['sign', 'verify']) as CryptoKeyPair;

      return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Export public key
   */
  async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    try {
      const exported = await cryptoWorkerManager.exportKey('raw', publicKey);
      const result = btoa(String.fromCharCode(...new Uint8Array(exported)));
      
      if (!this.isValidExportedKeyFormat(result)) {
        throw new Error('Invalid exported key format');
      }
      
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Constant time comparison
   */
  constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Validate challenge format
   */
  isValidChallengeFormat(challenge: string): boolean {
    if (!challenge || typeof challenge !== 'string') return false;
    
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(challenge) && challenge.length >= 32;
  }

  /**
   * Validate multibase format
   */
  isValidMultibaseFormat(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    
    const multibasePattern = /^z[1-9A-HJ-NP-Za-km-z]{45,}$/;
    return multibasePattern.test(key);
  }

  /**
   * Validate exported key format
   */
  isValidExportedKeyFormat(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(key) && key.length >= 32;
  }

  /**
   * Validate signature format
   */
  isValidSignatureFormat(signature: { signature: string; publicKey: string }): boolean {
    if (!signature.signature || !signature.publicKey) return false;
    
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(signature.signature) && base64Pattern.test(signature.publicKey);
  }
}
