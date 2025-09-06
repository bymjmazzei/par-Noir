// LocalStorage Manager - Handles localStorage operations
import { StorageConfig } from '../types/hybridStorage';

export class LocalStorageManager {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Store data in localStorage
   */
  async store(key: string, data: any): Promise<void> {
    const serializedData = JSON.stringify({
      data,
      timestamp: Date.now(),
      version: '1.0'
    });

    // Check storage quota
    if (this.getLocalStorageSize() + serializedData.length > this.config.maxStorageSize) {
      throw new Error('Storage quota exceeded');
    }

    localStorage.setItem(key, serializedData);
  }

  /**
   * Retrieve data from localStorage
   */
  async retrieve(key: string): Promise<any> {
    const stored = localStorage.getItem(key);
    if (!stored) {
      throw new Error('Data not found');
    }

    const parsed = JSON.parse(stored);
    return parsed.data;
  }

  /**
   * Delete data from localStorage
   */
  async delete(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  /**
   * Get all keys from localStorage
   */
  async getAllKeys(): Promise<string[]> {
    return Object.keys(localStorage);
  }

  /**
   * Clear localStorage
   */
  async clear(): Promise<void> {
    localStorage.clear();
  }

  /**
   * Get localStorage size
   */
  getLocalStorageSize(): number {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        size += key.length + localStorage.getItem(key)!.length;
      }
    }
    return size;
  }

  /**
   * Get localStorage item count
   */
  getItemCount(): number {
    return localStorage.length;
  }
}
