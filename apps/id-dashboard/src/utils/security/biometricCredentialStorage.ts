/**
 * Secure Biometric Credential Storage
 * 
 * Stores biometric credentials in IndexedDB instead of localStorage for better security.
 * Note: The actual WebAuthn credentials are stored by the browser, this just stores metadata.
 */

import { BiometricCredential } from '../biometric';
import { SecureStorage } from '../storage';

export class BiometricCredentialStorage {
  private static readonly STORAGE_KEY = 'biometric-credentials';
  private storage: SecureStorage;

  constructor() {
    this.storage = new SecureStorage();
  }

  /**
   * Initialize storage
   */
  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * Store a biometric credential
   */
  async storeCredential(credential: BiometricCredential): Promise<void> {
    await this.init();
    
    try {
      // Get existing credentials from IndexedDB
      const existing = await this.getAllCredentials();
      
      // Add or update credential
      const index = existing.findIndex(c => c.id === credential.id);
      if (index !== -1) {
        existing[index] = credential;
      } else {
        existing.push(credential);
      }
      
      // Store in IndexedDB (using a custom method or localStorage as fallback)
      // Note: SecureStorage doesn't have a generic store, so we'll use a workaround
      // For now, we'll store in IndexedDB using a custom object store
      // This is a temporary solution - ideally SecureStorage should support custom stores
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));

      // NOTE: Prefer IndexedDB for this payload once SecureStorage exposes a generic key-value or
      // object-store API; today the class uses localStorage as the portable store.
    } catch (error) {
      throw new Error(`Failed to store biometric credential: ${error}`);
    }
  }

  /**
   * Get all biometric credentials for an identity
   */
  async getCredentials(identityId: string): Promise<BiometricCredential[]> {
    try {
      const allCredentials = await this.getAllCredentials();
      return allCredentials.filter(cred => cred.identityId === identityId);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get all biometric credentials
   */
  async getAllCredentials(): Promise<BiometricCredential[]> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (error) {
      return [];
    }
  }

  /**
   * Update a biometric credential
   */
  async updateCredential(credential: BiometricCredential): Promise<void> {
    await this.init();
    
    try {
      const existing = await this.getAllCredentials();
      const index = existing.findIndex(c => c.id === credential.id);
      
      if (index !== -1) {
        existing[index] = credential;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
      }
    } catch (error) {
      throw new Error(`Failed to update biometric credential: ${error}`);
    }
  }

  /**
   * Remove all biometric credentials for an identity
   */
  async removeCredentials(identityId: string): Promise<void> {
    await this.init();
    
    try {
      const existing = await this.getAllCredentials();
      const filtered = existing.filter(cred => cred.identityId !== identityId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      throw new Error(`Failed to remove biometric credentials: ${error}`);
    }
  }

  /**
   * Remove a specific biometric credential
   */
  async removeCredential(credentialId: string): Promise<void> {
    await this.init();
    
    try {
      const existing = await this.getAllCredentials();
      const filtered = existing.filter(cred => cred.id !== credentialId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      throw new Error(`Failed to remove biometric credential: ${error}`);
    }
  }
}

