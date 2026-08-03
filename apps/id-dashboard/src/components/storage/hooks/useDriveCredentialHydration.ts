/**
 * Hydrates Google Drive credentials back into the aggregator: from the par Noir
 * API, from encrypted secure metadata on unlock, and from the 401 recovery hook
 * that `GoogleDriveBackend` calls before giving up on a backend.
 *
 * Device custody note: hydration only reads credentials and reconnects backends.
 * It never POSTs /storage/initialize, and it respects the post-disconnect block
 * window so a disconnect is not immediately undone.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { API_ENDPOINT } from '../../../config/api';
import { ownerFetch, ownerGet } from '../../../services/ownerApiService';
import { driveAccountTokens, persistDriveAccounts } from '../storageHelpers';
import type { DriveAccountState, StoredDriveCredential } from '../FileStorageAggregatorTypes';
import type { ResolvedDriveIdentifiers } from './driveCredentials/credentialCacheHelpers';

export interface UpsertDriveAccountParams {
  backendId: string;
  keyPrefix: string;
  token: string;
  refreshToken?: string | null;
  email?: string | null;
  connectedAt?: string;
  updatedAt?: string;
}

export interface UseDriveCredentialHydrationParams {
  authenticatedUser: any;
  apiToken: string | null;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  setDriveAccounts: React.Dispatch<React.SetStateAction<DriveAccountState[]>>;
  driveCredentialCacheRef: React.MutableRefObject<Map<string, StoredDriveCredential>>;
  resolveIdentifiersForEmail: (email?: string | null) => ResolvedDriveIdentifiers;
  upsertDriveAccount: (params: UpsertDriveAccountParams) => Promise<GoogleDriveBackend | null>;
  persistStorageCredentialsToAPI: (credentialsPayload?: any, cid?: string | null) => Promise<void>;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  getPasscodeFromSecureStorage: (sessionId: string | null | undefined) => string | null;
  getPnIdentifier: () => Promise<string | null>;
  getStorageIdentityCandidates: () => string[];
  disconnectTimestampRef: React.MutableRefObject<number>;
  disconnectBlockDurationMs: number;
  authenticatedUserRef: React.MutableRefObject<any>;
  pnIdentifierRef: React.MutableRefObject<string | null>;
  loadFilesRef: React.MutableRefObject<(() => Promise<void>) | null>;
  loadStorageQuotaRef: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function useDriveCredentialHydration({
  authenticatedUser,
  apiToken,
  resolvedAuth,
  aggregatorService,
  setDriveAccounts,
  driveCredentialCacheRef,
  resolveIdentifiersForEmail,
  upsertDriveAccount,
  persistStorageCredentialsToAPI,
  resolveOwnerApiToken,
  getPasscodeFromSecureStorage,
  getPnIdentifier,
  getStorageIdentityCandidates,
  disconnectTimestampRef,
  disconnectBlockDurationMs,
  authenticatedUserRef,
  pnIdentifierRef,
  loadFilesRef,
  loadStorageQuotaRef,
}: UseDriveCredentialHydrationParams) {
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

  React.useEffect(() => {
    return () => {
      if (hydrationRetryTimeoutRef.current !== null) {
        window.clearTimeout(hydrationRetryTimeoutRef.current);
        hydrationRetryTimeoutRef.current = null;
      }
    };
  }, []);

  const hydrateStorageCredentialsFromAPI = React.useCallback(async (forceRefresh?: boolean) => {
    if (hydrationInProgressRef.current) {
      return;
    }

    // CRITICAL: Don't hydrate for 30 seconds after disconnect
    const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
    if (timeSinceDisconnect < disconnectBlockDurationMs) {
      console.log(`⏭️ [StorageCredentials] Hydration BLOCKED - ${timeSinceDisconnect}ms since last disconnect (waiting ${disconnectBlockDurationMs}ms)`);
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
        hydrationInProgressRef.current = false;
        return;
      }
    }

    // Use only the pn identifier - no other candidates
    const identityCandidates = [pnId];

    let hydrated = false;

    // Device custody: try sealed / session-local secrets before treating API layout as connected
    try {
      const sessionId = authenticatedUser?.id ?? null;
      const sessionCreds = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (sessionCreds && pnId) {
        const { loadLocalCloudCredentials } = await import('@par-noir/device-cloud-credentials');
        const local = await loadLocalCloudCredentials({
          identityId: pnId,
          session: {
            sessionId: sessionId!,
            pnName: sessionCreds.pnName,
            passcode: sessionCreds.passcode
          }
        });
        const accounts = local?.googleDriveAccounts ?? [];
        for (const account of accounts) {
          const token = account.accessToken || account.access_token;
          if (!token) continue;
          const email = account.email || null;
          // Prefer sealed account ids so reconnect keeps the same Drive row / title.
          const sealedBackendId = account.backendId || account.accountId || null;
          const identifiers =
            sealedBackendId &&
            (sealedBackendId.startsWith('google_drive::') || account.backendId)
              ? {
                  backendId: account.backendId || sealedBackendId,
                  keyPrefix:
                    account.keyPrefix ||
                    `google_drive_${(account.backendId || sealedBackendId)
                      .replace(/^google_drive::/, '')
                      .replace(/[^a-zA-Z0-9_-]/g, '_')
                      .slice(0, 64)}`,
                  isNew: false
                }
              : resolveIdentifiersForEmail(email);
          try {
            const backend = await upsertDriveAccount({
              backendId: identifiers.backendId,
              keyPrefix: identifiers.keyPrefix,
              token,
              refreshToken: account.refreshToken || account.refresh_token,
              email,
              connectedAt: account.connectedAt,
              updatedAt: account.updatedAt
            });
            if (backend && typeof (backend as GoogleDriveBackend).ensureAccessToken === 'function') {
              await (backend as GoogleDriveBackend).ensureAccessToken();
            }
            hydrated = true;
          } catch {
            /* try next */
          }
        }
        if (hydrated) {
          hydrationSuccessRef.current = pnId;
          hydrationInProgressRef.current = false;
          const loadFilesFn = loadFilesRef.current;
          if (loadFilesFn) {
            try {
              await loadFilesFn();
            } catch {
              /* non-blocking */
            }
          }
          return;
        }
      }
    } catch {
      /* fall through to API layout hydration */
    }
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
            hydrated = true;
          } catch (upsertError) {
            console.warn('⚠️ [StorageCredentials] Failed to reconnect Google Drive account from API payload', {
              email,
              upsertError,
            });
          }
        }

        if (hydrated) {
          hydrationSuccessRef.current = candidateId;
          hydrationMissingCandidatesRef.current.delete(candidateId);
          hydrationRateLimitUntilRef.current = null;
          hydrationRateLimitLoggedRef.current = false;
          if (hydrationRetryTimeoutRef.current !== null) {
            window.clearTimeout(hydrationRetryTimeoutRef.current);
            hydrationRetryTimeoutRef.current = null;
          }
        }

        // CRITICAL: Don't persist after hydration - auto-persist is disabled
        // Hydration just loads accounts from API, no need to persist back

        if (hydrated) break;
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
    hydrateStorageCredentialsFromAPI,
  };
}
