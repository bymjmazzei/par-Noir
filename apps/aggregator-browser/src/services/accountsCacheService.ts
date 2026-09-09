/**
 * Accounts Cache Service
 * In-memory cache for storage accounts to eliminate redundant API calls
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
  socialCloudProvider: string | null;
  timestamp: number;
}

class AccountsCacheService {
  private cache = new Map<string, CachedAccounts>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached accounts for a pN identifier
   * Returns null if cache miss or expired
   */
  get(pnIdentifier: string): { accounts: DriveAccount[]; socialCloudProvider: string | null } | null {
    const cached = this.cache.get(pnIdentifier);
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return {
        accounts: cached.accounts,
        socialCloudProvider: cached.socialCloudProvider ?? null
      };
    }
    if (cached) {
      this.cache.delete(pnIdentifier);
    }
    return null;
  }

  /**
   * Store accounts in cache for a pN identifier
   */
  set(
    pnIdentifier: string,
    accounts: DriveAccount[],
    socialCloudProvider: string | null = null
  ): void {
    this.cache.set(pnIdentifier, {
      accounts,
      socialCloudProvider,
      timestamp: Date.now()
    });
  }

  clear(pnIdentifier: string): void {
    this.cache.delete(pnIdentifier);
  }

  clearAll(): void {
    this.cache.clear();
  }
}

export const accountsCacheService = new AccountsCacheService();
