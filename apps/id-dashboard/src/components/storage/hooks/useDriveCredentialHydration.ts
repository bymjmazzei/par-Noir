/**
 * Hydrates Google Drive backends from the shared device-cloud session
 * (sealed / session memory). Same SoT as browser reconnect and owner API calls.
 *
 * Never treats API layout credentials or SecureMetadata as a source of live Google tokens.
 * Never POSTs /storage/initialize from hydration.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
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
  /** Epoch ms when the access token expires. */
  expiresAt?: number | null;
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
  getPasscodeFromSecureStorage: (sessionId: string | null | undefined) => string | null;
  getPnIdentifier: () => Promise<string | null>;
  getStorageIdentityCandidates: () => string[];
  disconnectTimestampRef: React.MutableRefObject<number>;
  disconnectBlockDurationMs: number;
  authenticatedUserRef: React.MutableRefObject<any>;
  pnIdentifierRef: React.MutableRefObject<string | null>;
  loadFilesRef: React.MutableRefObject<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>;
  loadStorageQuotaRef: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function useDriveCredentialHydration({
  authenticatedUser,
  apiToken,
  aggregatorService,
  driveCredentialCacheRef,
  upsertDriveAccount,
  resolveIdentifiersForEmail,
  getPnIdentifier,
  disconnectTimestampRef,
  disconnectBlockDurationMs,
  authenticatedUserRef,
  pnIdentifierRef,
  loadFilesRef,
  loadStorageQuotaRef,
}: UseDriveCredentialHydrationParams) {
  const hydrationSuccessRef = React.useRef<string | null>(null);
  const hydrationInProgressRef = React.useRef(false);

  const hydrateStorageCredentialsFromAPI = React.useCallback(
    async (forceRefresh?: boolean) => {
      if (hydrationInProgressRef.current) return;

      const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
      if (timeSinceDisconnect < disconnectBlockDurationMs) {
        console.log(
          `⏭️ [StorageCredentials] Hydration BLOCKED - ${timeSinceDisconnect}ms since last disconnect`
        );
        return;
      }

      hydrationInProgressRef.current = true;

      if (hydrationSuccessRef.current && !forceRefresh) {
        hydrationInProgressRef.current = false;
        return;
      }

      let pnId = pnIdentifierRef.current;
      if (!pnId || !pnId.startsWith('pn-')) {
        pnId = await getPnIdentifier();
        if (!pnId) {
          console.warn(
            '⚠️ [StorageCredentials] Cannot generate pn identifier for hydration - missing credentials'
          );
          hydrationInProgressRef.current = false;
          return;
        }
      }

      try {
        const { awaitMigrateFlushForIdentity } = await import(
          '../../../services/deviceCloudCredentials'
        );
        await awaitMigrateFlushForIdentity(pnId);
      } catch {
        /* best-effort */
      }

      let hydrated = false;

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
              const expiresAt =
                typeof account.expires_at === 'number' && Number.isFinite(account.expires_at)
                  ? account.expires_at
                  : typeof account.expires_in === 'number' && account.expires_in > 0
                    ? Date.now() + account.expires_in * 1000
                    : undefined;
              const backend = await upsertDriveAccount({
                backendId: identifiers.backendId,
                keyPrefix: identifiers.keyPrefix,
                token,
                refreshToken: account.refreshToken || account.refresh_token,
                email,
                connectedAt: account.connectedAt,
                updatedAt: account.updatedAt,
                expiresAt
              });
              if (backend && typeof (backend as GoogleDriveBackend).ensureAccessToken === 'function') {
                await (backend as GoogleDriveBackend).ensureAccessToken();
              }
              hydrated = true;
            } catch {
              /* try next */
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ [StorageCredentials] Sealed/session hydrate failed:', e);
      }

      // Layout accounts are loaded by registerPortableCloudBackends / MultiCloud —
      // skip a redundant GET here (hydrate was a major /storage/accounts storm source).

      if (hydrated) {
        hydrationSuccessRef.current = pnId;
        // Do not await loadFiles — a hung Drive scan must not pin hydrationInProgress forever
        // (that also deadlocks 401 recovery which re-enters hydrate).
        // Wait for a usable Google token first so owner-index / Drive calls are not raced at unlock.
        const loadFilesFn = loadFilesRef.current;
        if (loadFilesFn) {
          void (async () => {
            try {
              const { waitForLocalGoogleAccessToken } = await import(
                '../../../services/deviceApiService'
              );
              await waitForLocalGoogleAccessToken(pnId, 20000);
            } catch {
              /* best-effort */
            }
            try {
              await loadFilesFn();
            } catch {
              /* non-blocking */
            }
          })();
        }
        const loadQuotaFn = loadStorageQuotaRef.current;
        if (loadQuotaFn) {
          void loadQuotaFn().catch(() => undefined);
        }
      }

      hydrationInProgressRef.current = false;
    },
    [
      authenticatedUser?.id,
      disconnectTimestampRef,
      disconnectBlockDurationMs,
      getPnIdentifier,
      loadFilesRef,
      loadStorageQuotaRef,
      pnIdentifierRef,
      resolveIdentifiersForEmail,
      upsertDriveAccount
    ]
  );

  const hydrateStorageCredentialsFromAPIRef = React.useRef(hydrateStorageCredentialsFromAPI);
  hydrateStorageCredentialsFromAPIRef.current = hydrateStorageCredentialsFromAPI;

  React.useEffect(() => {
    if (!apiToken || !authenticatedUser?.id) return;
    // Do not force-refresh on every callback identity change — that re-upserts and storms.
    void hydrateStorageCredentialsFromAPIRef.current(false);
  }, [apiToken, authenticatedUser?.id]);

  // 401 recovery: rehydrate from sealed/session, never from API secrets.
  React.useEffect(() => {
    const attemptRecovery = async (backendId: string): Promise<boolean> => {
      try {
        await hydrateStorageCredentialsFromAPI(true);
        const hasAccount =
          driveCredentialCacheRef.current.has(backendId) &&
          driveCredentialCacheRef.current.get(backendId)?.accessToken;
        if (hasAccount) {
          const credential = driveCredentialCacheRef.current.get(backendId)!;
          const backend = aggregatorService?.getBackend(backendId) as {
            connect: (credentials: {
              token: string;
              refreshToken?: string;
              email?: string;
              sessionId?: string;
              expiresAt?: number;
            }) => Promise<void>;
          } | null;
          if (backend && credential.accessToken) {
            const sessionId =
              authenticatedUserRef.current?.id ||
              authenticatedUserRef.current?.publicKey ||
              undefined;
            await backend.connect({
              token: credential.accessToken,
              refreshToken: credential.refreshToken ?? undefined,
              email: credential.email ?? undefined,
              sessionId,
              expiresAt:
                typeof credential.expiresAt === 'number' && Number.isFinite(credential.expiresAt)
                  ? credential.expiresAt
                  : undefined
            });
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
  }, [
    hydrateStorageCredentialsFromAPI,
    aggregatorService,
    driveCredentialCacheRef,
    authenticatedUserRef
  ]);

  return {
    hydrateStorageCredentialsFromAPI
  };
}
