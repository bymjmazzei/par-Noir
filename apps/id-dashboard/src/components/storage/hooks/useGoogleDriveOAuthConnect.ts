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
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { API_ENDPOINT } from '../../../config/api';
import { ownerFetch } from '../../../services/ownerApiService';
import { getGoogleDriveClientId } from '../../../config/googleDriveClientId';
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
  loadFiles: () => Promise<void>;
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
  cleanupDuplicateCacheEntries,
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

  const fetchDriveUserInfo = React.useCallback(async (accessToken: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.user) {
          return {
            email: data.user.emailAddress as string | undefined,
            name: data.user.displayName as string | undefined,
          };
        }
      }
    } catch (driveError) {
      console.warn('⚠️ [fetchDriveUserInfo] drive/v3/about failed, falling back', driveError);
    }

    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          email: data?.email as string | undefined,
          name: data?.name as string | undefined,
        };
      }
    } catch (oauthError) {
      console.warn('⚠️ [fetchDriveUserInfo] oauth2 userinfo failed', oauthError);
    }

    return { email: undefined, name: undefined };
  }, []);

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

  // Helper function to exchange authorization code for tokens
  // Uses Google OAuth endpoint directly (client-side exchange) or API fallback
  const exchangeCodeForTokens = async (code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
    const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || (await getGoogleDriveClientId());
    if (!clientId || clientId.trim() === '') {
      throw new Error('Google Drive client ID not configured. Set VITE_GOOGLE_DRIVE_CLIENT_ID or configure GOOGLE_DRIVE_CLIENT_ID on the API.');
    }
    const clientSecret = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_SECRET;

    // If we have client secret, use it (should be in backend, but allowing frontend for now)
    // Otherwise, try the API endpoint as fallback
    if (clientSecret) {
      // Direct exchange with Google (not recommended for production, but works)
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google token exchange failed: ${errorText}`);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600,
      };
    } else {
      // Fallback to API endpoint with retry for transient network errors (e.g. ERR_SOCKET_NOT_CONNECTED)
      const maxAttempts = 3;
      const delays = [0, 1000, 2000];
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        try {
          const response = await fetch(`${API_ENDPOINT}/api/auth/google-oauth/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code, redirectUri }),
          });

          if (!response.ok) {
            let errorMessage = 'Failed to exchange authorization code';
            try {
              const error = await response.json();
              errorMessage = error.message || error.error || JSON.stringify(error);
              console.error('[Google OAuth] API Error:', error);
            } catch (e) {
              const errorText = await response.text().catch(() => 'Unknown error');
              errorMessage = errorText || 'Failed to exchange authorization code';
              console.error('[Google OAuth] API Error (text):', errorText);
            }
            throw new Error(errorMessage);
          }

          const data = await response.json();
          return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in || 3600,
          };
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          const isNetwork = lastError?.message === 'Failed to fetch' || lastError?.name === 'TypeError';
          if (isNetwork && attempt < maxAttempts - 1) {
            console.warn(`[Google OAuth] Token exchange attempt ${attempt + 1} failed (network), retrying...`, lastError?.message);
          } else {
            throw lastError;
          }
        }
      }
      throw lastError || new Error('Failed to exchange authorization code');
    }
  };

  const handleConnectGoogleDrive = async () => {
    try {
      if (!checkDeviceCapability('drive.upload')) {
        return;
      }
      setError(null);
      setDriveSetupProgress({
        phase: 'starting',
        stepLabel: 'Connecting to Google Drive…',
        percent: 0,
      });

      const clientId = await getGoogleDriveClientId();
      if (!clientId || clientId.trim() === '') {
        setError('Google Drive OAuth not configured. Set VITE_GOOGLE_DRIVE_CLIENT_ID or configure GOOGLE_DRIVE_CLIENT_ID on the API.');
        clearDriveSetupProgress();
        return;
      }
      // Google OAuth requires an exact redirect URI match with the configured callback.
      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

      // Use authorization code flow to get refresh tokens
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `prompt=consent` +
        `&access_type=offline`; // Required for refresh token

      const popup = window.open(
        authUrl,
        'Google Drive OAuth',
        'width=500,height=600,left=100,top=100'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Wait for OAuth callback with authorization code
      const tokenData = await new Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>((resolve, reject) => {
        // Don't check popup.closed - COOP blocks it. Just wait for message
        // const checkClosed = setInterval(() => {
        //   try {
        //     if (popup.closed) {
        //       clearInterval(checkClosed);
        //       window.removeEventListener('message', messageHandler);
        //       reject(new Error('OAuth popup was closed'));
        //     }
        //   } catch (e) {
        //     // COOP policy - ignore
        //   }
        // }, 1000);

        // Set timeout instead of checking popup.closed
        const timeout = setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          reject(new Error('OAuth timeout - please try again'));
        }, 300000); // 5 minute timeout

        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          if (event.data.type === 'GOOGLE_OAUTH_CODE' || event.data.type === 'oauth_callback') {
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            // Avoid popup.close() from opener: COOP can block it and trigger console errors.
            // oauth-callback.html will try to close itself; user can close manually if it stays open.

            if (event.data.error) {
              reject(new Error(event.data.error));
            } else if (event.data.code) {
              // Exchange code for tokens via API
              exchangeCodeForTokens(event.data.code, redirectUri)
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error('No authorization code received'));
            }
          }
        };

        window.addEventListener('message', messageHandler);
      });

      const token = tokenData.accessToken;

      if (!aggregatorService) {
        throw new Error('File aggregator service is not available');
      }

      await aggregatorService.ensureInitialized();

      // Resolve user info so we can scope the backend to a specific account
    const oauthUserInfo = await fetchDriveUserInfo(token);
    const connectedEmail = oauthUserInfo?.email || null;
    const identifiers = resolveIdentifiersForEmail(connectedEmail);

      const backend = await upsertDriveAccount({
        backendId: identifiers.backendId,
        keyPrefix: identifiers.keyPrefix,
        token,
        refreshToken: tokenData.refreshToken,
        email: connectedEmail
      });

      if (!backend) {
        throw new Error('Unable to register Google Drive backend for this account');
      }

      setActiveBackendId(identifiers.backendId);

      // Shared device-cloud session (same path as browser reconnect / CloudReconnectHost).
      try {
        const {
          persistCloudCredentials,
          resolveCloudPersistMode
        } = await import('@par-noir/device-cloud-credentials');
        const { PN_CLOUD_CREDENTIALS_READY_EVENT } = await import('@par-noir/oauth-ui');
        const { derivePnIdentifierForToken } = await import('../../../services/parNoirOAuthInline');
        const sessionId = authenticatedUser?.id || null;
        const sessionCreds = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        if (sessionCreds && sessionId && authenticatedUser?.publicKey) {
          const pnIdentifier = await derivePnIdentifierForToken(
            sessionCreds.pnName,
            sessionCreds.passcode,
            authenticatedUser.publicKey
          );
          const accountId = identifiers.backendId;
          const mode = isKeyedSession
            ? 'sealed'
            : resolveCloudPersistMode({ hasKeyedDevices });
          await persistCloudCredentials({
            identityId: pnIdentifier,
            credentials: {
              socialCloudProvider: 'google_drive',
              socialCloudAccountId: accountId,
              googleDriveAccounts: [
                {
                  accountId,
                  backendId: identifiers.backendId,
                  keyPrefix: identifiers.keyPrefix,
                  accessToken: token,
                  refreshToken: tokenData.refreshToken,
                  email: connectedEmail || undefined,
                  connectedAt: new Date().toISOString()
                }
              ]
            },
            session: {
              sessionId,
              pnName: sessionCreds.pnName,
              passcode: sessionCreds.passcode
            },
            mode
          });
          try {
            window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
          } catch {
            /* non-DOM */
          }
        }
      } catch (sealErr) {
        console.warn('[Google Drive] Device cloud persist skipped:', sealErr);
      }

      // Layout-only API persistence (no live Google tokens in SecureMetadata).
      try {
        const payload = buildStorageCredentialPayload();
        if (payload && payload.googleDriveAccounts && payload.googleDriveAccounts.length > 0) {
          await persistStorageCredentialsToAPI(payload);
        }
      } catch (persistError) {
        console.warn('⚠️ [handleConnectGoogleDrive] Failed to persist layout to API (non-critical):', persistError);
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
    try {
      if (!aggregatorService) {
        console.warn('⚠️ [handleDisconnect] Aggregator service unavailable');
        return;
      }

      // Find the account to get its email for metadata removal
      const accountToRemove = driveAccounts.find(acc => acc.backendId === backendId);
      const accountEmail = accountToRemove
        ? userEmails.get(accountToRemove.backendId) || null
        : null;

      const backend = aggregatorService.getBackend(backendId);
      if (backend) {
        // Disconnect the backend (clears tokens, folder cache, encrypted credentials)
        await backend.disconnect();
        console.log(`✅ [handleDisconnect] Backend ${backendId} disconnected`);
      }

      // CRITICAL: Mark disconnect timestamp and backendId to prevent immediate re-connection
      disconnectTimestampRef.current = Date.now();
      disconnectedBackendIdsRef.current.add(backendId);

      // Remove account from state FIRST (before updating API/metadata)
      // This ensures buildStorageCredentialPayload() excludes the removed account
      removeDriveAccount(backendId);
      console.log(`✅ [handleDisconnect] Account ${(backendId || '').substring(0, 8)}... removed from dashboard state and blocked for ${DISCONNECT_BLOCK_DURATION_MS}ms`);

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
          // Continue with API update even if metadata update fails
        }
      } else {
        console.warn('⚠️ [handleDisconnect] Missing authenticatedUser.id or accountEmail - skipping metadata removal');
      }

      // CRITICAL: Update API storage credentials to remove the account
      // This prevents it from being restored via hydrateStorageCredentialsFromAPI
      // We need to explicitly send the current state (without the removed account) to the API
      try {
        console.log('🔄 [handleDisconnect] Updating API storage credentials to remove account...');

        // CRITICAL: Clean up cache BEFORE building payload to ensure duplicates are removed
        cleanupDuplicateCacheEntries();

        // Build payload from current state (after removal)
        const payload = buildStorageCredentialPayload();

        // Even if payload is empty (no accounts left), we need to persist it to clear the API
        // This ensures the disconnected account is removed from API storage
        // CRITICAL: Use ONLY pn identifier - getStorageIdentityCandidates now returns only pn identifier
        const identityCandidates = getStorageIdentityCandidates();
        const pnId = identityCandidates.length > 0 && identityCandidates[0]?.startsWith('pn-') ? identityCandidates[0] : null;

        if (pnId) {
          const disconnectToken = resolveOwnerApiToken();
          if (disconnectToken) {
          try {
            const response = await ownerFetch(
              disconnectToken,
              'PUT',
              `/api/storage/credentials/${encodeURIComponent(pnId)}`,
              {
                credentials: payload || { googleDriveAccounts: [] },
                cid: null,
              },
              { pnIdentifier: pnId }
            );

              if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.warn('⚠️ [handleDisconnect] Failed to update API storage credentials:', {
                  status: response.status,
                  error: errorText,
                });
              } else {
                const accountsCount = payload?.googleDriveAccounts?.length || 0;
                console.log(`✅ [handleDisconnect] API storage credentials updated (account removed). Current accounts: ${accountsCount}`);
              }
            } catch (apiError) {
              console.error('❌ [handleDisconnect] Failed to update API storage credentials:', apiError);
            }
          }
        } else {
          console.warn('⚠️ [handleDisconnect] No pn identifier available for API update');
        }
      } catch (apiError) {
        console.error('❌ [handleDisconnect] Failed to update API storage credentials:', apiError);
        // Non-critical - account is already removed from state
      }
    } catch (err) {
      console.error('❌ [handleDisconnect] Error disconnecting:', err);
      // Still try to remove from state even if backend.disconnect() fails
      removeDriveAccount(backendId);
      // Try to update API even on error
      try {
        const payload = buildStorageCredentialPayload();
        // CRITICAL: Use ONLY pn identifier - getStorageIdentityCandidates now returns only pn identifier
        const identityCandidates = getStorageIdentityCandidates();
        const pnId = identityCandidates.length > 0 && identityCandidates[0]?.startsWith('pn-') ? identityCandidates[0] : null;

        if (pnId) {
          const errToken = resolveOwnerApiToken();
          if (errToken) {
            await ownerFetch(errToken, 'PUT', `/api/storage/credentials/${encodeURIComponent(pnId)}`, {
              credentials: payload || { googleDriveAccounts: [] },
              cid: null,
            }, { pnIdentifier: pnId });
          }
        } else {
          console.warn('⚠️ [handleDisconnect] No pn identifier available for API update after error');
        }
      } catch (apiError) {
        console.error('❌ [handleDisconnect] Failed to update API after error:', apiError);
      }
    }
  };

  return {
    removeDriveAccount,
    fetchDriveUserInfo,
    exchangeCodeForTokens,
    handleConnectGoogleDrive,
    handleDisconnect,
  };
}

export type UseGoogleDriveOAuthConnectResult = ReturnType<typeof useGoogleDriveOAuthConnect>;
