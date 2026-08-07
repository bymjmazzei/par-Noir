/**
 * Aggregated file/quota loading for FileStorageAggregator.
 *
 * Owns loadFiles, loadStorageQuota and the token-retry scheduling that backs them.
 * Per-backend owner-index resolution lives in loadFiles/fetchOwnerIndex, and the
 * Drive-scan reconciliation lives in loadFiles/mergeDriveScanWithIndex.
 *
 * Device custody note: an owner-index 409 means the server-side Drive index is
 * incomplete (expected when OAuth secrets live on the device, not the API).
 * fetchOwnerIndex leaves ownerIndex null (one API attempt only); mergeDriveScanWithIndex
 * fills via Drive listFiles — never a second owner-index GET, never POST
 * /storage/initialize (which 400s without server-held tokens and loops setup UI).
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../../types/aggregator';
import {
  type DriveSetupProgress,
  type DriveAccountState,
  type FileStorageAggregatorProps,
} from '../FileStorageAggregatorTypes';
import {
  isDriveLayoutBusy,
  LOAD_FILES_TIMEOUT_MS,
  waitForDriveLayoutIdle,
} from './driveLayoutBusy';
import { fetchOwnerIndex } from './loadFiles/fetchOwnerIndex';
import { mergeDriveScanWithIndex } from './loadFiles/mergeDriveScanWithIndex';
import { useTokenRetry } from './loadFiles/useTokenRetry';

export interface UseLoadAggregatedFilesParams {
  aggregatorService: FileAggregatorService | null;
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  driveAccounts: DriveAccountState[];
  activeBackendId: string | null;
  setActiveBackendId: React.Dispatch<React.SetStateAction<string | null>>;
  setFiles: React.Dispatch<React.SetStateAction<AggregatedFile[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  setStorageQuotas: React.Dispatch<React.SetStateAction<Map<string, any>>>;
  setUserEmails: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  loadFileMetadata: (filesToLoad: AggregatedFile[]) => Promise<void>;
  registerPortableCloudBackends: () => Promise<void>;
  driveReadBlocked: boolean;
  deviceGate: FileStorageAggregatorProps['deviceGate'];
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  getPasscodeFromSecureStorage: (sessionId: string | null | undefined) => string | null;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  /** Shared refs owned by FileStorageAggregator / useDriveLayoutInit. */
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
  pnIdentifierRef: React.MutableRefObject<string | null>;
  driveLayoutInitInFlightRef: React.MutableRefObject<Set<string>>;
  driveSetupProgressRef: React.MutableRefObject<DriveSetupProgress | null>;
  loadFilesRef: React.MutableRefObject<(() => Promise<void>) | null>;
  loadStorageQuotaRef: React.MutableRefObject<(() => Promise<void>) | null>;
  ownerIndexWarningLoggedRef: React.MutableRefObject<Set<string>>;
  ownerIndexRetryCountsRef: React.MutableRefObject<Map<string, number>>;
  rateLimitedBackendsRef: React.MutableRefObject<Set<string>>;
  pendingRetryTimeoutRef: React.MutableRefObject<number | null>;
}

