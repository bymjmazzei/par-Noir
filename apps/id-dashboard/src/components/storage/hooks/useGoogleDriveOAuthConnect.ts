/**
 * Google Drive connect/disconnect lifecycle for FileStorageAggregator.
 *
 * Owns the OAuth popup + code exchange, account registration after a successful
 * connect, and the teardown path (backend disconnect, local state removal,
 * encrypted-metadata cleanup, API credential update). Also owns the
 * `google-drive-token-expired` listener, which drops the affected account so the
 * user is prompted to reconnect instead of looping on dead tokens.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { waitForOAuthPopupCode } from '@par-noir/oauth-ui';
import {
  authorizeUrlWithPkce,
  exchangeProviderAuthorizationCode,
  fetchGoogleUserInfo,
  GOOGLE_TOKEN_URL,
  takePkceVerifier
} from '@par-noir/device-cloud-credentials';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { API_ENDPOINT } from '../../../config/api';
import { getGoogleDriveClientId, getGoogleDriveClientSecret } from '../../../config/googleDriveClientId';
import { persistDriveAccounts } from '../storageHelpers';
import { AggregatedFile, ShareToken } from '../../../types/aggregator';
import {
  type DriveSetupProgress,
  type DriveAccountState,
} from '../FileStorageAggregatorTypes';
import type { UseDriveStorageCredentialsResult } from './useDriveStorageCredentials';

export interface UseGoogleDriveOAuthConnectParams {
  authenticatedUser: any;
  aggregatorService: FileAggregatorService | null;
  driveAccounts: DriveAccountState[];
  setDriveAccounts: React.Dispatch<React.SetStateAction<DriveAccountState[]>>;
  userEmails: Map<string, string>;
  setUserEmails: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setConnectedBackends: React.Dispatch<React.SetStateAction<Set<string>>>;
  setFiles: React.Dispatch<React.SetStateAction<AggregatedFile[]>>;
  setFilePreviewUrls: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  activeBackendId: string | null;
  setActiveBackendId: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  /** Drive layout init surface from useDriveLayoutInit. */
  setDriveSetupProgress: React.Dispatch<React.SetStateAction<DriveSetupProgress | null>>;
  clearDriveSetupProgress: () => void;
  checkDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => boolean;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  getResolvedAuthCredentials: () => { pnName: string; publicKey: string; passcode?: string } | null;
  getPasscodeFromSecureStorage: (sessionId: string | null | undefined) => string | null;
  getStorageIdentityCandidates: () => string[];
  /** Credential surface from useDriveStorageCredentials. */
  driveCredentialCacheRef: UseDriveStorageCredentialsResult['driveCredentialCacheRef'];
  cleanupDuplicateCacheEntries: UseDriveStorageCredentialsResult['cleanupDuplicateCacheEntries'];
  resolveIdentifiersForEmail: UseDriveStorageCredentialsResult['resolveIdentifiersForEmail'];
  buildStorageCredentialPayload: UseDriveStorageCredentialsResult['buildStorageCredentialPayload'];
  persistStorageCredentialsToAPI: UseDriveStorageCredentialsResult['persistStorageCredentialsToAPI'];
  upsertDriveAccount: UseDriveStorageCredentialsResult['upsertDriveAccount'];
  disconnectTimestampRef: UseDriveStorageCredentialsResult['disconnectTimestampRef'];
  disconnectedBackendIdsRef: UseDriveStorageCredentialsResult['disconnectedBackendIdsRef'];
  DISCONNECT_BLOCK_DURATION_MS: number;
  /** Shared refs owned by FileStorageAggregator. */
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
  loadFiles: (opts?: { verifyWithDrive?: boolean }) => Promise<void>;
  loadStorageQuota: () => Promise<void>;
  /** Case A/B persist mode (same as CloudReconnectHost). */
  hasKeyedDevices?: boolean;
  isKeyedSession?: boolean;
}

