/**
 * Share settings + third-party indexing for FileStorageAggregator.
 *
 * Owns the share modal's state (visibility, NSFW, per-indexer toggles) and the
 * publish path: generating/reusing the share token, submitting public metadata to
 * the index, and mirroring it into the Drive public index.
 *
 * The Drive public index is a cache — the API database is the source of truth —
 * so a failed mirror is reported but never rolls back the publish.
 */
import React, { useState } from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { EncryptionService } from '../../../services/aggregator/EncryptionService';
import type { MetadataIndexService } from '../../../services/metadata/MetadataIndexService';
import type { CompanionMetadata } from '../../../services/storage/GoogleDriveMetadataService';
import type { ThirdPartyIndexer, IndexingPermissions } from '../../../types/indexers';
import { API_ENDPOINT } from '../../../config/api';
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken, EncryptedFilePackage } from '../../../types/aggregator';
import { METADATA_SYNC_MIN_INTERVAL_MS, INDEXER_CACHE_TTL_MS } from '../FileStorageAggregatorTypes';

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
    try {
      requireDeviceCapability('drive.upload');
      if (!metadataIndexService) {
        setError('Metadata service not available');
        return;
      }

      await metadataIndexService.initialize();

      const existingMetadata =
        fileMetadataMap.get(file.id) ||
        (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);
      const isCurrentlyPublic = existingMetadata?.isPublic || false;

      if (isCurrentlyPublic) {
        // Make private - remove from index
        await metadataIndexService.removeFromIndex(existingMetadata?.fileId || file.id);
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.delete(file.id);
          if (file.backendFileId) {
            next.delete(file.backendFileId);
          }
          if (existingMetadata?.fileId && existingMetadata.fileId !== file.id) {
            next.delete(existingMetadata.fileId);
          }
          return next;
        });
      } else {
        // Make public - create metadata and index
        // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        if (!credentials?.pnName || !resolvedAuth?.publicKey) {
          setError('Please unlock your pN to make files public');
          return;
        }

        // Generate public metadata with Semantic Web standards (JSON-LD)
        // CRITICAL: Never include pN name (username) in public metadata - it's a secret
        const fileTitle = file.encrypted ? file.originalName || file.name.replace('.encrypted', '') : file.name;
        
        // Detect file type from mimeType (if original) or filename
        // Encrypted files have mimeType "application/json", so we need to detect from filename
        let mimeCategory = file.mimeType?.split('/')[0] || 'file';
        if (mimeCategory === 'application' || mimeCategory === 'file') {
          // Try to detect from filename
          const fileName = fileTitle.toLowerCase();
          if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/)) {
            mimeCategory = 'image';
          } else if (fileName.match(/\.(mp4|mov|avi|webm|mkv)$/)) {
            mimeCategory = 'video';
          } else if (fileName.match(/\.(mp3|wav|ogg|flac|aac)$/)) {
            mimeCategory = 'audio';
          } else if (fileName.match(/\.(pdf|doc|docx|txt|md)$/)) {
            mimeCategory = 'document';
          }
        }
        
        // Map file types to schema.org types
        const schemaType =
          mimeCategory === 'image' ? 'ImageObject' :
          mimeCategory === 'video' ? 'VideoObject' :
          mimeCategory === 'audio' ? 'AudioObject' :
          'CreativeWork';

        // Generate resource URI (consistent with metadata service)
        const resourceUri = `https://parnoir.com/resource/${file.id}`;
        const didUri = resolvedAuth.publicKey.startsWith('did:')
          ? resolvedAuth.publicKey
          : `did:key:${resolvedAuth.publicKey}`;

        // CRITICAL: If this is a thought file and we don't have content, load it from Google Drive
        const thoughtFileName = fileTitle.toLowerCase();
        const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(thoughtFileName);
        const isTextFile = mimeCategory === 'text' || file.fileType === 'text' || file.fileType === 'thought';
        
        let existingTextPost = existingMetadata?.textPost || existingMetadata?.thought || (file as any).textPost || (file as any).thought;
        
        // If it's a thought file but we don't have content, load it from Google Drive
        if ((isThoughtFile || isTextFile) && !existingTextPost?.content) {
          try {
            console.log(`[handleTogglePublic] Loading thought content from Google Drive for ${file.id}...`);
            const backend = aggregatorService?.getBackend(file.backend);
            if (backend && backend.isConnected()) {
              const encryptedBlob = await backend.downloadFile(file.backendFileId);
              const encryptedPackageJson = await encryptedBlob.text();
              const encryptedPackage: EncryptedFilePackage = JSON.parse(encryptedPackageJson);
              
              // Decrypt the thought file
              const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              
              if (credentials && encryptionService) {
                const { decryptedBlob } = await encryptionService.decryptFileFromDownload(
                  encryptedPackage,
                  {
                    id: authenticatedUser?.id || resolvedAuth.publicKey,
                    publicKey: resolvedAuth.publicKey
                  }
                );
                const decryptedData = new Uint8Array(await decryptedBlob.arrayBuffer());
                
                const decryptedText = new TextDecoder().decode(decryptedData);
                const thoughtData = JSON.parse(decryptedText);
                
                if (thoughtData.textPost || thoughtData.thought) {
                  existingTextPost = thoughtData.textPost || thoughtData.thought;
                  console.log(`[handleTogglePublic] ✅ Loaded thought content from Google Drive`);
                }
              }
            }
          } catch (error) {
            console.warn(`[handleTogglePublic] Failed to load thought content from Google Drive:`, error);
            // Continue without content - user can manually fix later
          }
        }
        
        let existingThumbnailFileId = existingMetadata?.thumbnailFileId || null;
        
        const existingDescription = existingMetadata?.description || '';
        const existingKeywords = existingMetadata?.keywords || existingMetadata?.tags || [];
        const existingSubjects = existingMetadata?.subjects || [];
        const existingFeedCategories = existingMetadata?.feedCategories || [];
        
        const publicMetadata: PublicMetadata = {
          "@context": [
            "https://schema.org/",
            "https://parnoir.com/ns/v1#"
          ],
          "@type": schemaType,
          "@id": resourceUri,
          
          // Core identifiers
          fileId: file.id,
          backend: file.backend,
          backendFileId: file.backendFileId,
          
          // Schema.org CreativeWork
          name: fileTitle,
          description: existingDescription,
          keywords: existingKeywords,
          uploadDate: file.modifiedTime || new Date().toISOString(),
          fileType: mimeCategory,
          
          // CRITICAL: Always include textPost/thought (even if null) so backend can preserve/clear it
          textPost: existingTextPost || null,
          thought: existingTextPost || null,
          
          thumbnailFileId: existingThumbnailFileId ?? undefined,
          
          // Preserve subjects and feed categories
          ...(existingSubjects.length > 0 && { subjects: existingSubjects }),
          ...(existingFeedCategories.length > 0 && { feedCategories: existingFeedCategories }),
          
          // Author (schema.org:creator)
          creator: {
            "@type": "Person",
            "@id": didUri,
            identifier: {
              "@type": "PropertyValue",
              name: "DID",
              value: resolvedAuth.publicKey
            }
          },
          
          // Legacy author support (for backward compatibility)
          author: {
            did: didUri
          },
          
          // Initialize engagement metrics
          engagement: {
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            lastUpdated: file.modifiedTime || new Date().toISOString()
          },
          
          // par Noir specific
          isPublic: true
        };

        // Phase 3: Generate share token for public file access
        let shareToken: ShareToken | undefined = undefined;
        
        // Try to get share token from cache first (generated during upload)
        // Try multiple possible cache keys since file ID might be stored differently
        const candidateKeys: string[] = [];
        if (file.backend) {
          candidateKeys.push(makeShareTokenCacheKey(file.backend, file.backendFileId));
          candidateKeys.push(makeShareTokenCacheKey(file.backend, file.id));
        }

        for (const key of candidateKeys) {
          const cached = shareTokenCache.current.get(key);
          if (cached) {
            shareToken = cached;
            break;
          }
        }

        if (!shareToken) {
          // Fallback to legacy cache keys (pre multi-account)
          shareToken = shareTokenCache.current.get(file.backendFileId) ||
            shareTokenCache.current.get(file.id) ||
            shareTokenCache.current.get((file as any).backendFile?.id);
        }

        if (!shareToken) {
          // If not in cache, generate it now (for files uploaded before this change)
          console.log('🔑 [Phase 3] Share token not in cache, generating now...', {
            backendFileId: file.backendFileId,
            fileId: file.id,
            cacheSize: shareTokenCache.current.size
          });
          try {
            // Download the encrypted file to get the EncryptedFilePackage
            if (!aggregatorService) {
              throw new Error('Aggregator service not available');
            }
            const backend = aggregatorService.getBackend(file.backend);
            if (backend && backend.isConnected()) {
              const encryptedBlob = await backend.downloadFile(file.backendFileId);
              const encryptedPackageJson = await encryptedBlob.text();
              const encryptedPackage: EncryptedFilePackage = JSON.parse(encryptedPackageJson);

              // Create session object for token generation using stable pN identity
              // Use authenticatedUser.id if available (stable), otherwise fall back
              const session: AuthSession = {
                id: authenticatedUser?.id || resolvedAuth.publicKey,
                publicKey: resolvedAuth.publicKey,
                accessToken: authenticatedUser?.accessToken,
                nickname: authenticatedUser?.nickname
              };

              // Generate share token using stable pN identity (no passcode needed)
              console.log('🔑 [Phase 3] Starting token generation...', { 
                fileId: file.id, 
                hasSession: !!session,
                hasId: !!session.id,
                hasPublicKey: !!session.publicKey
              });
              if (!encryptionService) {
                throw new Error('Encryption service not available');
              }
              shareToken = await encryptionService.generateShareToken(
                encryptedPackage,
                session
              );

              // Cache it for future use
              const shareTokenKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
              shareTokenCache.current.set(shareTokenKey, shareToken);
              console.log('💾 [Phase 3] Share token cached for future use');

              // Store token in metadata
              publicMetadata.publicToken = JSON.stringify(shareToken);
              console.log('✅ [Phase 3] Share token generated and stored in metadata:', file.id, {
                tokenHasShareKey: !!shareToken.shareKey,
                tokenHasShareEncrypted: !!shareToken.shareEncrypted,
                tokenLength: JSON.stringify(shareToken).length
              });
            } else {
              throw new Error('Backend not connected');
            }
          } catch (tokenError) {
            console.error('❌ [Phase 3] Failed to generate share token:', tokenError);
            const errorMessage = tokenError instanceof Error ? tokenError.message : 'Unknown error';
            throw new Error(`Failed to generate share token: ${errorMessage}`);
          }
        } else {
          console.log('✅ [Phase 3] Using cached share token');
          // Store token in metadata
          publicMetadata.publicToken = JSON.stringify(shareToken);
        }

        // Index the file - pass pN identifier so metadata folder is created inside pN folder
        // Get pN identifier for metadata folder location (use VolumeIdGenerator for consistency)
        let metadataPnIdentifier: string | undefined = undefined;
        try {
          const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
          const sessionId = authenticatedUser?.id;
          const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          
          // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth or authenticatedUser (public)
          const publicKey = resolvedAuth?.publicKey || authenticatedUser?.publicKey;
          
          if (credentials?.pnName && credentials?.passcode && publicKey) {
            // Use VolumeIdGenerator for consistent identifier (same as folder naming)
            metadataPnIdentifier = await VolumeIdGenerator.generateVolumeId({
              pnName: credentials.pnName,
              passcode: credentials.passcode,
              publicKey: publicKey
            });
            console.log('📁 [Phase 3] Generated pN identifier (standardized):', (metadataPnIdentifier || '').substring(0, 8) + '...');
          } else {
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            console.warn('⚠️ [Phase 3] Cannot generate standardized pN identifier - credentials required:', {
              hasPnName: !!credentials?.pnName,
              hasPasscode: !!credentials?.passcode,
              hasPublicKey: !!publicKey,
              hasResolvedAuth: !!resolvedAuth,
              hasAuthenticatedUser: !!authenticatedUser
            });
            console.warn('⚠️ [Phase 3] Metadata indexing skipped - credentials must be available');
          }
        } catch (err) {
          console.warn('Failed to generate pN identifier for metadata folder:', err);
        }

        // OPTIMIZATION: Run API metadata operations in parallel
        // POST and PUT are independent and can execute simultaneously
        const targetFileId = publicMetadata.fileId || file.backendFileId || file.id;
        console.log('📤 [Phase 3] Submitting metadata to index (parallel operations)...', {
          fileId: file.id,
          targetFileId,
          hasToken: !!publicMetadata.publicToken,
          tokenLength: publicMetadata.publicToken?.length || 0
        });
        
        const { retry: retryHelper } = await import('../../../utils/helpers');
        
        // Run POST and PUT in parallel - they're independent operations
        const [indexResult, putResult] = await Promise.allSettled([
          // POST to submit metadata
          metadataIndexService.indexFile(file, publicMetadata, metadataPnIdentifier),
          // PUT to explicitly update isPublic (ensures database is updated even if POST didn't properly update existing entry)
          retryHelper(
            async () => {
              const res = await fetch(
                `${API_ENDPOINT}/api/aggregator/metadata-index/${encodeURIComponent(targetFileId)}${authenticatedUser?.accessToken ? `?accountId=${encodeURIComponent(file.backend || '')}` : ''}`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(authenticatedUser?.accessToken && {
                      'Authorization': `Bearer ${authenticatedUser.accessToken}`
                    })
                  },
                  body: JSON.stringify({
                    isPublic: publicMetadata.isPublic,
                    publicToken: publicMetadata.publicToken,
                    name: publicMetadata.name || file.name,
                    description: publicMetadata.description || '',
                    keywords: publicMetadata.keywords || [],
                    tags: publicMetadata.keywords || [],
                    fileType: publicMetadata.fileType || 'other',
                    uploadDate: publicMetadata.uploadDate || new Date().toISOString(),
                    subjects: publicMetadata.subjects || [],
                    // CRITICAL: Always include textPost/thought (even if null) so backend can preserve/clear it
                    textPost: publicMetadata.textPost ?? null,
                    thought: publicMetadata.thought ?? null,
                    // CRITICAL: Always include PDF slideshow data (even if null) so backend can preserve/clear it
                    thumbnailFileId: publicMetadata.thumbnailFileId ?? null,
                    feedCategories: publicMetadata.feedCategories || [],
                  }),
                }
              );

              // If 429, throw to trigger retry
              if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
                const error = new Error(`Rate limited (429). ${delay ? `Retry after ${delay}ms` : 'Retrying...'}`);
                (error as any).status = 429;
                (error as any).retryAfter = delay;
                throw error;
              }

              // 202 = content pending copyright review (DMCA bot flagged; human review will decide)
              if (res.status === 202) {
                const data = await res.json().catch(() => ({}));
                setSuccessMessage(data.message || "Content is under copyright review. You'll be notified when it's decided. Check Services for status.");
                throw new Error('PENDING_REVIEW');
              }

              // 403 = e.g. account restricted (repeat infringer) or other denial
              if (res.status === 403) {
                const data = await res.json().catch(() => ({}));
                const msg = data.message || data.error || 'Request denied';
                setError(msg);
                throw new Error(msg);
              }

              if (!res.ok) {
                const errorText = await res.text().catch(() => res.statusText);
                throw new Error(`PUT failed: ${res.status} - ${errorText}`);
              }

              return res;
            },
            3, // maxAttempts
            2000 // baseDelay (2 seconds)
          )
        ]);
        
        // Log results
        if (indexResult.status === 'fulfilled') {
          console.log('✅ [Phase 3] Metadata indexed with token');
        } else {
          console.error('❌ [Phase 3] Failed to index metadata:', indexResult.reason);
        }
        
        if (putResult.status === 'fulfilled') {
          const putResponse = putResult.value;
          const putData = await putResponse.json().catch(() => ({}));
          console.log('✅ [Phase 3] PUT endpoint updated isPublic successfully', putData);
        } else {
          const reason = putResult.reason as Error | undefined;
          if (reason?.message === 'PENDING_REVIEW') {
            // Content is pending copyright review; success message already set; do not continue to Drive index update
            await loadFileMetadata([file]);
            return;
          }
          console.error('❌ [Phase 3] Failed to update isPublic via PUT endpoint (non-critical):', putResult.reason);
        }

        // CRITICAL: Update Google Drive public index file when making file public
        // This ensures the file appears in the public index that the API syncs from
        console.log('🔍 [Phase 3] Checking if Google Drive public index update is needed...', {
          hasMetadataPnIdentifier: !!metadataPnIdentifier,
          metadataPnIdentifier: metadataPnIdentifier ? `${metadataPnIdentifier.substring(0, 8)}...` : null,
          hasBackend: !!file.backend,
          backend: file.backend,
          fileId: file.id,
          backendFileId: file.backendFileId
        });
        
        if (metadataPnIdentifier && file.backend) {
          try {
            const backend = aggregatorService?.getBackend(file.backend);
            console.log('🔍 [Phase 3] Backend lookup result:', {
              backendFound: !!backend,
              backendId: file.backend,
              isConnected: backend ? backend.isConnected() : false
            });
            
            if (backend && backend.isConnected()) {
              // Get access token from backend
              const accessToken = backend.getAccessToken?.();
              
              console.log('🔍 [Phase 3] Access token check:', {
                hasAccessToken: !!accessToken,
                tokenLength: accessToken ? accessToken.length : 0
              });
              
              if (accessToken) {
                const { GoogleDriveMetadataService } = await import('../../../services/storage/GoogleDriveMetadataService');
                
                // SIMPLIFIED: The API endpoint already creates Google Sheets companion metadata
                // We only need to update the public-file-index.json as a backup/cache
                // The database (updated via API) is the source of truth
                // CRITICAL: Ensure we use the actual Google Drive file ID for googleDriveFileId
                // file.backendFileId is the Google Drive file ID, file.id might be a composite ID
                const companionMetadata: CompanionMetadata = {
                  fileId: file.id,
                  googleDriveFileId: file.backendFileId || file.id,
                  fileName: file.name,
                  originalName: file.originalName || file.name.replace('.encrypted', ''),
                  mimeType: file.mimeType || 'application/octet-stream',
                  size: parseInt(String(file.size || 0), 10),
                  visibility: 'public',
                  uploadedAt: file.aggregatedAt || new Date().toISOString(),
                  owner: {
                    did: resolvedAuth?.publicKey ? (resolvedAuth.publicKey.startsWith('did:') ? resolvedAuth.publicKey : `did:key:${resolvedAuth.publicKey}`) : undefined,
                    identifier: metadataPnIdentifier
                  },
                  tags: publicMetadata.keywords || [],
                  description: publicMetadata.description || '',
                  publicToken: shareToken ? (typeof shareToken === 'string' ? shareToken : JSON.stringify(shareToken)) : undefined,
                  engagement: publicMetadata.engagement
                };
                
                console.log('📝 [Phase 3] Updating public index file (backup/cache only)...', {
                  fileId: companionMetadata.fileId,
                  googleDriveFileId: companionMetadata.googleDriveFileId,
                  fileName: companionMetadata.fileName,
                  visibility: companionMetadata.visibility
                });
                
                // Only update the public index file - API endpoint handles Google Sheets creation
                const publicIndexResult = await GoogleDriveMetadataService.updatePublicFileIndex(
                  accessToken,
                  metadataPnIdentifier,
                  companionMetadata
                ).catch(err => {
                  console.warn('⚠️ [Phase 3] Failed to update public index (non-critical, API is source of truth):', err);
                  return null;
                });
                
                if (publicIndexResult) {
                  console.log('✅ [Phase 3] Public index file updated successfully (backup/cache)');
                  setSuccessMessage('File made public!');
                }
              } else {
                console.warn('⚠️ [Phase 3] No access token available to update Google Drive public index');
                setError('Failed to update public index: No access token available');
              }
            } else {
              console.warn('⚠️ [Phase 3] Backend not connected - cannot update Google Drive public index', {
                backendFound: !!backend,
                isConnected: backend ? backend.isConnected() : false
              });
              setError('Failed to update public index: Backend not connected');
            }
          } catch (driveIndexError) {
            console.error('❌ [Phase 3] Failed to update Google Drive public index file:', driveIndexError);
            const errorMessage = driveIndexError instanceof Error ? driveIndexError.message : String(driveIndexError);
            console.error('❌ [Phase 3] Error details:', {
              message: errorMessage,
              stack: driveIndexError instanceof Error ? driveIndexError.stack : undefined
            });
            setError(`Failed to update public index: ${errorMessage}`);
            // Non-critical - API database is updated, but Google Drive index won't be in sync
            // The API sync service will eventually sync it, but user won't see it immediately
          }
        } else {
          console.warn('⚠️ [Phase 3] Missing pN identifier or backend - cannot update Google Drive public index', {
            hasMetadataPnIdentifier: !!metadataPnIdentifier,
            hasBackend: !!file.backend,
            metadataPnIdentifier: metadataPnIdentifier ? `${metadataPnIdentifier.substring(0, 8)}...` : null,
            backend: file.backend
          });
          setError('Failed to update public index: Missing pN identifier or backend');
        }

        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.set(file.id, publicMetadata);
          if (file.backendFileId && !next.has(file.backendFileId)) {
            next.set(file.backendFileId, publicMetadata);
          }
          if (publicMetadata.fileId && !next.has(publicMetadata.fileId)) {
            next.set(publicMetadata.fileId, publicMetadata);
          }
          return next;
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update file visibility';
      if (errorMessage === 'PENDING_REVIEW') {
        // Success message already set; do not overwrite with error
        return;
      }
      console.error('Failed to toggle public status:', err);
      setError(errorMessage);
    }
  };

  const handleSaveShareSettings = React.useCallback(async () => {
    if (!sharingFile) {
      return;
    }

    try {
      requireDeviceCapability('drive.upload');
      setIsSavingShare(true);
      const fileForRefresh = sharingFile;
      const existingMetadata =
        fileMetadataMap.get(sharingFile.id) ||
        (sharingFile.backendFileId ? fileMetadataMap.get(sharingFile.backendFileId) : undefined);
      const targetFileId = existingMetadata?.fileId || sharingFile.id;

      const isCurrentlyPublic = existingMetadata?.isPublic || false;
      const makePublic = shareVisibility === 'public';

      const blockedIds = Object.entries(indexerToggles)
        .filter(([, enabled]) => !enabled)
        .map(([id]) => id);
      const enabledIds = Object.entries(indexerToggles)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id);

      let nextPermissions: IndexingPermissions | null = null;
      if (thirdPartyIndexers.length > 0) {
        if (blockedIds.length === 0) {
          nextPermissions = {
            mode: 'all',
            blocked: [],
            allowed: enabledIds,
            updatedAt: new Date().toISOString()
          };
        } else if (blockedIds.length === thirdPartyIndexers.length) {
          nextPermissions = {
            mode: 'none',
            blocked: [...blockedIds],
            allowed: [],
            updatedAt: new Date().toISOString()
          };
        } else {
          nextPermissions = {
            mode: 'all',
            blocked: [...blockedIds],
            allowed: enabledIds,
            updatedAt: new Date().toISOString()
          };
        }
      } else if (indexingPermissionsState) {
        nextPermissions = {
          ...indexingPermissionsState,
          updatedAt: new Date().toISOString()
        };
      }

      if (makePublic !== isCurrentlyPublic) {
        await handleTogglePublic(sharingFile);
        await loadFileMetadata([sharingFile]);
      }

      // Update NSFW flag if it changed (only for public content)
      if (makePublic) {
        const currentNSFW = existingMetadata?.isNSFW === true;
        if (shareNSFW !== currentNSFW) {
          try {
            const response = await fetch(
              `${API_ENDPOINT}/api/aggregator/metadata-index`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  ...(authenticatedUser?.accessToken && {
                    'Authorization': `Bearer ${authenticatedUser.accessToken}`
                  })
                },
                body: JSON.stringify({
                  fileId: targetFileId,
                  isNSFW: shareNSFW,
                  isPublic: true
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error('❌ [ShareSettings] Failed to update NSFW flag:', errorText);
            } else {
              // Update local metadata cache
              setFileMetadataMap((prev) => {
                const next = new Map(prev);
                const targets = new Set<string>();
                targets.add(sharingFile.id);
                targets.add(targetFileId);
                if (sharingFile.backendFileId) {
                  targets.add(sharingFile.backendFileId);
                }
                if (existingMetadata?.fileId) {
                  targets.add(existingMetadata.fileId);
                }

                targets.forEach((key) => {
                  const current = next.get(key);
                  if (current) {
                    next.set(key, {
                      ...current,
                      isNSFW: shareNSFW
                    });
                  }
                });

                return next;
              });
            }
          } catch (nsfwError) {
            console.error('❌ [ShareSettings] Failed to update NSFW flag:', nsfwError);
            // Don't throw - this is non-critical
          }
        }
      }

      if (makePublic && nextPermissions) {
        try {
          // Retry on 429 (rate limit) errors with exponential backoff
          const { retry: retryHelper } = await import('../../../utils/helpers');
          
          const response = await retryHelper(
            async () => {
              const res = await fetch(
                `${API_ENDPOINT}/api/third-party/files/${encodeURIComponent(targetFileId)}/index-visibility`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    indexingPermissions: nextPermissions
                  })
                }
              );

              // If 429, throw to trigger retry
              if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
                const error = new Error(`Rate limited (429). ${delay ? `Retry after ${delay}ms` : 'Retrying...'}`);
                (error as any).status = 429;
                (error as any).retryAfter = delay;
                throw error;
              }

              if (!res.ok) {
                const errorText = await res.text().catch(() => res.statusText);
                throw new Error(errorText || `Failed to update index visibility (${res.status})`);
              }

              return res;
            },
            3, // maxAttempts
            2000 // baseDelay (2 seconds)
          );
        } catch (apiError) {
          const message = apiError instanceof Error ? apiError.message : 'Failed to update index visibility';
          setIndexerError(message);
          console.error('❌ [Sharing] Failed to update third-party visibility via API:', apiError);
          throw apiError;
        }
      }

      if (nextPermissions) {
        setFileMetadataMap((prev) => {
          const next = new Map(prev);
          const targets = new Set<string>();
          targets.add(sharingFile.id);
          targets.add(targetFileId);
          if (sharingFile.backendFileId) {
            targets.add(sharingFile.backendFileId);
          }
          if (existingMetadata?.fileId) {
            targets.add(existingMetadata.fileId);
          }

          targets.forEach((key) => {
            const current = next.get(key);
            if (current) {
              next.set(key, {
                ...current,
                indexingPermissions: nextPermissions
              });
            }
          });

          return next;
        });
        setIndexingPermissionsState(nextPermissions);
      }

      void refreshMetadataInBackground(fileForRefresh, {
        forceSync: true,
        refreshIndexers: true,
      });

      closeShareSettings();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update sharing settings';
      setError(message);
      console.error('❌ [Sharing] Failed to update sharing settings:', error);
    } finally {
      setIsSavingShare(false);
    }
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
