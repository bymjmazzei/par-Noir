/**
 * Metadata hydration for files already discovered by loadFiles.
 *
 * Prefers the Google Drive owner index (dashboard reads companion metadata
 * straight from Drive, not from the aggregator API) and falls back to the local
 * MetadataIndexService.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { MetadataIndexService } from '../../../services/metadata/MetadataIndexService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../../types/aggregator';
import { type DriveAccountState } from '../FileStorageAggregatorTypes';

export interface ActiveBackendEntry {
  backendId: string | null;
  backend: GoogleDriveBackend | null;
  account: DriveAccountState | null;
  keyPrefix: string | null;
}

export interface UseLoadFileMetadataParams {
  aggregatorService: FileAggregatorService | null;
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  metadataIndexService: MetadataIndexService | null;
  resolveActiveBackendEntry: () => ActiveBackendEntry;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
  pnIdentifierRef: React.MutableRefObject<string | null>;
}

export function useLoadFileMetadata({
  aggregatorService,
  authenticatedUser,
  resolvedAuth,
  metadataIndexService,
  resolveActiveBackendEntry,
  resolveOwnerApiToken,
  makeShareTokenCacheKey,
  setFileMetadataMap,
  shareTokenCache,
  pnIdentifierRef,
}: UseLoadFileMetadataParams) {
  return React.useCallback(async (filesToLoad: AggregatedFile[]) => {
    try {
      console.log('📋 [Metadata] Loading file metadata...', { fileCount: filesToLoad.length });
      const { backend, backendId, keyPrefix } = resolveActiveBackendEntry();
      // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (backend && backend.isConnected() && credentials?.pnName) {
        try {
          const { GoogleDriveMetadataService } = await import('../../../services/storage/GoogleDriveMetadataService');
          let ensuredToken: string | null = null;
          if (typeof backend.ensureAccessToken === 'function') {
            ensuredToken = await backend.ensureAccessToken();
          }
          const token = ensuredToken;

          if (token) {
            console.log('✅ [Metadata] Google Drive connected, loading owner index...');
            let pnIdentifier: string | undefined;
            
            // Use VolumeIdGenerator for consistent pnIdentifier generation (same as desktop app)
            try {
              const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
              const sessionId = authenticatedUser?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              
              // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth or authenticatedUser (public)
              const publicKey = resolvedAuth?.publicKey || authenticatedUser?.publicKey;
              
              if (credentials?.pnName && credentials?.passcode && publicKey) {
                pnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(publicKey);
                console.log(`✅ [Metadata] Generated pN identifier (VolumeIdGenerator): ${(pnIdentifier || '').substring(0, 8)}...`);
                console.log(`📁 [Metadata] Expected folder: "par Noir - ${(pnIdentifier || '').substring(0, 8)}..."`);
                
                // Also log fallback for comparison
                if (pnIdentifierRef.current) {
                  // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
                  const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
                  if (fallbackId !== pnIdentifier) {
                    console.warn(`⚠️ [Metadata] Identifier mismatch! Correct: ${(pnIdentifier || '').substring(0, 8)}..., Fallback: ${(fallbackId || '').substring(0, 8)}...`);
                    console.warn(`⚠️ [Metadata] Using CORRECT identifier: ${(pnIdentifier || '').substring(0, 8)}...`);
                  }
                }
              } else {
                console.warn('⚠️ [Metadata] Missing credentials for volume ID generation:', {
                  hasPnName: !!credentials?.pnName,
                  hasPasscode: !!credentials?.passcode,
                  hasPublicKey: !!publicKey,
                  hasResolvedAuth: !!resolvedAuth,
                  hasAuthenticatedUser: !!authenticatedUser
                });
              }
            } catch (volumeIdError) {
              console.warn('⚠️ [Metadata] Failed to generate volume ID, using fallback:', volumeIdError);
            }
            
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            // If credentials aren't available, we cannot generate the identifier
            if (!pnIdentifier) {
              console.warn('⚠️ [Metadata] Cannot generate standardized pN identifier - credentials required');
              console.warn('⚠️ [Metadata] Metadata indexing skipped - credentials must be available');
              return;
            }

            // Owner index is API Sheets only (no client Drive JSON). On 403/409
            // under custody this returns null and we fall through below.
            const ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndexFromContentClasses(
              pnIdentifier,
              resolveOwnerApiToken()
            );

            if (ownerIndex && ownerIndex.files) {
              const metadataMap = new Map<string, PublicMetadata>();
              const indexMap = new Map<string, any>();
              ownerIndex.files.forEach(entry => {
                indexMap.set(entry.googleDriveFileId, entry);
              });

              for (const file of filesToLoad) {
                const indexEntry = indexMap.get(file.backendFileId);
                if (indexEntry) {
                  const publicMetadata: PublicMetadata = {
                    fileId: indexEntry.fileId || file.id,
                    backend: file.backend,
                    backendFileId: indexEntry.googleDriveFileId,
                    name: indexEntry.originalName || indexEntry.fileName,
                    description: indexEntry.description,
                    keywords: indexEntry.tags || [],
                    uploadDate: indexEntry.uploadedAt,
                    fileType: indexEntry.mimeType?.split('/')[0] || 'other',
                    isPublic: indexEntry.visibility === 'public',
                    creator: indexEntry.owner?.did ? {
                      '@type': 'Person',
                      '@id': indexEntry.owner.did,
                      identifier: {
                        '@type': 'PropertyValue',
                        name: 'DID',
                        value: indexEntry.owner.did
                      }
                    } : undefined,
                    thumbnail: indexEntry.thumbnail,
                    publicToken: indexEntry.publicToken,
                    engagement: indexEntry.engagement,
                    inReplyTo: indexEntry.inReplyTo,
                    repostOf: indexEntry.repostOf,
                    isPartOf: indexEntry.isPartOf,
                    thumbnailFileId: (indexEntry as any).thumbnailFileId || null,
                    '@context': ['https://schema.org/'],
                    '@type': 'CreativeWork',
                    '@id': `https://parnoir.com/resource/${indexEntry.fileId || file.id}`
                  };
                  metadataMap.set(file.id, publicMetadata);

                  if (indexEntry.publicToken) {
                    try {
                      const token = typeof indexEntry.publicToken === 'string'
                        ? JSON.parse(indexEntry.publicToken)
                        : indexEntry.publicToken;
                      const cacheKey = makeShareTokenCacheKey(file.backend || '', file.backendFileId);
                      shareTokenCache.current.set(cacheKey, token);
                      console.log('💾 [Metadata] Cached share token from owner index for file:', file.id);
                    } catch (e) {
                      console.warn('⚠️ [Metadata] Failed to cache token from owner index:', e);
                    }
                  }
                }
              }

              const normalized = new Map<string, PublicMetadata>();
              metadataMap.forEach((item, key) => {
                normalized.set(key, item);
                if (item.backendFileId && item.backendFileId !== key) {
                  normalized.set(item.backendFileId, item);
                }
                if (item.fileId && item.fileId !== key) {
                  normalized.set(item.fileId, item);
                }
              });
              setFileMetadataMap(normalized);
              return;
            }
          }
        } catch (ownerIndexError) {
          console.warn('Failed to load from owner index, falling back to metadata service:', ownerIndexError);
        }
      }

      if (!metadataIndexService) {
        return;
      }

      await metadataIndexService.initialize();

      try {
        const preferredDid =
          resolvedAuth?.publicKey
            ? (resolvedAuth.publicKey.startsWith('did:') ? resolvedAuth.publicKey : `did:key:${resolvedAuth.publicKey}`)
            : authenticatedUser?.id && authenticatedUser.id.startsWith('did:')
              ? authenticatedUser.id
              : undefined;

        // Dashboard reads metadata directly from Google Drive, not from aggregator API
        // The aggregator API is for browser app and third-party consumers
        // Skip syncFromCentralAggregator - dashboard should read companion metadata from Google Drive files
      } catch (centralSyncError) {
        console.warn('⚠️ [Metadata] Central aggregator sync failed (non-blocking):', centralSyncError);
      }

      const metadataMap = new Map<string, PublicMetadata>();
      const allPublicMetadata = await metadataIndexService.getAllPublicMetadata();
      allPublicMetadata.forEach((item) => {
        if (!item.fileId) {
          return;
        }
        metadataMap.set(item.fileId, item);
        if (item.backendFileId && item.backendFileId !== item.fileId) {
          metadataMap.set(item.backendFileId, item);
        }
      });
      for (const file of filesToLoad) {
        const candidateIds = new Set<string>([file.id]);
        if (file.backendFileId) {
          candidateIds.add(file.backendFileId);
        }

        let metadata: PublicMetadata | null = null;
        for (const candidateId of candidateIds) {
          if (metadataMap.has(candidateId)) {
            metadata = metadataMap.get(candidateId)!;
            break;
          }
          const fetched = await metadataIndexService.getFileMetadata(candidateId);
          if (fetched) {
            metadataMap.set(candidateId, fetched);
            if (fetched.fileId && fetched.fileId !== candidateId) {
              metadataMap.set(fetched.fileId, fetched);
            }
            if (fetched.backendFileId && fetched.backendFileId !== candidateId) {
              metadataMap.set(fetched.backendFileId, fetched);
            }
            metadata = fetched;
            break;
          }
        }

        if (!metadata && metadataIndexService) {
          const fetched = await metadataIndexService.getFileMetadata(file.id);
          if (fetched) {
            metadataMap.set(file.id, fetched);
            if (fetched.backendFileId && fetched.backendFileId !== file.id) {
              metadataMap.set(fetched.backendFileId, fetched);
            }
          }
        }
      }
      setFileMetadataMap(new Map(metadataMap));
    } catch (err) {
      console.error('Failed to load file metadata:', err);
    }
  }, [aggregatorService, resolvedAuth, authenticatedUser, metadataIndexService, resolveActiveBackendEntry]);
}
