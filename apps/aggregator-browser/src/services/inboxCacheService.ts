/**
 * Inbox Cache Service
 * Caches inbox list in localStorage for instant loading
 * Stores participantPnIdentifier, lastMessageAt, and conversation credentials
 * (spreadsheetId, connectionId, kemCiphertext) for fast conversation loading.
 */

export interface CachedInboxEntry {
  threadType?: 'dm' | 'group';
  participantPnIdentifier: string;
  lastMessageAt: string;
  spreadsheetId?: string;
  connectionId?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  groupId?: string;
  groupTitle?: string;
  ownerPnIdentifier?: string;
}

class InboxCacheService {
  private readonly STORAGE_KEY_PREFIX = 'pn_inbox_';

  /**
   * Get cached inbox for a pN identifier
   * Returns null if cache miss
   */
  get(pnIdentifier: string): CachedInboxEntry[] | null {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}${pnIdentifier}`;
      const cached = localStorage.getItem(key);
      if (!cached) {
        return null;
      }
      return JSON.parse(cached);
    } catch (error) {
      console.error('[InboxCacheService] Failed to get cached inbox:', error);
      return null;
    }
  }

  /**
   * Store inbox in cache for a pN identifier
   */
  set(pnIdentifier: string, inbox: CachedInboxEntry[]): void {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}${pnIdentifier}`;
      localStorage.setItem(key, JSON.stringify(inbox));
    } catch (error) {
      console.error('[InboxCacheService] Failed to cache inbox:', error);
    }
  }

  /**
   * Clear cache for a specific pN identifier
   */
  clear(pnIdentifier: string): void {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}${pnIdentifier}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[InboxCacheService] Failed to clear inbox cache:', error);
    }
  }

  /**
   * Clear all inbox caches (for all users)
   */
  clearAll(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.STORAGE_KEY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('[InboxCacheService] Failed to clear all inbox caches:', error);
    }
  }
}

export const inboxCacheService = new InboxCacheService();
