/**
 * Publish / unpublish a single file.
 *
 * Making a file public builds its JSON-LD public metadata, ensures a share token
 * exists (reusing the upload-time cache when possible), submits the metadata to
 * the index, and mirrors it into the Drive public index. Making it private just
 * removes it from the index.
 *
 * The Drive public index is a cache — the API database is the source of truth —
 * so a failed mirror is reported but never rolls back the publish.
 *
 * Extracted verbatim from `useShareAndIndexing` so the hook can stay focused on
 * modal state; every dependency it touches is passed in explicitly.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../../services/aggregator/FileAggregatorService';
import type { EncryptionService } from '../../../../services/aggregator/EncryptionService';
import type { MetadataIndexService } from '../../../../services/metadata/MetadataIndexService';
import type { CompanionMetadata } from '../../../../services/storage/GoogleDriveMetadataService';
import { API_ENDPOINT } from '../../../../config/api';
import {
  AggregatedFile,
  AuthSession,
  PublicMetadata,
  ShareToken,
  EncryptedFilePackage,
} from '../../../../types/aggregator';
import { resolveOwnerApiToken } from '../../../../services/ownerApiToken';

export interface TogglePublicVisibilityDeps {
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
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  loadFileMetadata: (filesToLoad: AggregatedFile[]) => Promise<void>;
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
}

export async function togglePublicVisibility(
  file: AggregatedFile,
  {
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
  }: TogglePublicVisibilityDeps
): Promise<void> {
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

      const { retry: retryHelper } = await import('../../../../utils/helpers');

      // Run POST and PUT in parallel - they're independent operations
      const [indexResult, putResult] = await Promise.allSettled([
        // POST to submit metadata
        metadataIndexService.indexFile(file, publicMetadata, metadataPnIdentifier),
        // PUT to explicitly update isPublic (ensures database is updated even if POST didn't properly update existing entry)
        retryHelper(
          async () => {
            const ownerToken = resolveOwnerApiToken();
            const res = await fetch(
              `${API_ENDPOINT}/api/aggregator/metadata-index/${encodeURIComponent(targetFileId)}${file.backend ? `?accountId=${encodeURIComponent(file.backend || '')}` : ''}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  ...(ownerToken && {
                    'Authorization': `Bearer ${ownerToken}`
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
              setSuccessMessage(data.message || "Content is under copyright review. You'll be notified when it's decided.");
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
              const { GoogleDriveMetadataService } = await import('../../../../services/storage/GoogleDriveMetadataService');

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
}