export function useLoadAggregatedFiles({
  aggregatorService,
  authenticatedUser,
  resolvedAuth,
  driveAccounts,
  activeBackendId,
  setActiveBackendId,
  setFiles,
  setError,
  setIsLoading,
  setFileMetadataMap,
  setStorageQuotas,
  setUserEmails,
  loadFileMetadata,
  registerPortableCloudBackends,
  driveReadBlocked,
  deviceGate,
  resolveOwnerApiToken,
  getPasscodeFromSecureStorage,
  makeShareTokenCacheKey,
  shareTokenCache,
  pnIdentifierRef,
  driveLayoutInitInFlightRef,
  driveSetupProgressRef,
  loadFilesRef,
  loadStorageQuotaRef,
  ownerIndexWarningLoggedRef,
  ownerIndexRetryCountsRef,
  rateLimitedBackendsRef,
  pendingRetryTimeoutRef,
}: UseLoadAggregatedFilesParams) {
  const isLoadingFilesRef = React.useRef(false);

  const scheduleTokenRetry = useTokenRetry({
    setError,
    loadFilesRef,
    ownerIndexWarningLoggedRef,
    ownerIndexRetryCountsRef,
    rateLimitedBackendsRef,
    pendingRetryTimeoutRef,
  });

  const loadFiles = React.useCallback(async () => {
    if (isLoadingFilesRef.current) {
      console.log('⏳ [loadFiles] Load already in progress, skipping');
      return;
    }
    if (
      isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
    ) {
      console.log('⏳ [loadFiles] Drive layout setup in progress, waiting before file load');
      const waitResult = await waitForDriveLayoutIdle(() =>
        isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
      );
      if (waitResult === 'timeout') {
        console.warn('⚠️ [loadFiles] Layout wait timed out; loading files anyway');
      }
      if (isLoadingFilesRef.current) {
        console.log('⏳ [loadFiles] Load already in progress after layout wait, skipping');
        return;
      }
    }
    if (driveReadBlocked) {
      setFiles([]);
      setError(deviceGate?.blockedMessage ?? null);
      setIsLoading(false);
      return;
    }
    isLoadingFilesRef.current = true;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      console.warn('⚠️ [loadFiles] Timed out; clearing loading spinner');
      setIsLoading(false);
      isLoadingFilesRef.current = false;
    }, LOAD_FILES_TIMEOUT_MS);
    try {
      setIsLoading(true);
      setError(null);
      
      // Ensure backends are initialized (gracefully fail if Google Drive not connected)
      // Don't block unlock if Google Drive initialization fails
      if (!aggregatorService) {
        console.warn('⚠️ [loadFiles] Aggregator service not available');
        setIsLoading(false);
        setFiles([]);
        return;
      }

      await registerPortableCloudBackends();
      
      try {
        await aggregatorService.ensureInitialized();
      } catch (initError) {
        // Don't log as error - just return empty list
        console.warn('⚠️ [loadFiles] Backend initialization skipped (Google Drive may not be connected)');
        setIsLoading(false);
        setFiles([]); // Set empty files, don't show error
        return;
      }

      const backendEntries = typeof aggregatorService.listBackendEntries === 'function'
        ? aggregatorService.listBackendEntries()
        : [];
      const connectedEntries = backendEntries.filter(({ backend }) => backend.isConnected());

      if (connectedEntries.length === 0) {
        console.log('ℹ️ [loadFiles] No connected storage backends yet; skipping owner index load until connection completes', {
          backendEntries: backendEntries.map(({ id }) => id),
          connectedBackends: connectedEntries.map(({ id }) => id),
        });
        setFiles([]);
        setIsLoading(false);
        return;
      }

      if (timedOut) return;

      if (!activeBackendId) {
        setActiveBackendId((prev) => prev || connectedEntries[0]?.id || null);
      }
      
      // Try to generate pN identifier - if it fails, backend will search for folders directly
      let currentPnIdentifier: string | undefined = undefined;
      
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        
        // Get credentials (prioritize resolvedAuth, fallback to authenticatedUser + sessionStorage)
        let pnName: string | null = null;
        let publicKey: string | null = null;
        // SECURITY: Get credentials from SecureCredentialManager (secrets)
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        let passcode: string | null = credentials?.passcode || null;
        
        // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth or authenticatedUser (public)
        if (credentials?.pnName && resolvedAuth?.publicKey) {
          pnName = credentials.pnName;
          publicKey = resolvedAuth.publicKey;
          passcode = credentials.passcode;
        } else if (authenticatedUser && credentials) {
          pnName = credentials.pnName;
          publicKey = authenticatedUser.publicKey || 
            (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
          passcode = credentials.passcode;
          try {
            // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
            const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
            passcode = getPasscodeFromSecureStorage(sessionId);
          } catch (e) {
            // Ignore SecureCredentialManager errors
          }
        }
        
        // If still missing, try loading from SecureStorage
        if ((!pnName || !publicKey || !passcode)) {
          try {
            const { SecureStorage } = await import('../../../utils/storage');
            const storage = new SecureStorage();
            await storage.init();
            const session = await storage.getCurrentSession();
            if (session) {
              if (!pnName) pnName = (session as any).pnName || (session as any).username || (session as any).name || null;
              if (!publicKey) publicKey = (session as any).publicKey || 
                (session.id && session.id.startsWith('did:key:') ? session.id : session.id) || null;
              if (!passcode) {
                try {
                  // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
                  const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
                  passcode = getPasscodeFromSecureStorage(sessionId);
                } catch (e) {
                  // Ignore
                }
              }
            }
          } catch (e) {
            // Ignore
          }
        }
        
        // Generate identifier if we have all credentials
        if (pnName && publicKey && passcode) {
          currentPnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName,
            passcode,
            publicKey
          });
          console.log(`✅ [loadFiles] Generated pN identifier (VolumeIdGenerator): ${(currentPnIdentifier || '').substring(0, 8)}...`);
          console.log(`📁 [loadFiles] Expected folder name: "par Noir - ${(currentPnIdentifier || '').substring(0, 8)}..."`);
          
          // Also log the fallback identifier for comparison
          if (pnIdentifierRef.current) {
            // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
            const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
            console.log(`ℹ️ [loadFiles] Fallback identifier (did:publicKey): ${(fallbackId || '').substring(0, 8)}...`);
            if (fallbackId !== currentPnIdentifier) {
              console.warn(`⚠️ [loadFiles] Identifier mismatch! VolumeIdGenerator: ${(currentPnIdentifier || '').substring(0, 8)}..., Fallback: ${(fallbackId || '').substring(0, 8)}...`);
              console.warn(`⚠️ [loadFiles] Using VolumeIdGenerator identifier (${(currentPnIdentifier || '').substring(0, 8)}...) - this is the correct one`);
            }
          }
        } else {
          console.log(`⚠️ [loadFiles] Cannot generate pN identifier (missing credentials) - backend will search for folders directly`);
        }
      } catch (err) {
        console.warn('⚠️ [loadFiles] Failed to generate pN identifier:', err);
      }
      
      // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
      // If we don't have credentials, we cannot generate the identifier
      // This ensures consistency - same credentials always produce same identifier
      if (!currentPnIdentifier) {
        console.warn('⚠️ [loadFiles] Cannot generate standardized pN identifier - credentials required');
        console.warn('⚠️ [loadFiles] Files may not be found until credentials are available');
      }
      
      if (!currentPnIdentifier) {
        console.warn('⚠️ [loadFiles] Unable to determine pN identifier - owner index cannot be loaded until credentials are available');
      }

      const aggregatedAllFiles: AggregatedFile[] = [];
      const aggregatedMetadataMap = new Map<string, PublicMetadata>();
      const filesNeedingMetadata: AggregatedFile[] = [];
      const retryBackends = new Set<string>();

      for (const entry of connectedEntries) {
        const backendId = entry.id;
        const backend = entry.backend as GoogleDriveBackend;
        const accountForBackend =
          driveAccounts.find((account) => account.backendId === backendId) || null;
        const keyPrefix =
          accountForBackend?.keyPrefix ||
          (typeof backend.getStorageKeyPrefix === 'function' ? backend.getStorageKeyPrefix() : null);

        if (rateLimitedBackendsRef.current.has(backendId)) {
          console.debug('⏳ [loadFiles] Skipping backend during refresh cooldown', { backendId });
          continue;
        }

        if (!backend?.isConnected()) {
          console.debug('ℹ️ [loadFiles] Backend not connected yet; skipping for now', {
            backendId,
            keyPrefix,
          });
          continue;
        }

        let ensuredAccessToken: string | null = null;
        if (typeof (backend as any).ensureAccessToken === 'function') {
          try {
            ensuredAccessToken = await (backend as any).ensureAccessToken();
          } catch (ensureError) {
            console.warn('⚠️ [loadFiles] ensureAccessToken failed (non-blocking):', {
              backendId,
              error: ensureError,
            });
          }
        }

        const localTokenKey = keyPrefix
          ? `${keyPrefix}_token`
          : backendId
            ? `${backendId}_token`
            : 'google_drive_token';

        const backendProviderForToken =
          backendId.includes('::') ? backendId.split('::')[0] : backendId;
        const isPortableBackendForToken = backendProviderForToken !== 'google_drive';

        const accessToken =
          ensuredAccessToken ||
          (typeof backend.getAccessToken === 'function' ? backend.getAccessToken() : undefined) ||
          (backend as any).token ||
          (localTokenKey ? localStorage.getItem(localTokenKey) : null);
        if (!accessToken && !isPortableBackendForToken) {
          retryBackends.add(backendId);
          console.debug('⏳ [loadFiles] Waiting for refreshed token', { backendId });
        }

        const {
          ownerIndex,
          ownerIndexFromApi,
          skipBackend: ownerIndexSkipBackend,
        } = await fetchOwnerIndex({
          backendId,
          currentPnIdentifier,
          resolveOwnerApiToken,
        });
        if (ownerIndexSkipBackend) {
          continue;
        }

        const { filesForBackend, skipBackend: mergeSkipBackend } = await mergeDriveScanWithIndex({
          backendId,
          backend,
          currentPnIdentifier,
          ownerIndex,
          ownerIndexFromApi,
          aggregatedMetadataMap,
          filesNeedingMetadata,
          retryBackends,
          rateLimitedBackendsRef,
          ownerIndexRetryCountsRef,
          shareTokenCache,
          makeShareTokenCacheKey,
        });
        if (mergeSkipBackend) {
          continue;
        }

        if (filesForBackend.length === 0) {
          console.debug('ℹ️ [loadFiles] No files discovered for backend', { backendId });
          continue;
        }

        aggregatedAllFiles.push(...filesForBackend);
      }

      setFiles(aggregatedAllFiles);
      const normalizedMetadataMap = new Map<string, PublicMetadata>();
      aggregatedMetadataMap.forEach((metadata, key) => {
        normalizedMetadataMap.set(key, metadata);
        if (metadata.backendFileId && metadata.backendFileId !== key) {
          normalizedMetadataMap.set(metadata.backendFileId, metadata);
        }
        if (metadata.fileId && metadata.fileId !== key) {
          normalizedMetadataMap.set(metadata.fileId, metadata);
        }
      });
      setFileMetadataMap(normalizedMetadataMap);

      const filesWithoutMetadata = filesNeedingMetadata.filter((file) => {
        if (aggregatedMetadataMap.has(file.id)) {
          return false;
        }
        if (file.backendFileId && aggregatedMetadataMap.has(file.backendFileId)) {
          return false;
        }
        return true;
      });
      if (filesWithoutMetadata.length > 0) {
        loadFileMetadata(filesWithoutMetadata).catch((err) => {
          console.warn('⚠️ Failed to load file metadata (non-blocking):', err);
        });
      }
      if (retryBackends.size > 0) {
        console.debug('⏳ [loadFiles] Scheduling retry after token refresh', {
          retryBackends: Array.from(retryBackends),
        });
        scheduleTokenRetry(Array.from(retryBackends));
      }
    } catch (err) {
        // Don't set error or break unlock - just log it
      console.warn('⚠️ [loadFiles] Error (non-blocking, unlock can proceed):', err);
      setFiles([]); // Show empty list
    } finally {
      window.clearTimeout(timeoutId);
      if (!timedOut) {
        setIsLoading(false);
        isLoadingFilesRef.current = false;
      }
    }
  }, [aggregatorService, authenticatedUser, resolvedAuth, driveAccounts, loadFileMetadata, scheduleTokenRetry, driveReadBlocked, deviceGate, registerPortableCloudBackends]);

  const loadStorageQuota = React.useCallback(async () => {
    if (!aggregatorService) {
      return;
    }

    if (isLoadingFilesRef.current) {
      // If files are currently loading, defer quota load to avoid extra pressure
      return;
    }
    if (
      isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
    ) {
      // Same gate as loadFiles — avoid Drive about/user-info spam during initialize.
      const waitResult = await waitForDriveLayoutIdle(() =>
        isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
      );
      if (waitResult === 'timeout') {
        console.warn('⚠️ [loadStorageQuota] Layout wait timed out; loading quota anyway');
      }
      if (isLoadingFilesRef.current) return;
    }
    try {
      // Ensure backends are initialized (gracefully fail if Google Drive not connected)
      await aggregatorService.ensureInitialized();

      const quotas = await aggregatorService.getAggregatedStorageQuota();
      setStorageQuotas(quotas);

      // Also load user info
      const userInfos = await aggregatorService.getAggregatedUserInfo();
      const emails = new Map<string, string>();
      userInfos.forEach((info, backendId) => {
        if (info.email) {
          emails.set(backendId, info.email);
        }
      });
      setUserEmails((prev) => {
        if (prev.size === emails.size) {
          let same = true;
          for (const [k, v] of emails) {
            if (prev.get(k) !== v) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return emails;
      });
    } catch (err) {
      // Don't log as error - this is expected if Google Drive isn't connected
      console.warn('⚠️ Could not load storage quota (Google Drive may not be connected):', err);
    }
  }, [aggregatorService, driveLayoutInitInFlightRef, driveSetupProgressRef, loadStorageQuotaRef]);

  React.useEffect(() => {
    loadFilesRef.current = loadFiles;
  }, [loadFiles]);

  React.useEffect(() => {
    loadStorageQuotaRef.current = loadStorageQuota;
  }, [loadStorageQuota]);

  return {
    loadFiles,
    loadStorageQuota,
    scheduleTokenRetry,
    isLoadingFilesRef,
  };
}

export type UseLoadAggregatedFilesResult = ReturnType<typeof useLoadAggregatedFiles>;
