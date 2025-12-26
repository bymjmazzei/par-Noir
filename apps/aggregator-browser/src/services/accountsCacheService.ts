/**
 * Accounts Cache Service
 * In-memory cache for Google Drive accounts to eliminate redundant API calls
 * Cache persists during session (cleared on page refresh)
 */

interface DriveAccount {
  provider: string;
  accountId: string;
  email?: string;
  displayName?: string;
}

interface CachedAccounts {
  accounts: DriveAccount[];
  timestamp: number;
}

class AccountsCacheService {
  private cache = new Map<string, CachedAccounts>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached accounts for a pN identifier
   * Returns null if cache miss or expired
   */
  get(pnIdentifier: string): DriveAccount[] | null {
    const cached = this.cache.get(pnIdentifier);
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.accounts;
    }
    // Remove expired entry
    if (cached) {
      this.cache.delete(pnIdentifier);
    }
    return null;
  }

  /**
   * Store accounts in cache for a pN identifier
   */
  set(pnIdentifier: string, accounts: DriveAccount[]): void {
    this.cache.set(pnIdentifier, {
      accounts,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache for a specific pN identifier
   */
  clear(pnIdentifier: string): void {
    this.cache.delete(pnIdentifier);
  }

  /**
   * Clear all cached accounts
   */
  clearAll(): void {
    this.cache.clear();
  }
}

export const accountsCacheService = new AccountsCacheService();

