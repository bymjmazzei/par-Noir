/**
 * Google Drive storage credential lifecycle for FileStorageAggregator.
 *
 * Owns the in-memory credential cache, backend registration/unregistration and
 * persistence to secure metadata + the par Noir API, and composes the token
 * refresh listener (`useDriveTokenRefresh`) and the hydrate/restore/401 recovery
 * effects (`useDriveCredentialHydration`) on top of it.
 *
 * Device custody note: the API does not hold Google OAuth secrets. When
 * `clientSideLayoutRequired` is set, the dashboard must POST /storage/initialize
 * with `X-PN-Cloud-Access-Token` (ephemeral Google token) so `pnDriveIndex` is
 * persisted — required for device keying and owner-index. Routine token refreshes
 * still must not re-run initialize.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { API_ENDPOINT } from '../../../config/api';
import { ownerFetch } from '../../../services/ownerApiService';
import { persistDriveAccounts } from '../storageHelpers';
import {
  type DriveSetupProgress,
  type DriveAccountState,
  type StoredDriveCredential,
} from '../FileStorageAggregatorTypes';
import {
  buildStorageCredentialPayloadFromCache,
  cleanupDuplicateCacheEntries as cleanupDuplicateCacheEntriesInCache,
  purgeDuplicateBackendsForEmail as purgeDuplicateBackendsForEmailInCache,
  resolveIdentifiersForEmail as resolveIdentifiersForEmailInCache,
} from './driveCredentials/credentialCacheHelpers';
import {
  shouldRunServerDriveInit,
  shouldSkipServerDriveInit,
} from './driveCredentials/driveInitDecision';
import { useDriveTokenRefresh } from './useDriveTokenRefresh';
import { useDriveCredentialHydration } from './useDriveCredentialHydration';

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
    options?: {
      onProgress?: (progress: DriveSetupProgress) => void;
      maxAttempts?: number;
      googleAccessToken?: string;
    }
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

  // CRITICAL: Track when disconnect happens to prevent immediate re-hydration and re-connection
  const disconnectTimestampRef = React.useRef<number>(0);
  const disconnectedBackendIdsRef = React.useRef<Set<string>>(new Set());
  const DISCONNECT_BLOCK_DURATION_MS = 10000; // Block re-adding disconnected accounts for 10 seconds (reduced from 30s to not block unlock)

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

  function cleanupDuplicateCacheEntries() {
    cleanupDuplicateCacheEntriesInCache(driveCredentialCacheRef.current);
  }

  function purgeDuplicateBackendsForEmail(preferredBackendId: string, email: string | null | undefined) {
    purgeDuplicateBackendsForEmailInCache(preferredBackendId, email, {
      cache: driveCredentialCacheRef.current,
      unregisterBackend,
      setDriveAccounts,
    });
  }

  function resolveIdentifiersForEmail(email?: string | null) {
    return resolveIdentifiersForEmailInCache(email, {
      cache: driveCredentialCacheRef.current,
      driveAccounts,
      userEmails,
      aggregatorService,
    });
  }

  const buildStorageCredentialPayload = React.useCallback(() => {
    return buildStorageCredentialPayloadFromCache(driveCredentialCacheRef.current);
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

          const googleTok =
            (payload.googleDriveAccounts?.[0] as { accessToken?: string; access_token?: string } | undefined)
              ?.accessToken ||
            (payload.googleDriveAccounts?.[0] as { access_token?: string } | undefined)?.access_token;

          // Device custody: API has no Google secrets — forward ephemeral token and
          // run initialize so pnDriveIndex is written (needed for device keying).
          if (shouldSkipServerDriveInit(result) && typeof googleTok === 'string' && googleTok.trim()) {
            console.log(
              '🔄 [StorageCredentials] Device custody — building Drive layout with forwarded Google token…'
            );
            setDriveSetupProgress({
              phase: 'starting',
              stepLabel: 'Preparing your par Noir storage…',
              percent: 0,
            });
            const ok = await postDriveInitializeWithRetry(pnIdentifier, accessToken, {
              onProgress: setDriveSetupProgress,
              googleAccessToken: googleTok.trim(),
            });
            clearDriveSetupProgress();
            if (!ok) {
              console.warn(
                '⚠️ [StorageCredentials] Custody Drive init failed; owner-index / device keying may not work until retry'
              );
              const { markOwnerIndexUnavailable } = await import(
                '../../../services/storage/ownerIndexAvailability'
              );
              markOwnerIndexUnavailable(pnIdentifier);
            }
          } else if (shouldSkipServerDriveInit(result)) {
            console.warn(
              '⏭️ [StorageCredentials] clientSideLayoutRequired but no local Google token — cannot build server index'
            );
            const { markOwnerIndexUnavailable } = await import(
              '../../../services/storage/ownerIndexAvailability'
            );
            markOwnerIndexUnavailable(pnIdentifier);
          } else if (shouldRunServerDriveInit(result)) {
            console.log('🔄 [StorageCredentials] Building Drive layout on server (may take a few minutes)...');
            setDriveSetupProgress({
              phase: 'starting',
              stepLabel: 'Preparing your par Noir storage…',
              percent: 0,
            });
            const ok = await postDriveInitializeWithRetry(pnIdentifier, accessToken, {
              onProgress: setDriveSetupProgress,
              ...(typeof googleTok === 'string' && googleTok.trim()
                ? { googleAccessToken: googleTok.trim() }
                : {}),
            });
            clearDriveSetupProgress();
            if (!ok) {
              console.warn(
                '⚠️ [StorageCredentials] Server Drive init skipped or failed; using client-side Drive discovery'
              );
            }
          } else {
            console.log('⏭️ [StorageCredentials] Drive layout already built; skipping initialize');
            const { clearOwnerIndexUnavailable } = await import(
              '../../../services/storage/ownerIndexAvailability'
            );
            clearOwnerIndexUnavailable(pnIdentifier);
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

  // Token refresh updates the local/sealed credentials only — never the API.
  useDriveTokenRefresh({
    aggregatorService,
    authenticatedUser,
    driveAccounts,
    setDriveAccounts,
    userEmails,
    setUserEmails,
    driveCredentialCacheRef,
    purgeDuplicateBackendsForEmail,
    disconnectedBackendIdsRef,
    disconnectTimestampRef,
    disconnectBlockDurationMs: DISCONNECT_BLOCK_DURATION_MS,
    pnIdentifierRef,
    loadFilesRef,
    ownerIndexWarningLoggedRef,
    ownerIndexRetryCountsRef,
    rateLimitedBackendsRef,
  });

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
            if (account.backendId === params.backendId) continue;
            // One Drive account per pN: drop same-email duplicates and unlabeled "Drive N" placeholders
            if (
              !accountEmail ||
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

  const { hydrateStorageCredentialsFromAPI } = useDriveCredentialHydration({
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
    disconnectBlockDurationMs: DISCONNECT_BLOCK_DURATION_MS,
    authenticatedUserRef,
    pnIdentifierRef,
    loadFilesRef,
    loadStorageQuotaRef,
  });

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
