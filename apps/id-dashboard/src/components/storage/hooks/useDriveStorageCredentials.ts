/**
 * Google Drive storage credential lifecycle for FileStorageAggregator.
 *
 * Owns the in-memory credential cache, backend registration/unregistration,
 * persistence to secure metadata + the par Noir API, hydration back from the API,
 * and the restore effects that run on unlock / token refresh.
 *
 * Device custody note: the API does not hold Google OAuth secrets, so
 * `clientSideLayoutRequired` responses and routine token refreshes must never
 * trigger POST /storage/initialize — doing so re-runs multi-minute Drive setup
 * and loops. That behavior is preserved exactly as written here.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { IntegrationCredentialManager } from '../../../utils/integrationCredentialManager';
import { API_ENDPOINT } from '../../../config/api';
import { ownerFetch, ownerGet } from '../../../services/ownerApiService';
import { driveAccountTokens, persistDriveAccounts } from '../storageHelpers';
import {
  type DriveSetupProgress,
  type DriveAccountState,
  type StoredDriveCredential,
} from '../FileStorageAggregatorTypes';

export interface UseDriveStorageCredentialsParams {
  authenticatedUser: any;
  apiToken: string | null;
  ensureOwnerApiToken?: () => Promise<string | null>;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  driveAccounts: DriveAccountState[];
  setDriveAccounts: React.Dispatch<React.SetStateAction<DriveAccountState[]>>;
  userEmails: Map<string, string>;
  setUserEmails: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setConnectedBackends: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeBackendId: string | null;
  setActiveBackendId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Drive layout init surface from useDriveLayoutInit. */
  setDriveSetupProgress: React.Dispatch<React.SetStateAction<DriveSetupProgress | null>>;
  clearDriveSetupProgress: () => void;
  postDriveInitializeWithRetry: (
    pnId: string,
    accessToken: string,
    options?: { onProgress?: (progress: DriveSetupProgress) => void; maxAttempts?: number }
  ) => Promise<boolean>;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  waitForOwnerApiToken: (wantedPn?: string | null, maxMs?: number) => Promise<string | null>;
  getResolvedAuthCredentials: () => { pnName: string; publicKey: string; passcode?: string } | null;
  getPasscodeFromSecureStorage: (sessionId: string | null | undefined) => string | null;
  getPnIdentifier: () => Promise<string | null>;
  getStorageIdentityCandidates: () => string[];
  /** Shared refs owned by FileStorageAggregator. */
  authenticatedUserRef: React.MutableRefObject<any>;
  pnIdentifierRef: React.MutableRefObject<string | null>;
  loadFilesRef: React.MutableRefObject<(() => Promise<void>) | null>;
  loadStorageQuotaRef: React.MutableRefObject<(() => Promise<void>) | null>;
  ownerIndexWarningLoggedRef: React.MutableRefObject<Set<string>>;
  ownerIndexRetryCountsRef: React.MutableRefObject<Map<string, number>>;
  rateLimitedBackendsRef: React.MutableRefObject<Set<string>>;
}

