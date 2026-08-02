/**
 * Pure helpers for the Google Drive credential cache used by
 * `useDriveStorageCredentials`.
 *
 * These operate on an explicitly passed cache map (and, where needed, on
 * explicitly passed React setters) so the orchestrator hook stays thin.
 * Behavior is identical to the inline implementations they replaced.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../../services/aggregator/FileAggregatorService';
import { persistDriveAccounts } from '../../storageHelpers';
import type { DriveAccountState, StoredDriveCredential } from '../../FileStorageAggregatorTypes';

export type DriveCredentialCache = Map<string, StoredDriveCredential>;

export interface ResolvedDriveIdentifiers {
  backendId: string;
  keyPrefix: string;
  isNew: boolean;
}

// CRITICAL: Clean up duplicate cache entries by email
export function cleanupDuplicateCacheEntries(cache: DriveCredentialCache): void {
  const emailsSeen = new Map<string, string>(); // email -> backendId
  const toDelete: string[] = [];

  for (const [backendId, credential] of cache.entries()) {
    if (credential.email) {
      const normalizedEmail = credential.email.toLowerCase();
      const existingBackendId = emailsSeen.get(normalizedEmail);
      if (existingBackendId) {
        // Keep the one with the most recent updatedAt
        const existing = cache.get(existingBackendId);
        if (existing && credential.updatedAt && existing.updatedAt) {
          if (credential.updatedAt > existing.updatedAt) {
            // Current entry is newer, delete the old one
            toDelete.push(existingBackendId);
            emailsSeen.set(normalizedEmail, backendId);
          } else {
            // Existing entry is newer, delete current one
            toDelete.push(backendId);
          }
        } else {
          // No updatedAt info, keep first one found
          toDelete.push(backendId);
        }
      } else {
        emailsSeen.set(normalizedEmail, backendId);
      }
    }
  }

  if (toDelete.length > 0) {
    console.log(`🧹 [cleanupDuplicateCacheEntries] Removing ${toDelete.length} duplicate cache entries`);
    toDelete.forEach(backendId => cache.delete(backendId));
  }
}

export interface PurgeDuplicateBackendsDeps {
  cache: DriveCredentialCache;
  unregisterBackend: (backendId: string) => void;
  setDriveAccounts: React.Dispatch<React.SetStateAction<DriveAccountState[]>>;
}

export function purgeDuplicateBackendsForEmail(
  preferredBackendId: string,
  email: string | null | undefined,
  { cache, unregisterBackend, setDriveAccounts }: PurgeDuplicateBackendsDeps
): void {
  if (!email) {
    return;
  }

  const normalized = email.toLowerCase();
  const staleBackendIds: string[] = [];

  for (const [cachedBackendId, credential] of Array.from(cache.entries())) {
    if (cachedBackendId === preferredBackendId) {
      continue;
    }
    const cachedEmail = credential.email?.toLowerCase() || null;
    if (cachedEmail && cachedEmail === normalized) {
      staleBackendIds.push(cachedBackendId);
    }
  }

  if (staleBackendIds.length === 0) {
    return;
  }

  staleBackendIds.forEach((backendId) => {
    unregisterBackend(backendId);
  });

  setDriveAccounts((prev) => {
    const filtered = prev.filter((account) => !staleBackendIds.includes(account.backendId));
    if (filtered.length === prev.length) {
      return prev;
    }
    persistDriveAccounts(filtered);
    return filtered;
  });
}

export interface ResolveIdentifiersDeps {
  cache: DriveCredentialCache;
  driveAccounts: DriveAccountState[];
  userEmails: Map<string, string>;
  aggregatorService: FileAggregatorService | null;
}

export function resolveIdentifiersForEmail(
  email: string | null | undefined,
  { cache, driveAccounts, userEmails, aggregatorService }: ResolveIdentifiersDeps
): ResolvedDriveIdentifiers {
  const normalizedEmail = email?.toLowerCase() || null;
  if (normalizedEmail) {
    // CRITICAL: Check cache FIRST - it's the most up-to-date source
    for (const [backendId, credential] of cache.entries()) {
      const cachedEmail = credential.email?.toLowerCase();
      if (cachedEmail === normalizedEmail) {
        console.log(`✅ [resolveIdentifiersForEmail] Found existing account in cache for [REDACTED]: ${(backendId || '').substring(0, 8)}...`);
        // Check if this backendId is already in driveAccounts
        const accountInState = driveAccounts.find(acc => acc.backendId === backendId);
        if (accountInState) {
          return { backendId, keyPrefix: accountInState.keyPrefix, isNew: false };
        }
        // If not in state but in cache, use the cached keyPrefix
        return { backendId, keyPrefix: credential.keyPrefix, isNew: false };
      }
    }

    // Also check driveAccounts state and userEmails map
    const existing = driveAccounts.find((account) => {
      const accountEmail = userEmails.get(account.backendId);
      return accountEmail?.toLowerCase() === normalizedEmail;
    });
    if (existing) {
      console.log(`✅ [resolveIdentifiersForEmail] Found existing account in state for [REDACTED]: ${(existing.backendId || '').substring(0, 8)}...`);
      return { backendId: existing.backendId, keyPrefix: existing.keyPrefix, isNew: false };
    }

    // CRITICAL: Also check aggregatorService for registered backends
    if (aggregatorService) {
      try {
        const allBackends = aggregatorService.getAllBackends();
        for (const [registeredBackendId, backend] of allBackends.entries()) {
          if (registeredBackendId.startsWith('google_drive::')) {
            const backendEmail = (backend as any).getEmail?.()?.toLowerCase();
            if (backendEmail === normalizedEmail) {
              console.log(`✅ [resolveIdentifiersForEmail] Found existing backend in aggregatorService for [REDACTED]: ${(registeredBackendId || '').substring(0, 16)}...`);
              // Find keyPrefix from cache or state
              const cachedCredential = cache.get(registeredBackendId);
              const stateAccount = driveAccounts.find(acc => acc.backendId === registeredBackendId);
              const keyPrefix = stateAccount?.keyPrefix || cachedCredential?.keyPrefix || `google_drive_${registeredBackendId.replace('google_drive::', '')}`;
              return { backendId: registeredBackendId, keyPrefix, isNew: false };
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ [resolveIdentifiersForEmail] Error checking aggregatorService:', error);
      }
    }
  }

  // SECURITY: Do NOT use email in backendId - use random identifier instead
  // This prevents email from being exposed in localStorage keys
  // Only create new identifier if NO existing account found ANYWHERE
  console.log(`🆕 [resolveIdentifiersForEmail] No existing account found for [REDACTED], creating new identifier`);
  const uniqueSuffix =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);
  const slug = `account-${timestamp}-${uniqueSuffix}`;
  return {
    backendId: `google_drive::${slug}`,
    keyPrefix: `google_drive_${slug}`,
    isNew: true,
  };
}

export interface StorageCredentialPayload {
  googleDriveAccounts: Array<{
    backendId: string;
    keyPrefix: string;
    accessToken: string;
    refreshToken: string | null;
    email: string | null;
    connectedAt: string;
    updatedAt: string;
  }>;
}

/**
 * Collapses the credential cache down to the single account per pN that the API
 * expects, mutating the cache in place when duplicates have to be pruned.
 */
