/**
 * Aggregated file/quota loading for FileStorageAggregator.
 *
 * Owns loadFiles, loadStorageQuota and the token-retry scheduling that backs them.
 *
 * Device custody note: an owner-index 409 means the server-side Drive index is
 * incomplete (expected when OAuth secrets live on the device, not the API). That
 * path must fall through to client-side Drive discovery — never POST
 * /storage/initialize, which 400s without server-held tokens and loops setup UI.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { ownerGet } from '../../../services/ownerApiService';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../../types/aggregator';
import { normalizeVisibility } from '../storageHelpers';
import {
  type DriveSetupProgress,
  type DriveAccountState,
  type FileStorageAggregatorProps,
} from '../FileStorageAggregatorTypes';

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

  const scheduleTokenRetry = React.useCallback((backendIds: string[], options?: { delayMs?: number; resetAttempts?: boolean }) => {
    if (!backendIds.length) {
      return;
      }

    // Increment retry counts and determine delay (exponential backoff)
    const attempts: number[] = [];
    backendIds.forEach((backendId) => {
      if (options?.resetAttempts) {
        ownerIndexRetryCountsRef.current.set(backendId, 0);
      }
      const nextCount = (ownerIndexRetryCountsRef.current.get(backendId) || 0) + 1;
      ownerIndexRetryCountsRef.current.set(backendId, nextCount);
      attempts.push(nextCount);
    });

    const maxAttempts = Math.max(...attempts);
    const delay = options?.delayMs ?? Math.min(15000, 2000 * maxAttempts);

    if (maxAttempts >= 4 && !options?.delayMs) {
      console.warn('⚠️ [loadFiles] Giving up on owner index auto-refresh after repeated failures', {
        backendIds,
        attempts: attempts.reduce((acc, attempt, index) => {
          acc[backendIds[index]] = attempt;
          return acc;
        }, {} as Record<string, number>),
      });
      setError('Storage session expired. Please reconnect from the storage tab.');
      return;
    }

    if (pendingRetryTimeoutRef.current) {
      window.clearTimeout(pendingRetryTimeoutRef.current);
    }

    console.debug('⏳ [loadFiles] Scheduling token retry', {
      backendIds,
      attempts: attempts.reduce((acc, attempt, index) => {
        acc[backendIds[index]] = attempt;
        return acc;
      }, {} as Record<string, number>),
      delay,
    });

    pendingRetryTimeoutRef.current = window.setTimeout(() => {
      pendingRetryTimeoutRef.current = null;
      if (loadFilesRef.current) {
        loadFilesRef.current();
          }
    }, delay);
  }, []);

  React.useEffect(() => {
    return () => {
      ownerIndexWarningLoggedRef.current.clear();
      ownerIndexRetryCountsRef.current.clear();
      rateLimitedBackendsRef.current.clear();
      if (pendingRetryTimeoutRef.current) {
        window.clearTimeout(pendingRetryTimeoutRef.current);
        pendingRetryTimeoutRef.current = null;
              }
    };
  }, []);

  React.useEffect(() => {
    const handleRateLimited = (event: Event) => {
      const detail = (event as CustomEvent<{ backendId?: string; retryAfterMs?: number }>).detail;
      const backendId = detail?.backendId;
      const retryAfterMs = detail?.retryAfterMs ?? 60000;

      if (backendId) {
        rateLimitedBackendsRef.current.add(backendId);
        scheduleTokenRetry([backendId], { delayMs: retryAfterMs, resetAttempts: true });
      } else if (rateLimitedBackendsRef.current.size > 0) {
        scheduleTokenRetry(Array.from(rateLimitedBackendsRef.current), { delayMs: retryAfterMs, resetAttempts: true });
      }

      setError('Google Drive rate limited requests. Retrying shortly...');
    };

    window.addEventListener('google-drive-refresh-rate-limited', handleRateLimited as EventListener);
    return () => {
      window.removeEventListener('google-drive-refresh-rate-limited', handleRateLimited as EventListener);
    };
  }, [scheduleTokenRetry]);

  const loadFiles = React.useCallback(async () => {
    if (isLoadingFilesRef.current) {
      console.log('⏳ [loadFiles] Load already in progress, skipping');
      return;
    }
    if (driveLayoutInitInFlightRef.current.size > 0 || driveSetupProgressRef.current) {
      console.log('⏳ [loadFiles] Drive layout setup in progress, deferring file load');
      window.setTimeout(() => {
        if (
          driveLayoutInitInFlightRef.current.size === 0 &&
          !driveSetupProgressRef.current &&
          loadFilesRef.current
        ) {
          void loadFilesRef.current();
        }
      }, 500);
      return;
    }
    if (driveReadBlocked) {
      setFiles([]);
      setError(deviceGate?.blockedMessage ?? null);
      setIsLoading(false);
      return;
    }
    isLoadingFilesRef.current = true;
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
        let ownerIndex: any = null;
        let ownerIndexFromApi = false;
        let skipClientDriveDiscovery = false;

        const ownerApiToken = currentPnIdentifier
          ? resolveOwnerApiToken(
              currentPnIdentifier.startsWith('pn-')
                ? currentPnIdentifier
                : `pn-${currentPnIdentifier}`
            )
          : resolveOwnerApiToken();
        if (!ownerIndex && currentPnIdentifier && ownerApiToken) {
          try {
            const pnId = currentPnIdentifier.startsWith('pn-')
              ? currentPnIdentifier
              : `pn-${currentPnIdentifier}`;
            // Do not block client discovery while a server init is in flight —
            // under device custody that init often cannot succeed (400), and
            // skipping discovery leaves the Storage UI empty / stuck on setup.
            const idxRes = await ownerGet(
              ownerApiToken,
              `/api/storage/owner-index/${encodeURIComponent(pnId)}`
            );
            if (idxRes.status === 403) {
              // Device policy / custody — fall through to client Drive discovery
              console.debug('ℹ️ [loadFiles] owner-index forbidden; using client Drive discovery');
            } else if (idxRes.status === 409) {
              // Server Drive index incomplete (common under device cloud custody where
              // OAuth secrets are not on the API). Do NOT POST /storage/initialize —
              // that returns 400 without server-held tokens and loops the "setup" UI.
              // Fall through to client-side folder/index discovery with the local Google token.
              console.debug(
                'ℹ️ [loadFiles] owner-index incomplete (409); using client Drive discovery instead of server rebuild'
              );
            } else if (idxRes.ok) {
              const idxData = await idxRes.json();
              const provider = backendId.includes('::') ? backendId.split('::')[0] : backendId;
              const filteredFiles = (idxData.files || []).filter(
                (entry: any) => (entry.backend || 'google_drive') === provider
              );
              ownerIndex = { ...idxData, files: filteredFiles };
              ownerIndexFromApi = true;
              skipClientDriveDiscovery = true;
            }
          } catch {
            /* non-blocking */
          }
        }

        if (accessToken && currentPnIdentifier && !ownerIndex && !skipClientDriveDiscovery) {
          try {
            const { GoogleDriveMetadataService } = await import('../../../services/storage/GoogleDriveMetadataService');
            const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(accessToken, currentPnIdentifier);
            const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(accessToken, pnFolderId);
            // Try loading from content class-specific indices first, fallback to root index
            ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndexFromContentClasses(
              accessToken,
              metadataFolderId,
              currentPnIdentifier,
              resolveOwnerApiToken()
            );
            console.debug('📋 [loadFiles] Owner index response', {
              backendId,
              hasIndex: !!ownerIndex,
              fileCount: ownerIndex?.files?.length || 0,
            });
          } catch (ownerIndexError) {
            const errorMessage =
              ownerIndexError instanceof Error ? ownerIndexError.message : String(ownerIndexError);
            const isAuthRelated =
              typeof errorMessage === 'string' &&
              (errorMessage.includes('Failed to search for pN folder') ||
               errorMessage.includes('Failed to search for metadata folder') ||
               errorMessage.includes('Google Drive authentication expired') ||
               errorMessage.includes('token refresh is temporarily rate limited'));

            if (isAuthRelated) {
              retryBackends.add(backendId);
              rateLimitedBackendsRef.current.add(backendId);
              console.debug('⏳ [loadFiles] Owner index request will retry after token refresh', {
                backendId,
                error: errorMessage,
              });
              continue;
            } else if (!ownerIndexWarningLoggedRef.current.has(backendId)) {
            console.warn('⚠️ [loadFiles] Failed to read owner index (non-blocking):', {
              backendId,
              error: ownerIndexError,
            });
              ownerIndexWarningLoggedRef.current.add(backendId);
            } else {
              console.debug('ℹ️ [loadFiles] Owner index still unavailable', {
                backendId,
                error: errorMessage,
              });
            }
          }
        }

        let filesForBackend: AggregatedFile[] = [];

        if (ownerIndexFromApi && (!ownerIndex?.files || ownerIndex.files.length === 0)) {
          console.debug('ℹ️ [loadFiles] Owner index empty from API; skipping Drive scan', { backendId });
          filesForBackend = [];
        } else if (ownerIndex?.files?.length) {
          ownerIndexRetryCountsRef.current.delete(backendId);
          
          // IMPORTANT: Always scan Google Drive to verify files exist before using owner index entries
          // This prevents showing orphaned files that were deleted from Drive but remain in the index
          let scannedFiles: any[] = [];
          try {
            scannedFiles = await backend.listFiles(undefined, currentPnIdentifier);
            console.debug('✅ [loadFiles] Scanned Google Drive to verify file existence', {
              backendId,
              scannedCount: scannedFiles.length,
              ownerIndexCount: ownerIndex.files.length
            });
          } catch (scanError) {
            console.warn('⚠️ [loadFiles] Failed to scan Drive for orphaned file cleanup (non-blocking)', {
              backendId,
              error: scanError,
            });
            // Continue with owner index entries if scan fails (better than showing nothing)
          }

          const backendProvider = backendId.includes('::') ? backendId.split('::')[0] : backendId;
          const isPortableBackend = backendProvider !== 'google_drive';
          const existingFileIds = new Set(
            scannedFiles.map((f: any) => f.id).concat(scannedFiles.map((f: any) => f.name))
          );

          const ownerIndexFileIds = new Set(
            ownerIndex.files
              .map((entry: any) => entry.backendFileId || entry.googleDriveFileId)
              .filter(Boolean)
          );

          filesForBackend = ownerIndex.files
            .filter((entry: any) => {
              const blobId = entry.backendFileId || entry.googleDriveFileId;
              if (!isPortableBackend && blobId && !existingFileIds.has(blobId)) {
                console.debug('🗑️ [loadFiles] Filtering out orphaned file from files list', {
                  backendId,
                  fileId: blobId,
                  fileName: entry.fileName || entry.originalName
                });
                return false;
              }
              return true;
            })
            .map((entry: any) => {
              const derivedMime =
                entry.mimeType ||
                (entry.fileName?.toLowerCase().endsWith('.encrypted') ? 'application/octet-stream' : undefined);

              const normalizedName = entry.fileName || entry.originalName || 'Untitled';
              const parsedSize = typeof entry.size === 'number' ? entry.size : Number(entry.size || 0);
              const fileId = entry.fileId || entry.backendFileId || entry.googleDriveFileId || `${backendId}:${entry.fileName}`;

              return {
                id: fileId,
                backend: backendId,
                backendFileId: entry.backendFileId || entry.googleDriveFileId,
                storageProvider: entry.backend || backendId.split('::')[0],
                name: normalizedName,
                originalName: entry.originalName || normalizedName,
                mimeType: derivedMime,
                size: Number.isFinite(parsedSize) ? parsedSize.toString() : '0',
                encrypted: true,
                visibility: normalizeVisibility(entry.visibility),
                aggregatedAt: entry.uploadedAt || new Date().toISOString(),
              };
            });
          
          // IMPORTANT: Also include files from Drive scan that aren't in the owner index
          // This ensures PDFs, thoughts, and other files uploaded directly to Drive are shown
          const filesNotInIndex = scannedFiles.filter((scannedFile: any) => {
            return !ownerIndexFileIds.has(scannedFile.id);
          });
          
          if (filesNotInIndex.length > 0) {
            // Add files not in index to filesForBackend
            const additionalFiles = filesNotInIndex.map((file: any) => ({
              id: file.id,
              backend: backendId,
              backendFileId: file.id,
              name: file.name,
              originalName: file.originalName || file.name.replace('.encrypted', ''),
              mimeType: file.mimeType,
              size: file.size?.toString() || '0',
              encrypted: file.name.endsWith('.encrypted'),
              visibility: 'private' as const,
              aggregatedAt: file.modifiedTime || new Date().toISOString(),
            }));
            
            filesForBackend.push(...additionalFiles);
            filesNeedingMetadata.push(...additionalFiles);
          }

          // Process metadata from owner index, filtering out orphaned entries
          // Reuse existingFileIds from above
          const orphanedEntries: any[] = [];

          ownerIndex.files.forEach((entry: any) => {
            const googleDriveFileId = entry.googleDriveFileId;
            
            // Skip entries that don't exist in Google Drive (orphaned)
            if (googleDriveFileId && !existingFileIds.has(googleDriveFileId)) {
              orphanedEntries.push(entry);
              console.debug('🗑️ [loadFiles] Filtering out orphaned file from owner index', {
                backendId,
                fileId: googleDriveFileId,
                fileName: entry.fileName || entry.originalName
              });
              return; // Skip this entry
            }

            const fileId = entry.fileId || entry.googleDriveFileId || `${backendId}:${entry.fileName}`;
            const name = entry.originalName || entry.fileName || 'Untitled';
            const mime =
              entry.mimeType ||
              (name?.toLowerCase().endsWith('.encrypted') ? 'application/octet-stream' : undefined);
            const schemaType =
              mime?.startsWith('image/')
                ? 'ImageObject'
                : mime?.startsWith('video/')
                ? 'VideoObject'
                : mime?.startsWith('audio/')
                ? 'AudioObject'
                : 'CreativeWork';
            const isPublic = entry.visibility === 'public';
            const publicToken =
              typeof entry.publicToken === 'string'
                ? entry.publicToken
                : entry.publicToken
                ? JSON.stringify(entry.publicToken)
                : undefined;

            const metadata: PublicMetadata = {
              fileId,
              backend: backendId,
              backendFileId: entry.googleDriveFileId,
              name,
              description: entry.description || '',
              keywords: entry.tags || [],
              uploadDate: entry.uploadedAt,
              fileType: schemaType === 'ImageObject' ? 'image' : schemaType === 'VideoObject' ? 'video' : schemaType === 'AudioObject' ? 'audio' : 'document',
              isPublic,
              creator: entry.owner?.did
                ? {
                    "@type": "Person",
                    "@id": entry.owner.did,
                    identifier: {
                      "@type": "PropertyValue",
                      name: 'DID',
                      value: entry.owner.did,
                    },
                  }
                : undefined,
              thumbnail: entry.thumbnail,
              publicToken,
              engagement: entry.engagement,
              inReplyTo: entry.inReplyTo,
              repostOf: entry.repostOf,
              isPartOf: entry.isPartOf,
              "@context": ["https://schema.org/", "https://parnoir.com/ns/v1#"],
              "@type": schemaType,
              "@id": `https://parnoir.com/resource/${fileId}`,
            };
            aggregatedMetadataMap.set(fileId, metadata);
            if (metadata.backendFileId && metadata.backendFileId !== fileId) {
              aggregatedMetadataMap.set(metadata.backendFileId, metadata);
            }

            if (entry.publicToken) {
              try {
                const shareToken = typeof entry.publicToken === 'string'
                  ? JSON.parse(entry.publicToken)
                  : entry.publicToken;
                const cacheKey = makeShareTokenCacheKey(backendId, entry.googleDriveFileId);
                shareTokenCache.current.set(cacheKey, shareToken);
                console.debug('💾 [loadFiles] Cached share token from owner index', { backendId, fileId });
              } catch (tokenError) {
                console.warn('⚠️ [loadFiles] Failed to cache owner index share token', {
                  backendId,
                  fileId,
                  error: tokenError,
                });
              }
            }
          });

          // Log orphaned entries found and clean them up
          if (orphanedEntries.length > 0) {
            console.warn(`⚠️ [loadFiles] Found ${orphanedEntries.length} orphaned file(s) in owner index for ${(backendId || '').substring(0, 8)}...`, {
              orphanedFiles: orphanedEntries.map(e => ({
                fileId: e.googleDriveFileId,
                fileName: e.fileName || e.originalName
              }))
            });
          }
        } else if (!ownerIndexFromApi) {
          console.debug('ℹ️ [loadFiles] No API owner index; scanning Drive contents', { backendId });
          try {
            const scannedFiles = await backend.listFiles(undefined, currentPnIdentifier);
            filesForBackend = scannedFiles.map((file: any) => ({
              ...file,
              backend: backendId,
              backendFileId: file.id,
            }));
            filesNeedingMetadata.push(...filesForBackend);

            if (ownerIndex?.files?.length) {
              filesForBackend.forEach((file) => {
                const indexEntry = ownerIndex.files.find((entry: any) => entry.googleDriveFileId === file.backendFileId);
                if (indexEntry?.publicToken) {
                  try {
                    const shareToken = typeof indexEntry.publicToken === 'string'
                      ? JSON.parse(indexEntry.publicToken)
                      : indexEntry.publicToken;
                    const cacheKey = makeShareTokenCacheKey(backendId, file.backendFileId);
                    shareTokenCache.current.set(cacheKey, shareToken);
                  } catch (tokenError) {
                    console.warn('⚠️ [loadFiles] Unable to parse share token for scanned file', {
                      backendId,
                      fileId: file.id,
                      error: tokenError,
                    });
                  }
                }
              });
            }
          } catch (scanError) {
            const scanMessage =
              scanError instanceof Error ? scanError.message : String(scanError);
            const scanCode = (scanError as any)?.code;

            if (
              scanCode === 'GOOGLE_DRIVE_REFRESH_COOLDOWN' ||
              scanMessage.includes('token refresh is temporarily rate limited') ||
              scanMessage.includes('Google Drive authentication expired')
            ) {
              retryBackends.add(backendId);
              rateLimitedBackendsRef.current.add(backendId);
            }

            console.warn('⚠️ [loadFiles] Drive scan failed (non-blocking)', {
              backendId,
              error: scanError,
            });
            continue;
          }
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
      setIsLoading(false);
      isLoadingFilesRef.current = false;
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
      setUserEmails(emails);
    } catch (err) {
      // Don't log as error - this is expected if Google Drive isn't connected
      console.warn('⚠️ Could not load storage quota (Google Drive may not be connected):', err);
    }
  }, [aggregatorService]);

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