export function useDriveStorageCredentials({
  authenticatedUser,
  apiToken,
  ensureOwnerApiToken,
  resolvedAuth,
  aggregatorService,
  driveAccounts,
  setDriveAccounts,
  userEmails,
  setUserEmails,
  setConnectedBackends,
  activeBackendId,
  setActiveBackendId,
  setDriveSetupProgress,
  clearDriveSetupProgress,
  postDriveInitializeWithRetry,
  resolveOwnerApiToken,
  waitForOwnerApiToken,
  getResolvedAuthCredentials,
  getPasscodeFromSecureStorage,
  getPnIdentifier,
  getStorageIdentityCandidates,
  authenticatedUserRef,
  pnIdentifierRef,
  loadFilesRef,
  loadStorageQuotaRef,
  ownerIndexWarningLoggedRef,
  ownerIndexRetryCountsRef,
  rateLimitedBackendsRef,
}: UseDriveStorageCredentialsParams) {
  const driveCredentialCacheRef = React.useRef<Map<string, StoredDriveCredential>>(new Map());
  const hasRestoredFromMetadataRef = React.useRef<string | null>(null);
  const missingPnNameLogRef = React.useRef(false);
  const missingPasscodeLogRef = React.useRef(false);
  const hydrationAttemptedRef = React.useRef<Set<string>>(new Set());
  const hydrationMissingCandidatesRef = React.useRef<Set<string>>(new Set());
  const hydrationSuccessRef = React.useRef<string | null>(null);
  const hydrationRateLimitUntilRef = React.useRef<number | null>(null);
  const hydrationRateLimitLoggedRef = React.useRef(false);
  const hydrationRetryTimeoutRef = React.useRef<number | null>(null);
  const hydrationInProgressRef = React.useRef(false);

  const unregisterBackend = React.useCallback(
    (backendId: string) => {
      if (!backendId) {
        return;
      }

      driveCredentialCacheRef.current.delete(backendId);

    setConnectedBackends((prev) => {
      if (!prev.has(backendId)) {
        return prev;
      }
        const next = new Set(prev);
      next.delete(backendId);
      return next;
    });

      if (aggregatorService && typeof aggregatorService.removeBackend === 'function') {
        aggregatorService.removeBackend(backendId);
      }
    },
    [aggregatorService]
  );

  // CRITICAL: Clean up duplicate cache entries by email
  function cleanupDuplicateCacheEntries() {
    const cache = driveCredentialCacheRef.current;
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

  function purgeDuplicateBackendsForEmail(preferredBackendId: string, email: string | null | undefined) {
    if (!email) {
        return;
      }

    const normalized = email.toLowerCase();
    const staleBackendIds: string[] = [];

    for (const [cachedBackendId, credential] of Array.from(driveCredentialCacheRef.current.entries())) {
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
  
  function resolveIdentifiersForEmail(email?: string | null) {
    const normalizedEmail = email?.toLowerCase() || null;
    if (normalizedEmail) {
      // CRITICAL: Check cache FIRST - it's the most up-to-date source
      for (const [backendId, credential] of driveCredentialCacheRef.current.entries()) {
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
                const cachedCredential = driveCredentialCacheRef.current.get(registeredBackendId);
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

  const buildStorageCredentialPayload = React.useCallback(() => {
    // CRITICAL: Clean up duplicates BEFORE building payload
    cleanupDuplicateCacheEntries();
    
    const entries = Array.from(driveCredentialCacheRef.current.values());
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
      driveCredentialCacheRef.current.clear();
      for (const entry of accountsByEmail.values()) {
        driveCredentialCacheRef.current.set(entry.backendId, entry);
      }
      // Re-fetch entries after cleanup
      const cleanedEntries = Array.from(driveCredentialCacheRef.current.values());
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
      driveCredentialCacheRef.current.clear();
      const accountToKeep = finalAccountsArray[0];
      driveCredentialCacheRef.current.set(accountToKeep.backendId, accountToKeep);
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
  }, []);

  const persistCredentialsToSecureMetadata = React.useCallback(
    async (payload: any) => {
      if (
        !payload ||
        !Array.isArray(payload.googleDriveAccounts) ||
        payload.googleDriveAccounts.length === 0 ||
        !authenticatedUser?.id
      ) {
        return;
      }

      const resolved = getResolvedAuthCredentials();
      // SECURITY: pnName is a SECRET - only get from getResolvedAuthCredentials (which uses SecureCredentialManager)
      const metadataPnName = resolved?.pnName || null;
      let metadataPasscode = resolved?.passcode || null;
      if (!metadataPasscode) {
        // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        metadataPasscode = getPasscodeFromSecureStorage(sessionId);
      }

      if (!metadataPnName || !metadataPasscode) {
        return;
      }

      try {
        const { SecureMetadataStorage } = await import('../../../utils/secureMetadataStorage');
        const { SecureMetadataCrypto } = await import('../../../utils/secureMetadata');

        const existingMetadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);
        let baseCredentials: any = {};

        if (existingMetadata) {
            try {
            const decrypted = await SecureMetadataCrypto.decryptMetadata(
              existingMetadata,
              metadataPnName,
              metadataPasscode
            );
            baseCredentials = { ...(decrypted.storageCredentials || {}) };
          } catch (decryptError) {
            console.warn('⚠️ [StorageCredentials] Failed to decrypt secure metadata during refresh:', decryptError);
            }
          }

        const updatedCredentials = {
          ...baseCredentials,
          googleDriveAccounts: payload.googleDriveAccounts
        };

        await SecureMetadataStorage.updateMetadataField(
          authenticatedUser.id,
          metadataPnName,
          metadataPasscode,
          'storageCredentials',
          updatedCredentials
        );
      } catch (error) {
        console.warn('⚠️ [StorageCredentials] Unable to update secure metadata during refresh:', error);
      }
    },
    [authenticatedUser?.id, getResolvedAuthCredentials]
    // SECURITY: Removed authenticatedUser?.pnName - it's a secret
  );

  // Guard to prevent multiple simultaneous persistence calls
  const persistenceInProgressRef = React.useRef(false);
  const lastPersistenceTimeRef = React.useRef<number>(0);
  const PERSISTENCE_DEBOUNCE_MS = 5000; // Don't persist more than once every 5 seconds
  // CRITICAL: Global lock to prevent multiple persistence calls
  const globalPersistenceLockRef = React.useRef(false);

  const persistStorageCredentialsToAPI = React.useCallback(async (credentialsPayload?: any, cid?: string | null) => {
    // CRITICAL: Global lock to prevent multiple simultaneous persistence calls
    if (globalPersistenceLockRef.current) {
      console.warn('🚫 [StorageCredentials] BLOCKED: Global persistence lock active, skipping...');
      return;
    }
    
    // Prevent multiple simultaneous calls
    if (persistenceInProgressRef.current) {
      console.warn('🚫 [StorageCredentials] BLOCKED: Persistence already in progress, skipping...');
      return;
    }

    // Debounce rapid calls
    const now = Date.now();
    const timeSinceLastCall = now - lastPersistenceTimeRef.current;
    if (timeSinceLastCall < PERSISTENCE_DEBOUNCE_MS) {
      console.warn(`🚫 [StorageCredentials] BLOCKED: Persistence debounced (${timeSinceLastCall}ms < ${PERSISTENCE_DEBOUNCE_MS}ms since last call)`);
      return;
    }

    console.log(`🔒 [StorageCredentials] ACQUIRING lock - setting globalPersistenceLockRef and persistenceInProgressRef to true`);
    globalPersistenceLockRef.current = true;
    persistenceInProgressRef.current = true;
    lastPersistenceTimeRef.current = now;

    try {
      console.log('[StorageCredentials] persistStorageCredentialsToAPI called', {
        hasPayload: !!credentialsPayload,
        driveAccountsLength: driveAccounts.length,
        cacheSize: driveCredentialCacheRef.current.size
      });
      
      let payload = credentialsPayload;
      if (!payload) {
        const cacheSizeBeforeDedup = driveCredentialCacheRef.current.size;
        payload = buildStorageCredentialPayload();
        console.log('[StorageCredentials] Built payload from cache', {
          hasPayload: !!payload,
          accountsCount: payload?.googleDriveAccounts?.length || 0,
          cacheSizeBeforeDedup: cacheSizeBeforeDedup
        });
      }

      if (
        !payload ||
        !Array.isArray(payload.googleDriveAccounts) ||
        payload.googleDriveAccounts.length === 0
      ) {
        console.warn('⚠️ [StorageCredentials] No Google Drive accounts available; skipping API persistence', {
          payloadExists: !!payload,
          isArray: Array.isArray(payload?.googleDriveAccounts),
          accountsLength: payload?.googleDriveAccounts?.length || 0
        });
        globalPersistenceLockRef.current = false;
        persistenceInProgressRef.current = false;
        return;
      }

      await persistCredentialsToSecureMetadata(payload);

      // CRITICAL: Use STANDARDIZED pn identifier for all API calls
      // This ensures consistency - same credentials always produce same identifier
      // Generate pn identifier from pnName:passcode:publicKey
      const currentUser = authenticatedUserRef.current;
      if (!currentUser?.publicKey) {
        console.warn('⚠️ [StorageCredentials] No publicKey available for pn identifier generation', {
          authenticatedUserRefExists: !!currentUser,
          hasPublicKey: !!currentUser?.publicKey
        });
        globalPersistenceLockRef.current = false;
        persistenceInProgressRef.current = false;
        return;
      }

      // Get credentials from SecureCredentialManager to generate pn identifier
      const sessionId = currentUser.id || currentUser.publicKey;
      const credentials = SecureCredentialManager.getCredentials(sessionId);
      if (!credentials) {
        console.warn('⚠️ [StorageCredentials] No credentials available for pn identifier generation', {
          sessionId: sessionId?.substring(0, 20) + '...',
          hasCredentials: false
        });
        globalPersistenceLockRef.current = false;
        persistenceInProgressRef.current = false;
        return;
      }

      // Generate standardized pn identifier
      const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
      const pnIdentifier = await VolumeIdGenerator.generateVolumeId({
        pnName: credentials.pnName,
        passcode: credentials.passcode,
        publicKey: currentUser.publicKey
      });

      console.log('📤 [StorageCredentials] Using STANDARDIZED pn identifier for API persistence', {
        pnIdentifier: pnIdentifier,
        publicKeyLength: currentUser.publicKey?.length
      });

      try {
        console.log('📤 [StorageCredentials] Persisting credentials to API...', {
          pnIdentifier: pnIdentifier,
          hasCid: !!cid,
          accountsCount: payload.googleDriveAccounts.length
        });

        if (ensureOwnerApiToken) {
          await ensureOwnerApiToken();
        }

        const accessToken = await waitForOwnerApiToken(pnIdentifier);
        if (!accessToken) {
          console.warn('⚠️ [StorageCredentials] No par Noir OAuth token; skipping credential persistence');
          globalPersistenceLockRef.current = false;
          persistenceInProgressRef.current = false;
          return;
        }

        const credPath = `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}`;
        const response = await ownerFetch(accessToken, 'PUT', credPath, {
          credentials: payload,
          cid: cid ?? null,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.warn('⚠️ [StorageCredentials] Failed to persist credentials to API:', {
            status: response.status,
            error: errorText,
          });
        } else {
          const result = (await response.json().catch(() => ({}))) as {
            directoryBuilt?: boolean;
            initInProgress?: boolean;
            clientSideLayoutRequired?: boolean;
            folderInitError?: string;
          };
          console.log('✅ [StorageCredentials] Credentials persisted to API', {
            accountsCount: payload.googleDriveAccounts.length,
            directoryBuilt: result.directoryBuilt,
            initInProgress: result.initInProgress,
            clientSideLayoutRequired: result.clientSideLayoutRequired,
          });

          // Device custody: API has no Google secrets — never POST /storage/initialize.
          // Client loadFiles discovers folders via GoogleDriveMetadataService.
          if (result.clientSideLayoutRequired) {
            console.log(
              '⏭️ [StorageCredentials] Client-side Drive layout required; skipping server initialize'
            );
          } else if (result.initInProgress === true || result.directoryBuilt === false) {
            console.log('🔄 [StorageCredentials] Building Drive layout on server (may take a few minutes)...');
            setDriveSetupProgress({
              phase: 'starting',
              stepLabel: 'Preparing your par Noir storage…',
              percent: 0,
            });
            const ok = await postDriveInitializeWithRetry(pnIdentifier, accessToken, {
              onProgress: setDriveSetupProgress,
            });
            clearDriveSetupProgress();
            if (!ok) {
              console.warn(
                '⚠️ [StorageCredentials] Server Drive init skipped or failed; using client-side Drive discovery'
              );
            }
          } else {
            console.log('⏭️ [StorageCredentials] Drive layout already built; skipping initialize');
          }
        }
        if (loadFilesRef.current) {
          void loadFilesRef.current();
        }
      } catch (error) {
        console.warn('⚠️ [StorageCredentials] API persistence failed (non-blocking):', {
          error: error instanceof Error ? error.message : 'Unknown persistence error',
        });
      }
    } finally {
      console.log(`🔓 [StorageCredentials] RELEASING lock - setting globalPersistenceLockRef and persistenceInProgressRef to false`);
      globalPersistenceLockRef.current = false;
      persistenceInProgressRef.current = false;
    }
  }, [buildStorageCredentialPayload, persistCredentialsToSecureMetadata, API_ENDPOINT, driveAccounts.length, waitForOwnerApiToken, ensureOwnerApiToken, postDriveInitializeWithRetry, clearDriveSetupProgress]);

  // Token refresh handler - moved here after persistStorageCredentialsToAPI is declared
  // CRITICAL: Use refs for driveAccounts and userEmails to avoid re-registering event listener
  const driveAccountsRef = React.useRef(driveAccounts);
  const userEmailsRefForTokenRefresh = React.useRef(userEmails);
  
  React.useEffect(() => {
    driveAccountsRef.current = driveAccounts;
  }, [driveAccounts]);
  
  React.useEffect(() => {
    userEmailsRefForTokenRefresh.current = userEmails;
  }, [userEmails]);

  React.useEffect(() => {
    const handleTokenRefreshed = async (event: Event) => {
      const detail = (event as CustomEvent<{ backendId?: string; accessToken?: string; refreshToken?: string | null; email?: string | null }>).detail;
      const backendId = detail?.backendId;

      if (!backendId) {
        ownerIndexRetryCountsRef.current.clear();
        rateLimitedBackendsRef.current.clear();
        if (loadFilesRef.current) {
          loadFilesRef.current();
        }
        return;
      }

      // CRITICAL: Block token refresh for disconnected accounts
      if (disconnectedBackendIdsRef.current.has(backendId)) {
        const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
        if (timeSinceDisconnect < DISCONNECT_BLOCK_DURATION_MS) {
          console.log(`🚫 [handleTokenRefreshed] BLOCKED: Token refresh for disconnected backendId ${backendId} (${timeSinceDisconnect}ms ago)`);
          return;
        } else {
          // Remove from block list after block duration expires
          disconnectedBackendIdsRef.current.delete(backendId);
        }
      }

      const existingCredential = driveCredentialCacheRef.current.get(backendId);
      const currentDriveAccounts = driveAccountsRef.current; // Use ref instead of state
      const account =
        currentDriveAccounts.find((entry) => entry.backendId === backendId) || null;
      const keyPrefix =
        account?.keyPrefix ||
        existingCredential?.keyPrefix ||
        `google_drive_${backendId.replace(/[^a-z0-9]+/gi, '-')}`;
      const currentUserEmails = userEmailsRefForTokenRefresh.current; // Use ref instead of state
      const resolvedEmail =
        detail?.email ??
        existingCredential?.email ??
        currentUserEmails.get(backendId) ??
        null;
      const connectedAt = existingCredential?.connectedAt || new Date().toISOString();
      const nowIso = new Date().toISOString();
      const nextAccessToken = detail?.accessToken ?? existingCredential?.accessToken ?? null;
      const nextRefreshToken = detail?.refreshToken ?? existingCredential?.refreshToken ?? null;

      if (nextAccessToken) {
        driveCredentialCacheRef.current.set(backendId, {
          backendId,
          keyPrefix,
          accessToken: nextAccessToken,
          refreshToken: nextRefreshToken,
          email: resolvedEmail,
          connectedAt,
          updatedAt: nowIso,
        });

        // SECURITY: Store credentials in encrypted storage (if session available)
        if (authenticatedUser?.id) {
          try {
            await IntegrationCredentialManager.storeCredentials(
              backendId,
              {
                accessToken: nextAccessToken,
                refreshToken: nextRefreshToken || undefined,
                email: resolvedEmail || undefined,
                expiresAt: Date.now() + (3600 * 1000) // 1 hour default
              },
              authenticatedUser.id
            );
          } catch (error) {
            console.warn('[FileStorageAggregator] Failed to store encrypted credentials:', error);
          }
          try {
            const sessionCreds = SecureCredentialManager.getCredentials(authenticatedUser.id);
            const pnId = pnIdentifierRef.current;
            if (sessionCreds && pnId && nextAccessToken) {
              // Device custody: update sealed local credentials only.
              // Do not publish layout or persist/initialize on the API for a routine token refresh —
              // that re-triggers multi-minute Drive setup and fails when secrets are device-held.
              const { sealAndStoreCloudCredentials } = await import(
                '../../../services/deviceCloudCredentials'
              );
              await sealAndStoreCloudCredentials({
                identityId: pnId,
                credentials: {
                  socialCloudProvider: 'google_drive',
                  googleDriveAccounts: [
                    {
                      accountId: backendId,
                      accessToken: nextAccessToken,
                      refreshToken: nextRefreshToken || undefined,
                      email: resolvedEmail || undefined,
                      connectedAt,
                      updatedAt: nowIso
                    }
                  ]
                },
                session: {
                  sessionId: authenticatedUser.id,
                  pnName: sessionCreds.pnName,
                  passcode: sessionCreds.passcode
                }
              });
            }
          } catch (deviceSealErr) {
            console.warn('[FileStorageAggregator] Device cloud seal skipped:', deviceSealErr);
          }
        }

        purgeDuplicateBackendsForEmail(backendId, resolvedEmail ?? existingCredential?.email ?? null);
      }

      const backendInstance =
        aggregatorService && typeof aggregatorService.getBackend === 'function'
          ? (aggregatorService.getBackend(backendId) as GoogleDriveBackend | null)
          : null;
      if (backendInstance && nextAccessToken) {
        void backendInstance
          .connect({
            token: nextAccessToken,
            refreshToken: nextRefreshToken ?? undefined,
            email: resolvedEmail ?? undefined,
            sessionId: authenticatedUser?.id || authenticatedUser?.publicKey || undefined,
            expiresAt: Date.now() + 55 * 60 * 1000,
          })
          .catch((connectError) => {
            console.warn('⚠️ [StorageCredentials] Failed to apply refreshed token to backend', connectError);
          });
      }

      if (resolvedEmail && nextAccessToken) {
        setDriveAccounts((prev) => {
          const normalized = resolvedEmail.toLowerCase();
          const filtered = prev.filter((entry) => {
            if (entry.backendId === backendId) {
              return false;
            }
            const entryEmail = userEmailsRefForTokenRefresh.current.get(entry.backendId);
            if (entryEmail && entryEmail.toLowerCase() === normalized) {
              return false;
            }
            return true;
          });

          const next = [...filtered, { backendId, keyPrefix }];
          persistDriveAccounts(next);
          return next;
        });

        setUserEmails((prev) => {
          const next = new Map(prev);
          next.set(backendId, resolvedEmail);
          return next;
        });
      }

      // Token refresh is not a reconnect — never PUT credentials / POST initialize here.
      ownerIndexRetryCountsRef.current.delete(backendId);
      ownerIndexWarningLoggedRef.current.delete(backendId);
      rateLimitedBackendsRef.current.delete(backendId);

      if (loadFilesRef.current) {
        loadFilesRef.current();
      }
    };

    window.addEventListener('google-drive-token-refreshed', handleTokenRefreshed as EventListener);
    return () => {
      window.removeEventListener('google-drive-token-refreshed', handleTokenRefreshed as EventListener);
    };
  }, [aggregatorService, authenticatedUser?.id]); // Removed driveAccounts and userEmails from dependencies

  // CRITICAL: DISABLED auto-persist effect - only persist on explicit user actions
  // The auto-persist was causing 8+ PUT requests because authenticatedUser.id was changing
  // Now we only persist when:
  // 1. User connects a Google Drive account (handleConnectGoogleDrive)
  // 2. User disconnects a Google Drive account (handleDisconnect)
  // Token refresh updates local/sealed credentials only (no API init).
  // This prevents the 8+ duplicate persistence calls

  // CRITICAL: Lock to prevent multiple simultaneous upserts for the same email
  const upsertLocksRef = React.useRef<Map<string, Promise<GoogleDriveBackend | null>>>(new Map());

  const upsertDriveAccount = React.useCallback(async (
    params: {
      backendId: string;
      keyPrefix: string;
      token: string;
      refreshToken?: string | null;
      email?: string | null;
      connectedAt?: string;
      updatedAt?: string;
    }
  ): Promise<GoogleDriveBackend | null> => {
        if (!aggregatorService) {
      console.warn('⚠️ [DriveAccounts] Aggregator service not ready');
      return null;
    }

    // CRITICAL: Block re-adding accounts that were just disconnected
    if (disconnectedBackendIdsRef.current.has(params.backendId)) {
      const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
      if (timeSinceDisconnect < DISCONNECT_BLOCK_DURATION_MS) {
        console.log(`🚫 [upsertDriveAccount] BLOCKED: Attempted to re-add disconnected backendId ${params.backendId} (${timeSinceDisconnect}ms ago)`);
        return null;
      } else {
        // Remove from block list after block duration expires
        disconnectedBackendIdsRef.current.delete(params.backendId);
      }
    }

    // CRITICAL: Check for existing account with same email BEFORE creating new backend
    const normalizedEmail = params.email?.toLowerCase() || null;
    if (normalizedEmail) {
      // Check if we already have an account with this email
      for (const [existingBackendId, credential] of driveCredentialCacheRef.current.entries()) {
        const existingEmail = credential.email?.toLowerCase();
        if (existingEmail === normalizedEmail && existingBackendId !== params.backendId) {
          console.log(`🔄 [upsertDriveAccount] Found existing account for [REDACTED], using existing backendId: ${(existingBackendId || '').substring(0, 8)}... instead of ${(params.backendId || '').substring(0, 8)}...`);
          // Use the existing backendId instead of creating a new one
          params.backendId = existingBackendId;
          params.keyPrefix = credential.keyPrefix;
          break;
        }
      }
      
      // Also check driveAccounts state
      for (const account of driveAccounts) {
        const accountEmail = userEmails.get(account.backendId);
        if (accountEmail?.toLowerCase() === normalizedEmail && account.backendId !== params.backendId) {
          console.log(`🔄 [upsertDriveAccount] Found existing account in state for [REDACTED], using existing backendId: ${(account.backendId || '').substring(0, 8)}... instead of ${(params.backendId || '').substring(0, 8)}...`);
          params.backendId = account.backendId;
          params.keyPrefix = account.keyPrefix;
          break;
        }
      }

      // CRITICAL: Lock to prevent multiple simultaneous upserts for the same email
      const lockKey = normalizedEmail;
      const existingLock = upsertLocksRef.current.get(lockKey);
      if (existingLock) {
        console.log(`⏳ [upsertDriveAccount] Waiting for existing upsert to complete for [REDACTED]`);
        return existingLock;
      }
    }

    await aggregatorService.ensureInitialized();

    // Create a promise for this upsert operation (with lock management)
    const lockKey = normalizedEmail || params.backendId;
    const upsertPromise = (async (): Promise<GoogleDriveBackend | null> => {
      try {
        // CRITICAL: Double-check for existing account before creating new backend
        // This prevents race conditions where multiple calls happen simultaneously
        if (normalizedEmail) {
          for (const [existingBackendId, credential] of driveCredentialCacheRef.current.entries()) {
            const existingEmail = credential.email?.toLowerCase();
            if (existingEmail === normalizedEmail && existingBackendId !== params.backendId) {
              console.log(`🔄 [upsertDriveAccount] Found existing account during backend creation, switching to: ${(existingBackendId || '').substring(0, 8)}...`);
              params.backendId = existingBackendId;
              params.keyPrefix = credential.keyPrefix;
              break;
            }
          }
        }

        let backend = aggregatorService.getBackend(params.backendId) as GoogleDriveBackend | null;
        if (!backend) {
          // CRITICAL: Final check - don't create if another backend with same email exists
          if (normalizedEmail) {
            for (const [registeredBackendId, registeredBackend] of Array.from(aggregatorService.getAllBackends().entries())) {
              if (registeredBackendId !== params.backendId) {
                const registeredEmail = (registeredBackend as any).getEmail?.()?.toLowerCase();
                if (registeredEmail === normalizedEmail) {
                  console.log(`🔄 [upsertDriveAccount] Found registered backend with same email, using: ${(registeredBackendId || '').substring(0, 16)}...`);
                  backend = registeredBackend as GoogleDriveBackend;
                  params.backendId = registeredBackendId;
                  break;
                }
              }
            }
          }

          if (!backend) {
            backend = new GoogleDriveBackend({
              id: params.backendId,
              name: params.email || 'Google Drive',
              storageKeyPrefix: params.keyPrefix,
              apiEndpoint: API_ENDPOINT,
              getOwnerApiToken: resolveOwnerApiToken,
            });
            aggregatorService.registerBackend(params.backendId, backend);
          }
        }

        const sessionId =
          authenticatedUserRef.current?.id || authenticatedUserRef.current?.publicKey || undefined;
        await backend.connect({
          token: params.token,
          refreshToken: params.refreshToken || undefined,
          email: params.email || undefined,
          sessionId,
        });

        const resolvedEmail = params.email || backend.getEmail() || null;

    setConnectedBackends((prev) => {
      const next = new Set(prev);
      next.add(params.backendId);
      return next;
    });

    const existingCredential = driveCredentialCacheRef.current.get(params.backendId);
    const nowIso = new Date().toISOString();

    driveCredentialCacheRef.current.set(params.backendId, {
      backendId: params.backendId,
      keyPrefix: params.keyPrefix,
      accessToken: params.token,
      refreshToken: params.refreshToken ?? existingCredential?.refreshToken ?? null,
      email: resolvedEmail ?? existingCredential?.email ?? null,
      connectedAt: params.connectedAt || existingCredential?.connectedAt || nowIso,
      updatedAt: params.updatedAt || nowIso
    });

    // CRITICAL: Clean up duplicate cache entries immediately
    cleanupDuplicateCacheEntries();

    purgeDuplicateBackendsForEmail(params.backendId, resolvedEmail ?? existingCredential?.email ?? null);

    const normalizedEmailForCleanup = resolvedEmail?.toLowerCase() ?? existingCredential?.email?.toLowerCase() ?? null;
    const staleBackends: string[] = [];

    if (normalizedEmailForCleanup) {
      for (const account of driveAccounts) {
        // SECURITY: email removed from DriveAccountState - use userEmails map instead
        const accountEmail = userEmails.get(account.backendId);
        if (
          account.backendId !== params.backendId &&
          accountEmail &&
          accountEmail.toLowerCase() === normalizedEmailForCleanup
        ) {
          staleBackends.push(account.backendId);
        }
      }
    }

    staleBackends.forEach((backendId) => unregisterBackend(backendId));

    setUserEmails((prev) => {
      if (!resolvedEmail) {
        return prev;
      }
                    const next = new Map(prev);
      next.set(params.backendId, resolvedEmail);
                    return next;
                  });

    setDriveAccounts((prev) => {
      const filtered = prev.filter(
        (account) =>
          account.backendId !== params.backendId && !staleBackends.includes(account.backendId)
      );

      // SECURITY: Do NOT store email in DriveAccountState - it's sensitive data
      // Email is stored in userEmails Map and encrypted storage only
      const next: DriveAccountState[] = [
        ...filtered,
        {
          backendId: params.backendId,
          keyPrefix: params.keyPrefix,
          // email removed - use userEmails Map or encrypted storage instead
      }
      ];
        persistDriveAccounts(next);
        return next;
      });

      setActiveBackendId(params.backendId);

      return backend;
      } catch (error) {
        console.error('❌ [upsertDriveAccount] Error during upsert:', error);
        throw error;
      } finally {
        // Clear the lock when done
        if (normalizedEmail) {
          upsertLocksRef.current.delete(lockKey);
        }
      }
    })();

    // Store the promise in the lock map
    if (normalizedEmail) {
      upsertLocksRef.current.set(lockKey, upsertPromise);
    }

    return upsertPromise;
  }, [aggregatorService, activeBackendId, API_ENDPOINT, driveAccounts, userEmails, resolveOwnerApiToken]);

  React.useEffect(() => {
    return () => {
      if (hydrationRetryTimeoutRef.current !== null) {
        window.clearTimeout(hydrationRetryTimeoutRef.current);
        hydrationRetryTimeoutRef.current = null;
      }
    };
  }, []);

  // CRITICAL: Track when disconnect happens to prevent immediate re-hydration and re-connection
  const disconnectTimestampRef = React.useRef<number>(0);
  const disconnectedBackendIdsRef = React.useRef<Set<string>>(new Set());
  const DISCONNECT_BLOCK_DURATION_MS = 10000; // Block re-adding disconnected accounts for 10 seconds (reduced from 30s to not block unlock)

  const hydrateStorageCredentialsFromAPI = React.useCallback(async (forceRefresh?: boolean) => {
    if (hydrationInProgressRef.current) {
      return;
    }
    
    // CRITICAL: Don't hydrate for 30 seconds after disconnect
    const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
    if (timeSinceDisconnect < DISCONNECT_BLOCK_DURATION_MS) {
      console.log(`⏭️ [StorageCredentials] Hydration BLOCKED - ${timeSinceDisconnect}ms since last disconnect (waiting ${DISCONNECT_BLOCK_DURATION_MS}ms)`);
      return;
    }
    
    hydrationInProgressRef.current = true;

    if (hydrationSuccessRef.current && !forceRefresh) {
      hydrationInProgressRef.current = false;
      return;
    }

    const now = Date.now();
    if (
      hydrationRateLimitUntilRef.current &&
      now < hydrationRateLimitUntilRef.current
    ) {
      if (!hydrationRateLimitLoggedRef.current) {
        hydrationRateLimitLoggedRef.current = true;
        console.debug('ℹ️ [StorageCredentials] Hydration paused due to recent rate limit', {
          nextAttemptInMs: hydrationRateLimitUntilRef.current - now,
        });
      }
      hydrationInProgressRef.current = false;
      return;
    }
    hydrationRateLimitLoggedRef.current = false;

    // CRITICAL: Generate pn identifier if not already available
    // This ensures we always use the standardized identifier
    let pnId = pnIdentifierRef.current;
    if (!pnId || !pnId.startsWith('pn-')) {
      pnId = await getPnIdentifier();
      if (!pnId) {
        console.warn('⚠️ [StorageCredentials] Cannot generate pn identifier for hydration - missing credentials');
        return;
      }
    }
    
    // Use only the pn identifier - no other candidates
    const identityCandidates = [pnId];

    let hydrated = false;
    let lastError: unknown = null;

    for (const candidateId of identityCandidates) {
      if (hydrationSuccessRef.current && !forceRefresh) {
        break;
      }

      if (hydrationMissingCandidatesRef.current.has(candidateId) && !forceRefresh) {
        continue;
      }

      const hasAttempted = hydrationAttemptedRef.current.has(candidateId);
      if (forceRefresh) {
        hydrationAttemptedRef.current.delete(candidateId);
      }
      hydrationAttemptedRef.current.add(candidateId);

      if (hasAttempted && !hydrationMissingCandidatesRef.current.has(candidateId) && !forceRefresh) {
        continue;
      }

      try {
        // candidateId (identityId) is secret - not logged
        console.debug('📥 [StorageCredentials] Fetching credentials from API...', {
          endpoint: API_ENDPOINT,
        });

        // CRITICAL: Use ONLY pn identifier - candidateId should already be pn identifier from getStorageIdentityCandidates
        // But double-check it's actually a pn identifier format
        const pnId = candidateId.startsWith('pn-') ? candidateId : null;
        if (!pnId) {
          console.warn(`⚠️ [StorageCredentials] Skipping non-pn identifier candidate: ${candidateId.substring(0, 20)}...`);
          hydrationMissingCandidatesRef.current.add(candidateId);
          continue;
        }
        const hydrationToken = resolveOwnerApiToken(pnId);
        if (!hydrationToken) {
          console.debug('ℹ️ [StorageCredentials] No OAuth token yet for this pN; deferring hydration');
          continue;
        }
        const response = await ownerGet(
          hydrationToken,
          `/api/storage/credentials/${encodeURIComponent(pnId)}`
        );
        if (response.status === 404) {
          hydrationMissingCandidatesRef.current.add(candidateId);
          // candidateId (identityId) is secret - not logged
          // 404 is expected if credentials haven't been stored yet (e.g., user connected before persistence was implemented)
          // User will need to reconnect to store credentials properly
          console.debug('ℹ️ [StorageCredentials] No stored credentials found for identity (404) - user may need to reconnect');
          continue;
        }

        if (response.status === 403) {
          // Common under device policy (keyed device required) or custody — keep local credentials.
          console.debug(
            'ℹ️ [StorageCredentials] Credential hydrate forbidden (403); using local/sealed Drive credentials'
          );
          continue;
        }

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 30000;
          hydrationRateLimitUntilRef.current = Date.now() + retryAfterMs;
          hydrationRateLimitLoggedRef.current = false;
          // candidateId (identityId) is secret - not logged
          console.warn('⚠️ [StorageCredentials] API rate limited hydration; backing off', {
            retryAfterMs,
          });
          if (hydrationRetryTimeoutRef.current !== null) {
            window.clearTimeout(hydrationRetryTimeoutRef.current);
          }
          hydrationRetryTimeoutRef.current = window.setTimeout(() => {
            hydrationRateLimitUntilRef.current = null;
            hydrationRateLimitLoggedRef.current = false;
            hydrationRetryTimeoutRef.current = null;
            hydrateStorageCredentialsFromAPI();
          }, retryAfterMs + 200);
          break;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          // candidateId (identityId) is secret - not logged
          console.warn('⚠️ [StorageCredentials] Failed to fetch credentials from API:', {
            status: response.status,
            error: errorText,
          });
          continue;
        }

        const result = await response.json();
        const payload = result?.credentials;
        if (!payload) {
          // candidateId (identityId) is secret - not logged
          console.warn('⚠️ [StorageCredentials] API returned no credentials payload', {
            endpoint: `${API_ENDPOINT}/api/storage/credentials/[REDACTED]`,
          });
          continue;
        }

        const storedAccounts =
          payload.googleDriveAccounts ||
          payload.googleDrive ||
          [];
        const accountsArray = Array.isArray(storedAccounts)
          ? storedAccounts
          : storedAccounts
            ? [storedAccounts]
            : [];

        console.log(`🔍 [StorageCredentials] API returned ${accountsArray.length} account(s) in response`);

        if (accountsArray.length === 0) {
          // candidateId (identityId) is secret - not logged
          console.warn('ℹ️ [StorageCredentials] Credentials payload contained no Google Drive accounts');
          continue;
        }

        // CRITICAL: HARD LIMIT - If API has more than 2 accounts, something is VERY wrong
        // Clear everything and start fresh with only ONE account
        if (accountsArray.length > 2) {
          console.error(`🚨 [StorageCredentials] CRITICAL: API returned ${accountsArray.length} accounts (expected max 2). This is a severe bug. Clearing ALL accounts and starting fresh.`);
          
          // Clear cache completely
          driveCredentialCacheRef.current.clear();
          
          // Clear driveAccounts state
          setDriveAccounts([]);
          persistDriveAccounts([]);
          
          // Clear API storage - send empty array to API
          try {
            // CRITICAL: Use ONLY pn identifier - getStorageIdentityCandidates now returns only pn identifier
            const identityCandidates = getStorageIdentityCandidates();
            const pnId = identityCandidates.length > 0 && identityCandidates[0]?.startsWith('pn-') ? identityCandidates[0] : null;
            if (pnId) {
              await ownerFetch(hydrationToken, 'PUT', `/api/storage/credentials/${encodeURIComponent(pnId)}`, {
                credentials: { googleDriveAccounts: [] },
                cid: null,
              }).catch(() => {});
            } else {
              console.warn('⚠️ [StorageCredentials] No pn identifier available for clearing API storage');
            }
            console.log(`✅ [StorageCredentials] Cleared ${accountsArray.length} accounts from API storage`);
          } catch (clearError) {
            console.error('❌ [StorageCredentials] Failed to clear API storage:', clearError);
          }
          
          // Don't hydrate anything - user needs to reconnect manually
          hydrationInProgressRef.current = false;
          return;
        }

        // CRITICAL: Deduplicate accounts BEFORE hydrating - only ONE account per email maximum
        const uniqueAccountsByEmail = new Map<string, typeof accountsArray[0]>();
        const accountsWithoutEmail: typeof accountsArray = [];
        
        for (const account of accountsArray) {
          if (account?.email) {
            const normalizedEmail = account.email.toLowerCase();
            // Only keep ONE account per email - the most recent one
            if (!uniqueAccountsByEmail.has(normalizedEmail)) {
              uniqueAccountsByEmail.set(normalizedEmail, account);
            } else {
              const existing = uniqueAccountsByEmail.get(normalizedEmail)!;
              // Keep the most recent one (by updatedAt or connectedAt)
              if ((account.updatedAt && existing.updatedAt && account.updatedAt > existing.updatedAt) ||
                  (account.connectedAt && existing.connectedAt && account.connectedAt > existing.connectedAt)) {
                uniqueAccountsByEmail.set(normalizedEmail, account);
              }
            }
          } else {
            // Only keep ONE account without email
            if (accountsWithoutEmail.length === 0) {
              accountsWithoutEmail.push(account);
            }
          }
        }
        
        const deduplicatedAccounts = Array.from(uniqueAccountsByEmail.values()).concat(accountsWithoutEmail);
        
        // CRITICAL: Final safety check - if we still have more than 1 account, something is wrong
        if (deduplicatedAccounts.length > 1) {
          console.error(`🚨 [StorageCredentials] After deduplication, still have ${deduplicatedAccounts.length} accounts (expected max 1). Keeping only the first one.`);
          deduplicatedAccounts.length = 1;
        }
        
        console.log(`🔄 [StorageCredentials] Hydrating ${deduplicatedAccounts.length} unique account(s) from ${accountsArray.length} total in API response`);

        // CRITICAL: Only hydrate accounts that aren't already in the cache
        // This prevents re-adding disconnected accounts
        const accountsToHydrate: typeof deduplicatedAccounts = [];
        const currentCacheEmails = new Set<string>();
        
        // Build set of emails already in cache
        for (const [cachedBackendId, cachedCredential] of driveCredentialCacheRef.current.entries()) {
          if (cachedCredential.email) {
            currentCacheEmails.add(cachedCredential.email.toLowerCase());
          }
        }
        
        // Only hydrate accounts that aren't already in cache
        for (const account of deduplicatedAccounts) {
          const email = account?.email || null;
          if (email && currentCacheEmails.has(email.toLowerCase())) {
            console.log(`⏭️ [StorageCredentials] Skipping hydration for [REDACTED] - already in cache`);
            continue;
          }
          accountsToHydrate.push(account);
        }
        
        console.log(`🔄 [StorageCredentials] Actually hydrating ${accountsToHydrate.length} new account(s) (${deduplicatedAccounts.length - accountsToHydrate.length} skipped - already in cache)`);

        // CRITICAL: Before hydrating, check if ANY account with this email already exists in aggregatorService
        // If it does, SKIP hydration entirely - don't create duplicate backends
        const accountsToActuallyHydrate: typeof accountsToHydrate = [];
        const registeredBackends = aggregatorService?.getAllBackends() || new Map();
        
        for (const account of accountsToHydrate) {
          const accountEmail = account?.email?.toLowerCase();
          if (accountEmail) {
            // Check if aggregatorService already has a backend with this email
            let accountExists = false;
            for (const [backendId, backend] of registeredBackends.entries()) {
              if (backend instanceof GoogleDriveBackend) {
                const backendEmail = backend.getEmail()?.toLowerCase();
                if (backendEmail === accountEmail) {
                  console.log(`⏭️ [StorageCredentials] SKIPPING hydration: Account with email [REDACTED] already exists in aggregatorService (backendId: ${(backendId || '').substring(0, 8)}...)`);
                  accountExists = true;
                  break;
                }
              }
            }
            if (!accountExists) {
              accountsToActuallyHydrate.push(account);
            }
          } else {
            // Account without email - only hydrate if we have no accounts at all
            if (accountsToActuallyHydrate.length === 0 && registeredBackends.size === 0) {
              accountsToActuallyHydrate.push(account);
            } else {
              console.log(`⏭️ [StorageCredentials] SKIPPING hydration: Account without email (only hydrate if no accounts exist)`);
            }
          }
        }

        console.log(`🔄 [StorageCredentials] After aggregatorService check: Actually hydrating ${accountsToActuallyHydrate.length} account(s) (${accountsToHydrate.length - accountsToActuallyHydrate.length} skipped - already in aggregatorService)`);

        // CRITICAL: Only hydrate ONE account maximum - if API has 500 accounts, we only want ONE
        if (accountsToActuallyHydrate.length > 1) {
          console.error(`🚨 [StorageCredentials] CRITICAL: After all checks, still have ${accountsToActuallyHydrate.length} accounts to hydrate. Keeping only the first one.`);
          accountsToActuallyHydrate.length = 1;
        }

        for (const account of accountsToActuallyHydrate) {
          const { accessToken: token, refreshToken: rt } = driveAccountTokens(
            account as Record<string, unknown>
          );
          if (!token) {
            continue;
          }
          const email = account?.email || null;
          const refreshToken = rt;
          const storedBackendId = typeof account?.backendId === 'string' ? account.backendId : null;
          const storedKeyPrefix = typeof account?.keyPrefix === 'string' ? account.keyPrefix : null;
          const identifiers = storedBackendId && storedKeyPrefix
            ? { backendId: storedBackendId, keyPrefix: storedKeyPrefix, isNew: false }
            : resolveIdentifiersForEmail(email);

          try {
            const backend = await upsertDriveAccount({
              backendId: identifiers.backendId,
              keyPrefix: identifiers.keyPrefix,
              token,
              refreshToken,
              email,
              connectedAt: account?.connectedAt,
              updatedAt: account?.updatedAt
            });
            // Hydrated access tokens are often stale — refresh before Drive calls.
            if (backend && typeof (backend as GoogleDriveBackend).ensureAccessToken === 'function') {
              await (backend as GoogleDriveBackend).ensureAccessToken();
            }
          } catch (upsertError) {
            console.warn('⚠️ [StorageCredentials] Failed to reconnect Google Drive account from API payload', {
              email,
              upsertError,
            });
          }
        }

        hydrated = true;
        hydrationSuccessRef.current = candidateId;
        hydrationMissingCandidatesRef.current.delete(candidateId);
        hydrationRateLimitUntilRef.current = null;
        hydrationRateLimitLoggedRef.current = false;
        if (hydrationRetryTimeoutRef.current !== null) {
          window.clearTimeout(hydrationRetryTimeoutRef.current);
          hydrationRetryTimeoutRef.current = null;
        }
        
        // CRITICAL: Don't persist after hydration - auto-persist is disabled
        // Hydration just loads accounts from API, no need to persist back
        
        break;
      } catch (error) {
        lastError = error;
        // candidateId (identityId) is secret - not logged
        console.warn('⚠️ [StorageCredentials] Candidate fetch failed (non-blocking):', {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (!hydrated && identityCandidates.length > 0 && lastError) {
      console.warn('⚠️ [StorageCredentials] No stored credentials available yet', {
        identityCandidates,
        lastError,
      });
    }

    hydrationInProgressRef.current = false;

    if (hydrated) {
      const loadFilesFn = loadFilesRef.current;
      if (loadFilesFn) {
        try {
          await loadFilesFn();
        } catch (loadErr) {
          console.warn('⚠️ [StorageCredentials] Failed to load files after hydration', loadErr);
        }
      }

      const loadStorageQuotaFn = loadStorageQuotaRef.current;
      if (loadStorageQuotaFn) {
        try {
          await loadStorageQuotaFn();
        } catch (quotaErr) {
          console.warn('⚠️ [StorageCredentials] Failed to load storage quota after hydration', quotaErr);
        }
      }
    } else {
      // If hydration didn't find accounts in API, check if we have local accounts to persist
      console.log('[StorageCredentials] Hydration complete but no accounts found in API, checking local cache...');
      const cacheEntries = Array.from(driveCredentialCacheRef.current.values());
      if (cacheEntries.length > 0) {
        console.log(`[StorageCredentials] Found ${cacheEntries.length} account(s) in local cache - auto-persist effect will sync to API`);
        // CRITICAL: Don't persist - auto-persist is disabled
        // Accounts are loaded from cache, no need to persist
      }
    }
  }, [API_ENDPOINT, resolvedAuth?.publicKey, authenticatedUser?.id, authenticatedUser?.publicKey, upsertDriveAccount, persistStorageCredentialsToAPI, resolveOwnerApiToken, apiToken]);
  // SECURITY: Removed resolvedAuth?.pnName, authenticatedUser?.pnName - these are secrets

  React.useEffect(() => {
    if (!apiToken || !authenticatedUser?.id) return;
    if (driveCredentialCacheRef.current.size > 0) return;
    void hydrateStorageCredentialsFromAPI(true);
  }, [apiToken, authenticatedUser?.id, hydrateStorageCredentialsFromAPI]);

  // Load Google Drive token from encrypted metadata when user unlocks
  React.useEffect(() => {
    if (!authenticatedUser?.id) {
      return;
    }
    
    // Wait for getStorageIdentityCandidates to be ready (it depends on pnIdentifier)
    // Don't call it during useEffect initialization - call it inside the async function
    const loadTokenFromMetadata = async () => {
      // Wait for pn identifier to be ready (with retry mechanism)
      let retries = 0;
      const maxRetries = 10;
      while (!pnIdentifierRef.current && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      // Call getStorageIdentityCandidates here, not during useEffect initialization
      // This ensures pnIdentifier is ready when accessed
      const candidates = getStorageIdentityCandidates();
      const identityId = candidates.length > 0 ? candidates[0] : null;
      if (!authenticatedUser?.id || !identityId) {
        // Only log warning if we've waited and still don't have it
        if (retries >= maxRetries) {
          console.warn('⚠️ [loadTokenFromMetadata] Missing authenticated identity details after waiting', {
          hasAuthenticatedUser: !!authenticatedUser,
          hasId: !!authenticatedUser?.id,
          identityId,
            pnIdentifierReady: pnIdentifierRef.current !== null,
        });
        }
        return;
      }

      // SECURITY: Get pnName from SecureCredentialManager (secrets), not from state
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      const effectivePnName = credentials?.pnName || null;

      if (!effectivePnName) {
        if (!missingPnNameLogRef.current) {
          missingPnNameLogRef.current = true;
          console.debug('ℹ️ [loadTokenFromMetadata] No pnName available yet – deferring restore');
        }
        return;
      }
      missingPnNameLogRef.current = false;

      if (!aggregatorService) {
        return;
      }

      if (hasRestoredFromMetadataRef.current === authenticatedUser.id) {
        return;
      }

      try {
        // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        const passcode = getPasscodeFromSecureStorage(sessionId);

        // CRITICAL: Ensure pn identifier is generated BEFORE hydration
        // This prevents hydration from using public key/DID/pn name
        if (!pnIdentifierRef.current || !pnIdentifierRef.current.startsWith('pn-')) {
          const pnId = await getPnIdentifier();
          if (!pnId) {
            console.warn('⚠️ [handleConnectGoogleDrive] Cannot generate pn identifier - skipping hydration');
          } else {
            pnIdentifierRef.current = pnId;
          }
        }

        await hydrateStorageCredentialsFromAPI();

        // Fix 1: Prefer API over metadata - API is source of truth (server can refresh tokens).
        // If API returned accounts, skip loading from metadata to avoid overwriting fresh tokens with stale ones.
        if (driveCredentialCacheRef.current.size > 0) {
          console.log('[loadTokenFromMetadata] API has accounts - skipping metadata load (API is source of truth)');
          hasRestoredFromMetadataRef.current = authenticatedUser.id;
          return;
        }

        const { SecureMetadataStorage } = await import('../../../utils/secureMetadataStorage');
        const { SecureMetadataCrypto } = await import('../../../utils/secureMetadata');

        try {
          await SecureMetadataStorage.syncMetadataFromCloud(authenticatedUser.id);
        } catch (cloudSyncError) {
          console.warn('⚠️ [loadTokenFromMetadata] Unable to sync metadata from cloud (non-blocking):', cloudSyncError);
        }

        let metadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);

        if (!metadata) {
          try {
            metadata = await SecureMetadataStorage.getMetadataFromCloud(authenticatedUser.id);
          } catch (fallbackError) {
            console.warn('⚠️ [loadTokenFromMetadata] Fallback cloud fetch failed (non-blocking):', fallbackError);
          }
        }

        if (!metadata) {
          return;
        }

        if (!passcode) {
          if (!missingPasscodeLogRef.current) {
            missingPasscodeLogRef.current = true;
            console.debug('ℹ️ [loadTokenFromMetadata] Passcode not available yet – stored encrypted metadata for later');
          }
          return;
        }
        missingPasscodeLogRef.current = false;

        const decrypted = await SecureMetadataCrypto.decryptMetadata(metadata, effectivePnName, passcode);

        const storedCreds = decrypted.storageCredentials?.googleDriveAccounts || decrypted.storageCredentials?.googleDrive;
        const credsArray = Array.isArray(storedCreds) ? storedCreds : storedCreds ? [storedCreds] : [];

        // CRITICAL: Don't persist during load - auto-persist is disabled
        // Loading just restores accounts from metadata, no need to persist back

        // CRITICAL: Deduplicate accounts BEFORE loading to prevent duplicates
        const uniqueCredsByEmail = new Map<string, typeof credsArray[0]>();
        const credsWithoutEmail: typeof credsArray = [];
        
        for (const creds of credsArray) {
          if (creds?.email) {
            const normalizedEmail = creds.email.toLowerCase();
            const existing = uniqueCredsByEmail.get(normalizedEmail);
            if (!existing) {
              uniqueCredsByEmail.set(normalizedEmail, creds);
            }
          } else {
            credsWithoutEmail.push(creds);
          }
        }
        
        const deduplicatedCreds = Array.from(uniqueCredsByEmail.values()).concat(credsWithoutEmail);
        
        if (deduplicatedCreds.length !== credsArray.length) {
          console.log(`🔄 [loadTokenFromMetadata] Deduplicated ${credsArray.length} accounts to ${deduplicatedCreds.length} unique accounts`);
        }

        for (const creds of deduplicatedCreds) {
          const { accessToken: token, refreshToken } = driveAccountTokens(
            creds as Record<string, unknown>
          );
          if (!token) {
            continue;
          }

          const email = creds.email || null;
          const identifiers = resolveIdentifiersForEmail(email);

          const backend = await upsertDriveAccount({
            backendId: identifiers.backendId,
            keyPrefix: identifiers.keyPrefix,
            token,
            refreshToken: refreshToken || null,
            email
          });

          if (backend) {
            try {
              if (typeof (backend as GoogleDriveBackend).ensureAccessToken === 'function') {
                await (backend as GoogleDriveBackend).ensureAccessToken();
              }
              if (loadFilesRef.current) {
                await loadFilesRef.current();
              }
            } catch (loadErr) {
              console.warn('⚠️ [loadTokenFromMetadata] Failed to load files for restored account', loadErr);
            }
          }
        }

        if (credsArray.length > 0) {
          if (loadStorageQuotaRef.current) {
            await loadStorageQuotaRef.current();
          }
        }

        hasRestoredFromMetadataRef.current = authenticatedUser.id;
      } catch (error) {
        console.debug('Could not load token from metadata:', error);
        hasRestoredFromMetadataRef.current = null;
      }
    };

    loadTokenFromMetadata();
  }, [
    authenticatedUser?.id,
    // SECURITY: Removed authenticatedUser?.pnName, resolvedAuth?.pnName, resolvedAuth?.passcode - these are secrets
    aggregatorService,
    hydrateStorageCredentialsFromAPI,
    persistStorageCredentialsToAPI,
    resolvedAuth?.publicKey,
    apiToken,
    // Use authenticatedUser?.id to trigger refresh when user changes
  ]);

  // Fix 3: 401 recovery - register handler for GoogleDriveBackend to attempt rehydration before disconnect
  React.useEffect(() => {
    const attemptRecovery = async (backendId: string): Promise<boolean> => {
      try {
        console.log('🔄 [401Recovery] Attempting rehydration from API for backend:', backendId);
        await hydrateStorageCredentialsFromAPI(true);
        const hasAccount = driveCredentialCacheRef.current.has(backendId) &&
          driveCredentialCacheRef.current.get(backendId)?.accessToken;
        if (hasAccount) {
          const credential = driveCredentialCacheRef.current.get(backendId)!;
          const backend = aggregatorService?.getBackend(backendId) as {
            connect: (credentials: {
              token: string;
              refreshToken?: string;
              email?: string;
              sessionId?: string;
            }) => Promise<void>;
          } | null;
          if (backend && credential.accessToken) {
            const sessionId =
              authenticatedUserRef.current?.id || authenticatedUserRef.current?.publicKey || undefined;
            await backend.connect({
              token: credential.accessToken,
              refreshToken: credential.refreshToken ?? undefined,
              email: credential.email ?? undefined,
              sessionId,
            });
            console.log('✅ [401Recovery] Applied fresh token from API to backend');
            return true;
          }
        }
      } catch (err) {
        console.warn('⚠️ [401Recovery] Rehydration failed:', err);
      }
      return false;
    };
    (globalThis as any).__attemptGoogleDrive401Recovery = attemptRecovery;
    return () => {
      delete (globalThis as any).__attemptGoogleDrive401Recovery;
    };
  }, [hydrateStorageCredentialsFromAPI, aggregatorService]);

  return {
    driveCredentialCacheRef,
    unregisterBackend,
    cleanupDuplicateCacheEntries,
    purgeDuplicateBackendsForEmail,
    resolveIdentifiersForEmail,
    buildStorageCredentialPayload,
    persistCredentialsToSecureMetadata,
    persistStorageCredentialsToAPI,
    hydrateStorageCredentialsFromAPI,
    upsertDriveAccount,
    disconnectTimestampRef,
    disconnectedBackendIdsRef,
    DISCONNECT_BLOCK_DURATION_MS,
  };
}

export type UseDriveStorageCredentialsResult = ReturnType<typeof useDriveStorageCredentials>;
