/**
 * Share settings + third-party indexing for FileStorageAggregator.
 *
 * Owns the share modal's state (visibility, NSFW, per-indexer toggles) and the
 * metadata/indexer refresh cycle behind it. The two long-running writes live in
 * `./share/`: `togglePublicVisibility` (publish/unpublish) and
 * `saveShareSettings` (commit the modal).
 */
import React, { useState } from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { EncryptionService } from '../../../services/aggregator/EncryptionService';
import type { MetadataIndexService } from '../../../services/metadata/MetadataIndexService';
import type { ThirdPartyIndexer, IndexingPermissions } from '../../../types/indexers';
import { API_ENDPOINT } from '../../../config/api';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../../types/aggregator';
import { METADATA_SYNC_MIN_INTERVAL_MS, INDEXER_CACHE_TTL_MS } from '../FileStorageAggregatorTypes';
import { togglePublicVisibility } from './share/togglePublicVisibility';
import { saveShareSettings } from './share/saveShareSettings';

export interface UseShareAndIndexingParams {
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  encryptionService: EncryptionService | null;
  metadataIndexService: MetadataIndexService | null;
  activeBackendId: string | null;
  fileMetadataMap: Map<string, PublicMetadata>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMessage: React.Dispatch<React.SetStateAction<string | null>>;
  requireDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => void;
  getStorageIdentityCandidates: () => string[];
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  loadFileMetadata: (filesToLoad: AggregatedFile[]) => Promise<void>;
  /** Shared refs owned by FileStorageAggregator. */
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
}