export function useGoogleDriveOAuthConnect({
  authenticatedUser,
  aggregatorService,
  driveAccounts,
  setDriveAccounts,
  userEmails,
  setUserEmails,
  setConnectedBackends,
  setFiles,
  setFilePreviewUrls,
  activeBackendId,
  setActiveBackendId,
  setError,
  setDriveSetupProgress,
  clearDriveSetupProgress,
  checkDeviceCapability,
  resolveOwnerApiToken,
  getResolvedAuthCredentials,
  getPasscodeFromSecureStorage,
  getStorageIdentityCandidates,
  driveCredentialCacheRef,
  resolveIdentifiersForEmail,
  buildStorageCredentialPayload,
  persistStorageCredentialsToAPI,
  upsertDriveAccount,
  disconnectTimestampRef,
  disconnectedBackendIdsRef,
  DISCONNECT_BLOCK_DURATION_MS,
  shareTokenCache,
  loadFiles,
  loadStorageQuota,
  hasKeyedDevices = false,
  isKeyedSession = false,
}: UseGoogleDriveOAuthConnectParams) {
  const removeDriveAccount = React.useCallback((backendId: string) => {
    let nextActiveId: string | null = null;

    driveCredentialCacheRef.current.delete(backendId);

    setDriveAccounts((prev) => {
      const updated = prev.filter((account) => account.backendId !== backendId);
      persistDriveAccounts(updated);
      nextActiveId = updated.length > 0 ? updated[0].backendId : null;
      return updated;
    });

    setConnectedBackends((prev) => {
      const next = new Set(prev);
      next.delete(backendId);
      return next;
    });

    setUserEmails((prev) => {
      if (!prev.has(backendId)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(backendId);
      return next;
    });

    setFiles((prev) => prev.filter((file) => file.backend !== backendId));

    setFilePreviewUrls((prev) => {
      const next = new Map(prev);
      Array.from(next.keys()).forEach((key) => {
        if (key.startsWith(`${backendId}:`)) {
          next.delete(key);
        }
      });
      return next;
    });

    shareTokenCache.current.forEach((_value, key) => {
      if (key.startsWith(`${backendId}|`)) {
        shareTokenCache.current.delete(key);
      }
    });

    if (activeBackendId === backendId) {
      setActiveBackendId(nextActiveId);
    }
  }, [activeBackendId]);

  React.useEffect(() => {
    const handleTokenExpired = (event: Event) => {
      const detailBackendId = (event as CustomEvent)?.detail?.backendId as string | undefined;
      const targetBackendId = detailBackendId || activeBackendId;

      if (!targetBackendId) {
        return;
      }

      console.warn('Google Drive token expired - disconnecting', { backendId: targetBackendId });
      removeDriveAccount(targetBackendId);
      setError('Google Drive authentication expired. Please reconnect.');
    };

    window.addEventListener('google-drive-token-expired', handleTokenExpired);

    return () => {
      window.removeEventListener('google-drive-token-expired', handleTokenExpired);
    };
  }, [activeBackendId, removeDriveAccount]);

  // Exchange the authorization code with Google. The API never sees the code.
  const exchangeCodeForTokens = async (
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    email?: string;
    name?: string;
  }> => {
    const tokens = await exchangeProviderAuthorizationCode({
      tokenUrl: GOOGLE_TOKEN_URL,
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: takePkceVerifier()
    });
    if (!tokens) {
      throw new Error('Failed to exchange authorization code');
    }
    const profile = await fetchGoogleUserInfo(tokens.accessToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || '',
      expiresIn: tokens.expiresIn,
      email: profile.email,
      name: profile.name
    };
  };

  const handleConnectGoogleDrive = async () => {
    try {
      if (!checkDeviceCapability('drive.upload')) {
        return;
      }
      setError(null);
      // Intentional reconnect must not be blocked by the post-disconnect guard
      // (same Google account reuses the same backendId within the block window).
      disconnectTimestampRef.current = 0;
      disconnectedBackendIdsRef.current.clear();
      setDriveSetupProgress({
        phase: 'starting',
        stepLabel: 'Connecting to Google Drive…',
        percent: 0,
      });

      const clientId = await getGoogleDriveClientId();
      const clientSecret = await getGoogleDriveClientSecret();
      if (!clientId || clientId.trim() === '' || !clientSecret.trim()) {
        setError('Google Drive OAuth not configured. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET on the API.');
        clearDriveSetupProgress();
        return;
      }
      // Google OAuth requires an exact redirect URI match with the configured callback.
      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

      // Use authorization code flow to get refresh tokens.
      // state=pn_popup tells oauth-callback to deliver via postMessage/BC (never navigate opener).
      const authUrl = await authorizeUrlWithPkce(
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${encodeURIComponent('pn_popup')}&` +
        `prompt=consent` +
        `&access_type=offline`
      );

      // Register listeners BEFORE window.open so BroadcastChannel/localStorage handoff
      // cannot race ahead of the waiter (common when Google nulls window.opener).
      const codePromise = waitForOAuthPopupCode();

      const popup = window.open(
        authUrl,
        'Google Drive OAuth',
        'width=500,height=600,left=100,top=100'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      const code = await codePromise;
      const tokenData = await exchangeCodeForTokens(code, redirectUri, clientId, clientSecret);

      const token = tokenData.accessToken;

      if (!aggregatorService) {
        throw new Error('File aggregator service is not available');
      }

      await aggregatorService.ensureInitialized();

      // Resolve user info from token exchange (API userinfo probe) — no client googleapis.
    const connectedEmail = tokenData.email || null;
    const identifiers = resolveIdentifiersForEmail(connectedEmail);

      const tokenExpiresAt = Date.now() + Math.max(60, tokenData.expiresIn || 3600) * 1000;
      const backend = await upsertDriveAccount({
        backendId: identifiers.backendId,
        keyPrefix: identifiers.keyPrefix,
        token,
        refreshToken: tokenData.refreshToken,
        email: connectedEmail,
        expiresAt: tokenExpiresAt,
      });

      if (!backend) {
        throw new Error('Unable to register Google Drive backend for this account');
      }

      setActiveBackendId(identifiers.backendId);

      // Shell unlock has no Key 1 / Key 2 in this tab. Finish Drive here.
      // A keyed session still seals and publishes the vault for other apps.
      {
        const sessionId = authenticatedUser?.id || null;
        const sessionCreds = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        if (!authenticatedUser?.publicKey) {
          throw new Error('Unlock the dashboard before connecting Google Drive.');
        }
        const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
        const pnIdentifier = deriveCanonicalPnIdentifier(authenticatedUser.publicKey);
        const accountId = identifiers.backendId;
        const cloudEnvelope = {
          socialCloudProvider: 'google_drive' as const,
          socialCloudAccountId: accountId,
          googleDriveAccounts: [
            {
              accountId,
              backendId: identifiers.backendId,
              keyPrefix: identifiers.keyPrefix,
              accessToken: token,
              refreshToken: tokenData.refreshToken,
              email: connectedEmail || undefined,
              connectedAt: new Date().toISOString(),
              expires_at: tokenExpiresAt,
            }
          ]
        };
        if (!sessionCreds || !sessionId) {
          const authTok = resolveOwnerApiToken(pnIdentifier);
          if (!authTok) {
            throw new Error(
              'Drive connected locally, but no owner API session — unlock the dashboard, then reconnect Drive.'
            );
          }
          setDriveSetupProgress({
            phase: 'starting',
            stepLabel: 'Setting up your storage',
            percent: 0,
          });
          const { connectDriveInThisSession } = await import('../../../services/sessionDriveConnect');
          await connectDriveInThisSession({
            identityId: pnIdentifier,
            authToken: authTok,
            credentials: cloudEnvelope,
          });
          const { publishCloudDriveReady } = await import('@par-noir/device-cloud-credentials');
          await publishCloudDriveReady({
            authToken: authTok,
            pnIdentifier,
            apiEndpoint: API_ENDPOINT,
          });
        } else {
        const {
          persistCloudCredentials,
          resolveCloudPersistMode
        } = await import('@par-noir/device-cloud-credentials');
        const mode = isKeyedSession
          ? 'sealed'
          : resolveCloudPersistMode({ hasKeyedDevices });
        await persistCloudCredentials({
          identityId: pnIdentifier,
          credentials: cloudEnvelope,
          session: {
            sessionId: 'pn-cloud-creds-v1',
            pnName: sessionCreds.pnName,
            passcode: sessionCreds.passcode
          },
          mode
        });
        const { publishCloudVaultForIdentity } = await import(
          '../../../services/deviceCloudCredentials'
        );
        const authTok = resolveOwnerApiToken(pnIdentifier);
        if (!authTok) {
          throw new Error(
            'Drive connected locally, but no owner API session — cannot publish cloud vault for other apps. Unlock the dashboard session, then reconnect Drive.'
          );
        }
        const vault = await publishCloudVaultForIdentity({
          identityId: pnIdentifier,
          authToken: authTok,
          pnName: sessionCreds.pnName,
          passcode: sessionCreds.passcode,
          credentials: cloudEnvelope,
          publicKey: authenticatedUser.publicKey
        });
        if (!vault.ok) {
          const idTag = await crypto.subtle
            .digest('SHA-256', new TextEncoder().encode(pnIdentifier))
            .then((buf) =>
              Array.from(new Uint8Array(buf))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 12)
            );
          console.warn(
            `[Google Drive] Cloud vault publish failed for identity hash=${idTag}:`,
            vault.error || 'unknown'
          );
          throw new Error(
            vault.error ||
              'Cloud vault publish failed — other apps cannot reuse this Drive connection until reconnect succeeds.'
          );
        }
        }
      }

      // Layout-only API persistence (no live Google tokens in SecureMetadata).
      // Force: disconnect may have PUT within the debounce window; connect must still run initialize.
      try {
        const payload = buildStorageCredentialPayload();
        if (payload && payload.googleDriveAccounts && payload.googleDriveAccounts.length > 0) {
          await persistStorageCredentialsToAPI(payload, null, { force: true });
        }
      } catch (persistError) {
        console.warn('⚠️ [handleConnectGoogleDrive] Failed to persist layout to API (non-critical):', persistError);
      }

      // Signal Drive-ready only after access token is in session (OAuth just minted it).
      try {
        const { publishCloudDriveReady } = await import('@par-noir/device-cloud-credentials');
        const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
        const sessionId = authenticatedUser?.id || null;
        const sessionCreds = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        if (sessionCreds && sessionId && authenticatedUser?.publicKey) {
          const readyPn = deriveCanonicalPnIdentifier(authenticatedUser.publicKey);
          const authTok = resolveOwnerApiToken(readyPn);
          if (authTok) {
            await publishCloudDriveReady({
              authToken: authTok,
              pnIdentifier: readyPn,
              apiEndpoint: API_ENDPOINT
            });
          }
        }
      } catch {
        /* non-DOM */
      }

      clearDriveSetupProgress();

      // loadFiles also triggered from persistStorageCredentialsToAPI after init
      void loadFiles();
      void loadStorageQuota();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Google Drive');
      clearDriveSetupProgress();
      console.error('Error connecting to Google Drive:', err);
    }
  };

  const handleDisconnect = async (backendId: string) => {
    if (!aggregatorService) {
      const message = 'Storage is not ready. Unlock and try again.';
      setError(message);
      throw new Error(message);
    }

    const accountToRemove = driveAccounts.find((acc) => acc.backendId === backendId);
    const accountEmail = accountToRemove
      ? userEmails.get(accountToRemove.backendId) || null
      : null;
    const identityCandidates = getStorageIdentityCandidates();
    const pnId =
      identityCandidates.find((id) => id?.startsWith('pn-')) ?? null;
    const disconnectToken = (pnId ? resolveOwnerApiToken(pnId) : null) || resolveOwnerApiToken();
    const sessionId =
      authenticatedUser?.id || (authenticatedUser as { publicKey?: string })?.publicKey || null;
    const sessionCreds = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    const { readShellMlKem } = await import('../../../services/shellMlKem');
    const { canSealCloudDisconnect } = await import('../../../services/disconnectCloud');
    const mlKemSecretKey =
      readShellMlKem(pnId) ||
      readShellMlKem(sessionId) ||
      readShellMlKem(authenticatedUser?.publicKey);
    if (
      !canSealCloudDisconnect({
        pnIdentifier: pnId,
        authToken: disconnectToken,
        pnName: sessionCreds?.pnName,
        passcode: sessionCreds?.passcode,
        mlKemSecretKey,
      })
    ) {
      const message = 'Unlock again to disconnect Google Drive.';
      setError(message);
      throw new Error(message);
    }

    disconnectTimestampRef.current = Date.now();
    disconnectedBackendIdsRef.current.add(backendId);

    try {
      const { commitDashboardGoogleDriveDisconnect } = await import(
        '../../../services/disconnectCloud'
      );
      await commitDashboardGoogleDriveDisconnect({
        pnIdentifier: pnId!,
        authToken: disconnectToken!,
        pnName: sessionCreds?.pnName,
        passcode: sessionCreds?.passcode,
        publicKey: authenticatedUser?.publicKey ?? sessionId,
        mlKemSecretKey,
        backendId,
      });
    } catch (err) {
      disconnectedBackendIdsRef.current.delete(backendId);
      const message = err instanceof Error ? err.message : 'Disconnect failed';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }

    try {
      const backend = aggregatorService.getBackend(backendId);
      if (backend) {
        await backend.disconnect();
      }
      removeDriveAccount(backendId);

      // Remove account from encrypted metadata storage
      // This prevents it from being restored after lock/unlock
      if (authenticatedUser?.id && accountEmail) {
        try {
          const { SecureMetadataStorage } = await import('../../../utils/secureMetadataStorage');
          const { SecureMetadataCrypto } = await import('../../../utils/secureMetadata');

          // SECURITY: Get pnName from SecureCredentialManager (secrets), not from state
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          const effectivePnName = credentials?.pnName || null;

          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const passcode = getPasscodeFromSecureStorage(sessionId);

          if (effectivePnName && passcode) {
            // Sync from cloud first to get latest metadata
            try {
              await SecureMetadataStorage.syncMetadataFromCloud(authenticatedUser.id);
            } catch (cloudSyncError) {
              console.warn('⚠️ [handleDisconnect] Unable to sync metadata from cloud (non-blocking):', cloudSyncError);
            }

            let metadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);

            if (!metadata) {
              try {
                metadata = await SecureMetadataStorage.getMetadataFromCloud(authenticatedUser.id);
              } catch (fallbackError) {
                console.warn('⚠️ [handleDisconnect] Fallback cloud fetch failed (non-blocking):', fallbackError);
              }
            }

            if (metadata) {
              // Decrypt metadata
              const decrypted = await SecureMetadataCrypto.decryptMetadata(metadata, effectivePnName, passcode);

              // Remove account from storageCredentials
              if (decrypted.storageCredentials) {
                const updatedCredentials = { ...decrypted.storageCredentials };

                // Handle googleDriveAccounts array
                if (Array.isArray(updatedCredentials.googleDriveAccounts)) {
                  const beforeCount = updatedCredentials.googleDriveAccounts.length;
                  updatedCredentials.googleDriveAccounts = updatedCredentials.googleDriveAccounts.filter(
                    (creds: any) => creds?.email?.toLowerCase() !== accountEmail.toLowerCase()
                  );
                  const afterCount = updatedCredentials.googleDriveAccounts.length;
                  if (beforeCount > afterCount) {
                    console.log(`✅ [handleDisconnect] Removed account from googleDriveAccounts array (${beforeCount} -> ${afterCount})`);
                  }
                }

                // Handle single googleDrive object (legacy format)
                if (updatedCredentials.googleDrive &&
                    typeof updatedCredentials.googleDrive === 'object' &&
                    !Array.isArray(updatedCredentials.googleDrive) &&
                    updatedCredentials.googleDrive.email?.toLowerCase() === accountEmail.toLowerCase()) {
                  // Remove the single googleDrive object
                  delete updatedCredentials.googleDrive;
                  console.log(`✅ [handleDisconnect] Removed account from googleDrive object`);
                }

                // Update encrypted metadata with removed account
                await SecureMetadataStorage.updateMetadataField(
                  authenticatedUser.id,
                  effectivePnName,
                  passcode,
                  'storageCredentials',
                  updatedCredentials
                );

                console.log(`✅ [handleDisconnect] Removed account [REDACTED] from encrypted metadata`);
              }
            }
          } else {
            console.warn('⚠️ [handleDisconnect] Missing pnName or passcode - cannot update encrypted metadata');
            console.warn('⚠️ [handleDisconnect] Will rely on API storage credentials update instead');
          }
        } catch (metadataError) {
          console.error('❌ [handleDisconnect] Failed to remove account from encrypted metadata:', metadataError);
        }
      }
    } catch (err) {
      console.error('❌ [handleDisconnect] Error clearing Drive after disconnect:', err);
    }
  };

  return {
    removeDriveAccount,
    exchangeCodeForTokens,
    handleConnectGoogleDrive,
    handleDisconnect,
  };
}

export type UseGoogleDriveOAuthConnectResult = ReturnType<typeof useGoogleDriveOAuthConnect>;
