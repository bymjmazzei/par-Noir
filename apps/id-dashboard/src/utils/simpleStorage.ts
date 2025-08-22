/**
 * Simple Storage System
 * 
 * A clean, straightforward storage system for identity files.
 */

export interface SimpleIdentity {
  id: string;
  nickname: string;
  pnName: string;
  publicKey: string;
  encryptedData: any;
  createdAt: string;
  lastAccessed: string;
}

export class SimpleStorage {
  private static instance: SimpleStorage;
  private readonly STORAGE_KEY = 'simple_identities';
  
  private constructor() {}
  
  static getInstance(): SimpleStorage {
    if (!SimpleStorage.instance) {
      SimpleStorage.instance = new SimpleStorage();
    }
    return SimpleStorage.instance;
  }
  
  /**
   * Store an identity
   */
  async storeIdentity(identity: SimpleIdentity): Promise<void> {
    try {
      const existing = await this.getIdentities();
      const updated = existing.filter(id => id.id !== identity.id);
      updated.push(identity);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to store identity:', error);
      throw error;
    }
  }
  
  /**
   * Get all stored identities
   */
  async getIdentities(): Promise<SimpleIdentity[]> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to get identities:', error);
      return [];
    }
  }
  
  /**
   * Get a specific identity by ID
   */
  async getIdentity(id: string): Promise<SimpleIdentity | null> {
    try {
      const identities = await this.getIdentities();
      return identities.find(identity => identity.id === id) || null;
    } catch (error) {
      console.error('Failed to get identity:', error);
      return null;
    }
  }
  
  /**
   * Update an identity's nickname
   */
  async updateNickname(id: string, newNickname: string): Promise<void> {
    try {
      const identities = await this.getIdentities();
      const updated = identities.map(identity => 
        identity.id === id 
          ? { ...identity, nickname: newNickname }
          : identity
      );
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update nickname:', error);
      throw error;
    }
  }

  /**
   * Update an identity completely
   */
  async updateIdentity(updatedIdentity: SimpleIdentity): Promise<void> {
    try {
      const identities = await this.getIdentities();
      const updated = identities.map(identity => 
        identity.id === updatedIdentity.id 
          ? updatedIdentity
          : identity
      );
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update identity:', error);
      throw error;
    }
  }
  
  /**
   * Delete an identity
   */
  async deleteIdentity(id: string): Promise<void> {
    try {
      const identities = await this.getIdentities();
      const updated = identities.filter(identity => identity.id !== id);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to delete identity:', error);
      throw error;
    }
  }
  
  /**
   * Clear all identities
   */
  async clearAll(): Promise<void> {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear identities:', error);
      throw error;
    }
  }
}

export default SimpleStorage;