export function buildStorageCredentialPayloadFromCache(
  cache: DriveCredentialCache
): StorageCredentialPayload | null {
  // CRITICAL: Clean up duplicates BEFORE building payload
  cleanupDuplicateCacheEntries(cache);

  const entries = Array.from(cache.values());
  if (entries.length === 0) {
    return null;
  }

  // CRITICAL: Safety check - if cache has more than 10 entries, something is very wrong
  if (entries.length > 10) {
    console.error(`🚨 [buildStorageCredentialPayload] CRITICAL: Cache has ${entries.length} entries (expected max 10). Clearing duplicates aggressively.`);
    // Keep only the most recent entry per email
    const accountsByEmail = new Map<string, typeof entries[0]>();
    for (const entry of entries) {
      if (entry.email) {
        const normalizedEmail = entry.email.toLowerCase();
        const existing = accountsByEmail.get(normalizedEmail);
        if (!existing ||
            (entry.updatedAt && existing.updatedAt && entry.updatedAt > existing.updatedAt) ||
            (entry.connectedAt && existing.connectedAt && entry.connectedAt > existing.connectedAt)) {
          accountsByEmail.set(normalizedEmail, entry);
        }
      }
    }
    // Clear cache and repopulate with only unique accounts
    cache.clear();
    for (const entry of accountsByEmail.values()) {
      cache.set(entry.backendId, entry);
    }
    // Re-fetch entries after cleanup
    const cleanedEntries = Array.from(cache.values());
    if (cleanedEntries.length === 0) {
      return null;
    }
    entries.length = 0;
    entries.push(...cleanedEntries);
  }

  // CRITICAL: Deduplicate by email - only keep the most recent account per email
  const accountsByEmail = new Map<string, typeof entries[0]>();
  const accountsWithoutEmail: typeof entries = [];

  for (const entry of entries) {
    if (entry.email) {
      const normalizedEmail = entry.email.toLowerCase();
      const existing = accountsByEmail.get(normalizedEmail);
      // Keep the most recent one (by updatedAt or connectedAt)
      if (!existing ||
          (entry.updatedAt && existing.updatedAt && entry.updatedAt > existing.updatedAt) ||
          (entry.connectedAt && existing.connectedAt && entry.connectedAt > existing.connectedAt)) {
        accountsByEmail.set(normalizedEmail, entry);
      }
    } else {
      // Accounts without email - keep by backendId (should be unique)
      accountsWithoutEmail.push(entry);
    }
  }

  // Combine deduplicated accounts
  const uniqueAccounts = Array.from(accountsByEmail.values()).concat(accountsWithoutEmail);

  // CRITICAL: Also deduplicate by backendId as a safety measure
  const finalAccounts = new Map<string, typeof entries[0]>();
  for (const account of uniqueAccounts) {
    if (!finalAccounts.has(account.backendId)) {
      finalAccounts.set(account.backendId, account);
    }
  }

  const finalAccountsArray = Array.from(finalAccounts.values());

  // CRITICAL: HARD LIMIT - Only ONE account should exist per pN
  // Fix 2: When pruning 2→1, prefer account with refreshToken (can be refreshed) over one without
  if (finalAccountsArray.length > 1) {
    console.error(`🚨 [buildStorageCredentialPayload] CRITICAL: Cache has ${finalAccountsArray.length} accounts (expected max 1). Keeping only the most recent one.`);
    const withRefresh = finalAccountsArray.filter((a) => !!(a.refreshToken?.trim?.() || (a as any).refresh_token));
    const candidates = withRefresh.length > 0 ? withRefresh : finalAccountsArray;
    candidates.sort((a, b) => {
      const aTime = (a.updatedAt || a.connectedAt || '').toString();
      const bTime = (b.updatedAt || b.connectedAt || '').toString();
      return bTime.localeCompare(aTime); // Most recent first
    });
    finalAccountsArray.length = 0;
    finalAccountsArray.push(candidates[0]);

    // Clear cache and repopulate with only the one account
    cache.clear();
    const accountToKeep = finalAccountsArray[0];
    cache.set(accountToKeep.backendId, accountToKeep);
  }

  const now = new Date().toISOString();
  return {
    googleDriveAccounts: finalAccountsArray.map((entry) => ({
      backendId: entry.backendId,
      keyPrefix: entry.keyPrefix,
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken ?? null,
      email: entry.email ?? null,
      connectedAt: entry.connectedAt ?? now,
      updatedAt: now
    }))
  };
}
