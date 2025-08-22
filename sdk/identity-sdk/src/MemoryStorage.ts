/**
 * Memory Storage Implementation for Identity SDK
 * Used as fallback when other storage methods are not available
 */

export class MemoryStorage {
  private storage: Map<string, string> = new Map();

  /**
   * Set a value in memory storage
   */
  async setItem(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  /**
   * Get a value from memory storage
   */
  async getItem(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  /**
   * Remove a value from memory storage
   */
  async removeItem(key: string): Promise<void> {
    this.storage.delete(key);
  }

  /**
   * Clear all data from memory storage
   */
  async clear(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Get all keys from memory storage
   */
  async keys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  /**
   * Get the length of stored data
   */
  async length(): Promise<number> {
    return this.storage.size;
  }
}
