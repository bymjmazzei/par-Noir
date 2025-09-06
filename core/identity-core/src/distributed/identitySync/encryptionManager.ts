// Encryption Manager - Handles encryption operations for identity sync
import { EncryptedData } from '../types/identitySync';
import { cryptoWorkerManager } from '../../encryption/cryptoWorkerManager';

export class EncryptionManager {
  private encryptionKey: CryptoKey | null = null;

  /**
   * Initialize encryption
   */
  async initializeEncryption(password: string, salt?: Uint8Array): Promise<void> {
    try {
      const keySalt = salt || crypto.getRandomValues(new Uint8Array(32));
      const encoder = new TextEncoder();
      const keyMaterial = await cryptoWorkerManager.importKey(
        'raw', 
        encoder.encode(password), 
        'PBKDF2', 
        false, 
        ['deriveBits', 'deriveKey']
      );
      
      this.encryptionKey = await cryptoWorkerManager.deriveKey({
        name: 'PBKDF2',
        salt: keySalt,
        iterations: 200000,
        hash: 'SHA-256'
      } as Pbkdf2Params, keyMaterial, { name: 'AES-GCM', length: 256 } as AesKeyGenParams, false, ['encrypt', 'decrypt']);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Encrypt identity
   */
  async encryptIdentity(identity: any): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(identity));
    
    const encrypted = await cryptoWorkerManager.encrypt(
      { name: 'AES-GCM', iv } as AesGcmParams, 
      this.encryptionKey, 
      data
    );
    
    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt identity
   */
  async decryptIdentity(encryptedData: string): Promise<any> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );
      
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      const decrypted = await cryptoWorkerManager.decrypt(
        { name: 'AES-GCM', iv } as AesGcmParams, 
        this.encryptionKey, 
        encrypted
      );
      
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(decrypted);
      const identity = JSON.parse(jsonString);
      
      if (!identity.id || !identity.username) {
        throw new Error('Invalid identity structure');
      }
      
      return identity;
    } catch (error) {
      throw new Error('Failed to decrypt identity data');
    }
  }

  /**
   * Encrypt data for storage
   */
  async encryptForStorage(data: string): Promise<string> {
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
  async decryptFromStorage(encryptedData: string): Promise<string> {
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
   * Check if encryption is initialized
   */
  isEncryptionInitialized(): boolean {
    return this.encryptionKey !== null;
  }
}
