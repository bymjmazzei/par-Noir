/**
 * Listens for `google-drive-token-refreshed` and applies the new token to the
 * in-memory cache, the encrypted local credential store, the sealed device
 * credentials and the live backend instance.
 *
 * Device custody note: a token refresh is NOT a reconnect. This hook must never
 * PUT /storage/credentials or POST /storage/initialize — the API holds no Google
 * secrets, so doing that re-triggers multi-minute Drive setup and loops.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { persistDriveAccounts } from '../storageHelpers';
import type { DriveAccountState, StoredDriveCredential } from '../FileStorageAggregatorTypes';

export interface UseDriveTokenRefreshParams {
  aggregatorService: FileAggregatorService | null;
  authenticatedUser: any;
  driveAccounts: DriveAccountState[];
  setDriveAccounts: React.Dispatch<React.SetStateAction<DriveAccountState[]>>;
  userEmails: Map<string, string>;
  setUserEmails: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  driveCredentialCacheRef: React.MutableRefObject<Map<string, StoredDriveCredential>>;
  purgeDuplicateBackendsForEmail: (preferredBackendId: string, email: string | null | undefined) => void;
  disconnectedBackendIdsRef: React.MutableRefObject<Set<string>>;
  disconnectTimestampRef: React.MutableRefObject<number>;
  disconnectBlockDurationMs: number;
  pnIdentifierRef: React.MutableRefObject<string | null>;
  loadFilesRef: React.MutableRefObject<(() => Promise<void>) | null>;
  ownerIndexWarningLoggedRef: React.MutableRefObject<Set<string>>;
  ownerIndexRetryCountsRef: React.MutableRefObject<Map<string, number>>;
  rateLimitedBackendsRef: React.MutableRefObject<Set<string>>;
  hasKeyedDevices?: boolean;
  isKeyedSession?: boolean;
}

export function useDriveTokenRefresh({
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
  disconnectBlockDurationMs,
  pnIdentifierRef,
  loadFilesRef,
  ownerIndexWarningLoggedRef,
  ownerIndexRetryCountsRef,
  rateLimitedBackendsRef,
  hasKeyedDevices = false,
  isKeyedSession = false,
}: UseDriveTokenRefreshParams) {
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
        if (timeSinceDisconnect < disconnectBlockDurationMs) {
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

        // SECURITY: Prefer shared device-cloud session (not IntegrationCredentialManager as SoT).
        if (authenticatedUser?.id) {
          try {
            const sessionCreds = SecureCredentialManager.getCredentials(authenticatedUser.id);
            const pnId = pnIdentifierRef.current;
            if (sessionCreds && pnId && nextAccessToken) {
              const {
                persistCloudCredentials,
                getSessionCloudCredentials,
                resolveCloudPersistMode
              } = await import('@par-noir/device-cloud-credentials');
              const existing = getSessionCloudCredentials(pnId);
              const accounts = [...(existing?.googleDriveAccounts ?? [])];
              const idx = accounts.findIndex(
                (a) =>
                  (a as { backendId?: string; accountId?: string }).backendId === backendId ||
                  (a as { accountId?: string }).accountId === backendId
              );
              const nextAcct = {
                accountId: backendId,
                backendId,
                keyPrefix,
                accessToken: nextAccessToken,
                refreshToken: nextRefreshToken || undefined,
                email: resolvedEmail || undefined,
                connectedAt,
                updatedAt: nowIso
              };
              if (idx >= 0) accounts[idx] = nextAcct as (typeof accounts)[0];
              else accounts.push(nextAcct as (typeof accounts)[0]);

              const mode = isKeyedSession
                ? 'sealed'
                : resolveCloudPersistMode({ hasKeyedDevices });
              await persistCloudCredentials({
                identityId: pnId,
                credentials: {
                  ...(existing || {}),
                  socialCloudProvider: 'google_drive',
                  socialCloudAccountId:
                    existing?.socialCloudAccountId || backendId,
                  googleDriveAccounts: accounts
                },
                session: {
                  sessionId: authenticatedUser.id,
                  pnName: sessionCreds.pnName,
                  passcode: sessionCreds.passcode
                },
                mode
              });
            }
          } catch (deviceSealErr) {
            console.warn('[FileStorageAggregator] Device cloud persist skipped:', deviceSealErr);
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
}
