// Cache Manager - Handles cache management for DID resolution
import { DIDResolutionResult } from '../types/didResolver';

export class CacheManager {
  private cache: Map<string, DIDResolutionResult> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached DID resolution result
   */
  get(did: string): DIDResolutionResult | null {
    const cached = this.cache.get(did);
    if (cached && Date.now() - new Date(cached.metadata.updated).getTime() < this.cacheTimeout) {
      return cached;
    }
    return null;
  }

  /**
   * Set cached DID resolution result
   */
  set(did: string, result: DIDResolutionResult): void {
    this.cache.set(did, result);
  }

  /**
   * Clear resolution cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Set cache timeout
   */
  setTimeout(timeout: number): void {
    this.cacheTimeout = timeout;
  }

  /**
   * Get cache timeout
   */
  getTimeout(): number {
    return this.cacheTimeout;
  }
}