export function useShareAndIndexing({
  authenticatedUser,
  resolvedAuth,
  aggregatorService,
  encryptionService,
  metadataIndexService,
  activeBackendId,
  fileMetadataMap,
  setFileMetadataMap,
  setError,
  setSuccessMessage,
  requireDeviceCapability,
  getStorageIdentityCandidates,
  makeShareTokenCacheKey,
  loadFileMetadata,
  shareTokenCache,
}: UseShareAndIndexingParams) {
  const [sharingFile, setSharingFile] = useState<AggregatedFile | null>(null);
  const [shareVisibility, setShareVisibility] = useState<'public' | 'private'>('private');
  const [shareNSFW, setShareNSFW] = useState<boolean>(false);
  const [isSavingShare, setIsSavingShare] = useState(false);

  const [thirdPartyIndexers, setThirdPartyIndexers] = useState<ThirdPartyIndexer[]>([]);
  const [indexerToggles, setIndexerToggles] = useState<Record<string, boolean>>({});
  const [indexingPermissionsState, setIndexingPermissionsState] = useState<IndexingPermissions | null>(null);
  const [isLoadingIndexers, setIsLoadingIndexers] = useState(false);
  const [indexerError, setIndexerError] = useState<string | null>(null);
  const thirdPartyIndexersCacheRef = React.useRef<{
    identity: string | null;
    indexers: ThirdPartyIndexer[];
    fetchedAt: number;
  } | null>(null);
  const metadataRefreshStateRef = React.useRef<{
    lastSyncAt: number;
    inFlight: Promise<void> | null;
  }>({
    lastSyncAt: 0,
    inFlight: null
  });

  const resolveShareVisibility = React.useCallback(
    (file: AggregatedFile): 'public' | 'private' => {
      const metadata =
        fileMetadataMap.get(file.id) ||
        (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);

      if (metadata) {
        if (metadata.isPublic === true) {
          return 'public';
        }
        if (metadata.isPublic === false) {
          return 'private';
        }
        if ((metadata as any).visibility === 'public') {
          return 'public';
        }
        if ((metadata as any).publicToken) {
          return 'public';
        }
      }

      const cacheKeyPrimary = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
      const cacheKeyFallback = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.id);
      if (shareTokenCache.current.has(cacheKeyPrimary) || shareTokenCache.current.has(cacheKeyFallback)) {
        return 'public';
      }

      if ((file as any).visibility === 'public') {
        return 'public';
      }

      return 'private';
    },
    [fileMetadataMap]
  );

  const deriveIndexingPermissions = React.useCallback(
    (metadata?: PublicMetadata | null): IndexingPermissions => {
      const permissions = metadata?.indexingPermissions;
      if (!permissions) {
        return {
          mode: 'all',
          blocked: []
        };
      }
      return {
        mode: permissions.mode || 'all',
        allowed: permissions.allowed ? [...permissions.allowed] : permissions.allowed,
        blocked: permissions.blocked ? [...permissions.blocked] : [],
        updatedAt: permissions.updatedAt
      };
    },
    []
  );

  const computeTogglesFromPermissions = React.useCallback(
    (indexers: ThirdPartyIndexer[], permissions: IndexingPermissions): Record<string, boolean> => {
      const blocked = new Set(permissions.blocked || []);
      const allowed = new Set(permissions.allowed || []);
      return indexers.reduce<Record<string, boolean>>((acc, indexer) => {
        let enabled = true;
        if (permissions.mode === 'none') {
          enabled = false;
        } else if (permissions.mode === 'custom') {
          if (allowed.size > 0) {
            enabled = allowed.has(indexer.id);
          } else {
            enabled = !blocked.has(indexer.id);
          }
        } else {
          enabled = !blocked.has(indexer.id);
        }
        acc[indexer.id] = enabled;
        return acc;
      }, {});
    },
    []
  );

  const applyIndexersState = React.useCallback(
    (indexers: ThirdPartyIndexer[], metadata?: PublicMetadata | null) => {
      setThirdPartyIndexers(indexers);
      const basePermissions = deriveIndexingPermissions(metadata);
      setIndexingPermissionsState(basePermissions);
      const toggles = computeTogglesFromPermissions(indexers, basePermissions);
      setIndexerToggles(toggles);
    },
    [computeTogglesFromPermissions, deriveIndexingPermissions]
  );

  React.useEffect(() => {
    if (sharingFile) {
      setShareVisibility((prev) => {
        const computed = resolveShareVisibility(sharingFile);
        return prev === computed ? prev : computed;
      });
    }
  }, [sharingFile, fileMetadataMap, resolveShareVisibility]);

  const loadThirdPartyIndexers = React.useCallback(
    async (metadata?: PublicMetadata | null, options?: { force?: boolean }) => {
      // Inline identity derivation to avoid circular dependency
      const candidates = getStorageIdentityCandidates();
      const identity = candidates.length > 0 ? candidates[0] : null;
      const cacheEntry = thirdPartyIndexersCacheRef.current;
      const shouldUseCache =
        !options?.force &&
        cacheEntry &&
        cacheEntry.indexers.length > 0 &&
        cacheEntry.identity === (identity || null) &&
        Date.now() - cacheEntry.fetchedAt < INDEXER_CACHE_TTL_MS;

      if (shouldUseCache) {
        setIndexerError(null);
        applyIndexersState(cacheEntry.indexers, metadata);
        return;
      }

      setIsLoadingIndexers(true);
      setIndexerError(null);

      try {
        const endpoint = new URL(`${API_ENDPOINT}/api/third-party/indexers`);
        if (identity) {
          endpoint.searchParams.set('identity', identity);
        }

        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(errorText || `Failed to load indexers (${response.status})`);
        }

        const payload = await response.json();
        const indexers: ThirdPartyIndexer[] = Array.isArray(payload.indexers) ? payload.indexers : [];
        thirdPartyIndexersCacheRef.current = {
          identity: identity || null,
          indexers,
          fetchedAt: Date.now()
        };
        applyIndexersState(indexers, metadata);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load third-party indexers';
        console.error('❌ [ShareSettings] Failed to load third-party indexers:', error);
        setIndexerError(message);
        thirdPartyIndexersCacheRef.current = null;
      } finally {
        setIsLoadingIndexers(false);
      }
    },
    [API_ENDPOINT, applyIndexersState, resolvedAuth?.publicKey, authenticatedUser?.id, authenticatedUser?.publicKey]
    // SECURITY: Removed resolvedAuth?.pnName, authenticatedUser?.pnName - these are secrets
  );

  const refreshMetadataInBackground = React.useCallback(
    async (
      file: AggregatedFile,
      options?: {
        forceSync?: boolean;
        refreshIndexers?: boolean;
      }
    ) => {
      if (!metadataIndexService) {
        return;
      }

      if (metadataRefreshStateRef.current.inFlight && !options?.forceSync) {
        return metadataRefreshStateRef.current.inFlight;
      }

      const execute = async () => {
        try {
          await metadataIndexService.initialize();

          const now = Date.now();
          const shouldSync =
            options?.forceSync ||
            !metadataRefreshStateRef.current.lastSyncAt ||
            now - metadataRefreshStateRef.current.lastSyncAt > METADATA_SYNC_MIN_INTERVAL_MS;

          if (shouldSync) {
            const preferredDid =
              resolvedAuth?.publicKey
                ? resolvedAuth.publicKey.startsWith('did:')
                  ? resolvedAuth.publicKey
                  : `did:key:${resolvedAuth.publicKey}`
                : authenticatedUser?.id && authenticatedUser.id.startsWith('did:')
                  ? authenticatedUser.id
                  : undefined;

            // Dashboard reads metadata directly from Google Drive, not from aggregator API
            // The aggregator API is for browser app and third-party consumers
            // Skip syncFromCentralAggregator - dashboard should read companion metadata from Google Drive files
            metadataRefreshStateRef.current.lastSyncAt = Date.now();
          }

          const refreshedMetadata =
            (await metadataIndexService.getFileMetadata(file.id)) ||
            (file.backendFileId ? await metadataIndexService.getFileMetadata(file.backendFileId) : null);

          if (refreshedMetadata) {
            setFileMetadataMap((prev) => {
              const next = new Map(prev);
              const normalizedVisibility =
                refreshedMetadata.isPublic === true ||
                (refreshedMetadata as any).visibility === 'public' ||
                !!(refreshedMetadata as any).publicToken;
              const normalizedMetadata: PublicMetadata = {
                ...refreshedMetadata,
                isPublic: normalizedVisibility
                  ? true
                  : refreshedMetadata.isPublic === false
                    ? false
                    : refreshedMetadata.isPublic,
              };
              next.set(file.id, normalizedMetadata);
              if (file.backendFileId) {
                next.set(file.backendFileId, normalizedMetadata);
              }
              if (normalizedMetadata.fileId) {
                next.set(normalizedMetadata.fileId, normalizedMetadata);
              }
              if ((normalizedMetadata as any).backendFileId) {
                next.set((normalizedMetadata as any).backendFileId, normalizedMetadata);
              }
              return next;
            });

            await loadThirdPartyIndexers(
              refreshedMetadata,
              options?.refreshIndexers ? { force: true } : undefined
            );
        }
        } catch (centralSyncError) {
          console.warn('⚠️ [ShareSettings] Central metadata sync failed (non-blocking):', centralSyncError);
        } finally {
          metadataRefreshStateRef.current.inFlight = null;
        }
      };

      const run = execute();
      metadataRefreshStateRef.current.inFlight = run;
      return run;
    },
    [authenticatedUser?.id, loadThirdPartyIndexers, metadataIndexService, resolvedAuth?.publicKey]
  );

  const openShareSettings = React.useCallback(
    (file: AggregatedFile) => {
      const initialVisibility = resolveShareVisibility(file);
      setShareVisibility(initialVisibility);
      setSharingFile(file);
      const existingMetadata =
        fileMetadataMap.get(file.id) ||
        (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);
      
      // Initialize NSFW state from existing metadata
      const isNSFW = existingMetadata?.isNSFW === true || (existingMetadata as any)?.isNSFW === true;
      setShareNSFW(isNSFW);
      
      loadThirdPartyIndexers(existingMetadata);

      if (initialVisibility === 'private') {
        const metadata =
          fileMetadataMap.get(file.id) ||
          (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);

        if (!metadata || typeof metadata.isPublic !== 'boolean') {
          loadFileMetadata([file]).catch((metadataError) => {
            console.warn('⚠️ [ShareSettings] Unable to hydrate metadata before opening modal:', metadataError);
          });
        }
      }

      void refreshMetadataInBackground(file, {
        forceSync: !existingMetadata,
        refreshIndexers: !existingMetadata,
      });
    },
    [resolveShareVisibility, fileMetadataMap, loadFileMetadata, loadThirdPartyIndexers, refreshMetadataInBackground]
  );

  const closeShareSettings = React.useCallback(() => {
    setSharingFile(null);
    setShareVisibility('private');
    setShareNSFW(false);
    setThirdPartyIndexers([]);
    setIndexerToggles({});
    setIndexingPermissionsState(null);
    setIndexerError(null);
  }, []);

  const handleIndexerToggle = React.useCallback((indexerId: string) => {
    setIndexerToggles((prev) => {
      const next = { ...prev };
      next[indexerId] = !prev[indexerId];
      return next;
    });
  }, []);

  const handleTogglePublic = async (file: AggregatedFile) => {
    await togglePublicVisibility(file, {
      authenticatedUser,
      resolvedAuth,
      aggregatorService,
      encryptionService,
      metadataIndexService,
      activeBackendId,
      fileMetadataMap,
      setFileMetadataMap,
      setError,
      setSuccessMessage,
      requireDeviceCapability,
      makeShareTokenCacheKey,
      loadFileMetadata,
      shareTokenCache,
    });
  };

  const handleSaveShareSettings = React.useCallback(async () => {
    await saveShareSettings({
      authenticatedUser,
      sharingFile,
      shareVisibility,
      shareNSFW,
      fileMetadataMap,
      setFileMetadataMap,
      indexerToggles,
      thirdPartyIndexers,
      indexingPermissionsState,
      setIndexingPermissionsState,
      setIndexerError,
      setIsSavingShare,
      setError,
      requireDeviceCapability,
      togglePublic: handleTogglePublic,
      loadFileMetadata,
      refreshMetadataInBackground,
      closeShareSettings,
    });
  }, [
    sharingFile,
    shareVisibility,
    shareNSFW,
    fileMetadataMap,
    indexerToggles,
    thirdPartyIndexers,
    indexingPermissionsState,
    handleTogglePublic,
    loadFileMetadata,
    API_ENDPOINT,
    authenticatedUser,
    closeShareSettings,
    refreshMetadataInBackground,
    requireDeviceCapability,
  ]);

  return {
    sharingFile,
    shareVisibility,
    setShareVisibility,
    shareNSFW,
    setShareNSFW,
    isSavingShare,
    thirdPartyIndexers,
    indexerToggles,
    isLoadingIndexers,
    indexerError,
    resolveShareVisibility,
    refreshMetadataInBackground,
    openShareSettings,
    closeShareSettings,
    handleIndexerToggle,
    handleTogglePublic,
    handleSaveShareSettings,
  };
}

export type UseShareAndIndexingResult = ReturnType<typeof useShareAndIndexing>;
