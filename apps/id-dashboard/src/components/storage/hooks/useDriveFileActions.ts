/**
 * Per-file actions for FileStorageAggregator.
 *
 * Covers everything the user can do to an already-uploaded file: edit metadata,
 * view/preview, download, set as profile image, move to another cloud, select,
 * and delete (single + bulk).
 *
 * Preview decryption has two tiers on purpose: the share token (cheap, works for
 * anything already published) and an owner-key fallback that downloads and
 * decrypts private files. Both are needed — owners see files that have no token.
 */
import React, { useEffect } from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { EncryptionService } from '../../../services/aggregator/EncryptionService';
import type { CompanionMetadata } from '../../../services/storage/GoogleDriveMetadataService';
import { ownerFetch } from '../../../services/ownerApiService';
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken, FeedCategory } from '../../../types/aggregator';
import { isImageFile, isVideoFile } from '../FileStorageAggregatorHelpers';
import {
  EMPTY_EDIT_FORM,
  type DriveAccountState,
  type EditFormState,
} from '../FileStorageAggregatorTypes';

export interface UseDriveFileActionsParams {
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  encryptionService: EncryptionService | null;
  driveAccounts: DriveAccountState[];
  activeBackendId: string | null;
  files: AggregatedFile[];
  filesByBackend: Map<string, AggregatedFile[]>;
  fileMetadataMap: Map<string, PublicMetadata>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  filePreviewUrls: Map<string, string>;
  setFilePreviewUrls: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  loadingPreviews: Set<string>;
  setLoadingPreviews: React.Dispatch<React.SetStateAction<Set<string>>>;
  editingFile: AggregatedFile | null;
  setEditingFile: React.Dispatch<React.SetStateAction<AggregatedFile | null>>;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  setViewingFile: React.Dispatch<React.SetStateAction<AggregatedFile | null>>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsBulkDeleteMode: React.Dispatch<React.SetStateAction<boolean>>;
  setOpenMenuFor: React.Dispatch<React.SetStateAction<string | null>>;
  actionMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  cloudPnIdentifier: string | null;
  moveDestKey: string;
  setMoveDestKey: React.Dispatch<React.SetStateAction<string>>;
  checkDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => boolean;
  requireDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => void;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  loadFileMetadata: (filesToLoad: AggregatedFile[]) => Promise<void>;
  /** Shared refs owned by FileStorageAggregator. */
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
  loadFilesRef: React.MutableRefObject<(() => Promise<void>) | null>;
  loadFiles: () => Promise<void>;
}

export function useDriveFileActions({
  authenticatedUser,
  resolvedAuth,
  aggregatorService,
  encryptionService,
  driveAccounts,
  activeBackendId,
  files,
  filesByBackend,
  fileMetadataMap,
  setFileMetadataMap,
  filePreviewUrls,
  setFilePreviewUrls,
  loadingPreviews,
  setLoadingPreviews,
  editingFile,
  setEditingFile,
  editForm,
  setEditForm,
  setViewingFile,
  selectedFiles,
  setSelectedFiles,
  setIsBulkDeleteMode,
  setOpenMenuFor,
  actionMenuRef,
  setError,
  setSuccessMessage,
  setIsLoading,
  cloudPnIdentifier,
  moveDestKey,
  setMoveDestKey,
  checkDeviceCapability,
  requireDeviceCapability,
  resolveOwnerApiToken,
  makeShareTokenCacheKey,
  loadFileMetadata,
  shareTokenCache,
  loadFilesRef,
  loadFiles,
}: UseDriveFileActionsParams) {
  const previewRetryCounts = React.useRef<Map<string, number>>(new Map());

  const handleEditMetadata = (file: AggregatedFile) => {
    const metadata = fileMetadataMap.get(file.id);

    // Extract location data if present
    const location = (metadata as any)?.locationCreated || (metadata as any)?.schema?.locationCreated;
    const locationName = location?.name || '';
    const locationAddress = location?.address ?
      `${location.address.addressLocality || ''}${location.address.addressRegion ? ', ' + location.address.addressRegion : ''}${location.address.addressCountry ? ', ' + location.address.addressCountry : ''}`.trim() : '';

    // Extract genre (can be array or string)
    const genre = (metadata as any)?.genre || (metadata as any)?.schema?.genre || [];
    const genreString = Array.isArray(genre) ? genre.join(', ') : (typeof genre === 'string' ? genre : '');

    // Extract category (prefer feedCategories, fallback to category)
    const feedCategories = (metadata as any)?.feedCategories || [];
    const category = feedCategories.length > 0 ? feedCategories[0] : ((metadata as any)?.category || '');

    // Extract license (can be object with name or string)
    const license = (metadata as any)?.license || (metadata as any)?.schema?.license || '';
    const licenseString = typeof license === 'object' && license?.name ? license.name : (typeof license === 'string' ? license : '') || 'all-rights-reserved';

    setEditForm({
      name: metadata?.name || file.encrypted ? file.originalName || file.name.replace('.encrypted', '') : file.name,
      description: metadata?.description || '',
      tags: (metadata?.keywords || metadata?.tags || []).join(', '),
      genre: genreString,
      category: category as FeedCategory | '',
      locationName: locationName,
      locationAddress: locationAddress,
      license: licenseString
    });
    setEditingFile(file);
  };

  const handleSaveMetadata = async () => {
    if (!editingFile) return;

    try {
      requireDeviceCapability('drive.upload');
      setIsLoading(true);
      setError(null);

      // Parse tags from comma-separated string
      const tags = editForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Parse genre from comma-separated string
      const genre = editForm.genre
        .split(',')
        .map(g => g.trim())
        .filter(g => g.length > 0);

      // Extract subjects from description, tags, and keywords
      const { extractSubjects } = await import('../../../utils/subjectExtractor');
      const subjects = extractSubjects(
        editForm.description,
        tags,
        tags // keywords same as tags
      );

      // Validate required category
      if (!editForm.category) {
        setError('Category is required');
        setIsLoading(false);
        return;
      }

      // Build location object if provided (without lat/lng)
      let locationCreated = undefined;
      if (editForm.locationName || editForm.locationAddress) {
        locationCreated = {
          '@type': 'Place',
          ...(editForm.locationName && { name: editForm.locationName }),
          ...(editForm.locationAddress && {
            address: {
              '@type': 'PostalAddress',
              addressLocality: editForm.locationAddress.split(',')[0]?.trim() || '',
              addressRegion: editForm.locationAddress.split(',')[1]?.trim() || '',
              addressCountry: editForm.locationAddress.split(',')[2]?.trim() || ''
            }
          })
        };
      }

      // Update via API endpoint
      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }
      const metaPath = `/api/aggregator/metadata-index/${editingFile.id}`;
      const response = await ownerFetch(accessToken, 'PUT', metaPath, {
          name: editForm.name,
          description: editForm.description,
          keywords: tags,
          tags: tags,
          genre: genre.length > 0 ? genre : undefined,
          feedCategories: editForm.category ? [editForm.category as FeedCategory] : undefined,
          category: editForm.category || undefined,
          locationCreated: locationCreated,
          license: editForm.license || undefined,
          subjects: subjects.length > 0 ? subjects : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update metadata: ${errorText}`);
      }

      const updatedMetadata = await response.json();

      // Also update Google Drive metadata file if we have access
      const backend = aggregatorService?.getBackend(editingFile.backend);
      // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (backend && backend.isConnected() && credentials?.pnName) {
        try {
          const { GoogleDriveMetadataService } = await import('../../../services/storage/GoogleDriveMetadataService');
          const token = (backend as any).token || localStorage.getItem('google_drive_token');

          if (token) {
            const publicKey = resolvedAuth?.publicKey;
            if (!publicKey) {
              throw new Error('Public identity key is required to update metadata');
            }
            // Generate stable pN identifier using VolumeIdGenerator for consistency
            let pnIdentifier: string | undefined;
            try {
              const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
              const sessionId = authenticatedUser?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;

              // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth (public)
              if (credentials?.pnName && credentials?.passcode) {
                pnIdentifier = await VolumeIdGenerator.generateVolumeId({
                  pnName: credentials.pnName,
                  passcode: credentials.passcode,
                  publicKey
                });
              }
            } catch (volumeIdError) {
              console.warn('⚠️ [UpdateMetadata] Failed to generate volume ID:', volumeIdError);
            }

            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            if (!pnIdentifier) {
              console.warn('⚠️ [UpdateMetadata] Cannot generate standardized pN identifier - credentials required');
              console.warn('⚠️ [UpdateMetadata] Metadata update skipped - pN identifier required');
              return;
            }

            // Get current metadata from fileMetadataMap or construct from file
            let currentMetadata = fileMetadataMap.get(editingFile.id);

            // If no metadata exists, create a basic structure
            if (!currentMetadata) {
              currentMetadata = {
                fileId: editingFile.id,
                backend: editingFile.backend,
                backendFileId: editingFile.backendFileId,
                name: editForm.name,
                description: editForm.description,
                keywords: tags,
                tags: tags,
                uploadDate: new Date().toISOString(),
                fileType: editingFile.mimeType?.split('/')[0] || 'other',
                isPublic: false,
                creator: {
                  '@type': 'Person',
                  '@id': publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`,
                  identifier: {
                    '@type': 'PropertyValue',
                    name: 'DID',
                    value: publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`
                  }
                }
              } as PublicMetadata;
            }

            // Parse genre for companion metadata
            const genre = editForm.genre
              .split(',')
              .map(g => g.trim())
              .filter(g => g.length > 0);

            // Build location object for companion metadata (without lat/lng)
            let locationCreated = undefined;
            if (editForm.locationName || editForm.locationAddress) {
              locationCreated = {
                '@type': 'Place',
                ...(editForm.locationName && { name: editForm.locationName }),
                ...(editForm.locationAddress && {
                  address: {
                    '@type': 'PostalAddress',
                    addressLocality: editForm.locationAddress.split(',')[0]?.trim() || '',
                    addressRegion: editForm.locationAddress.split(',')[1]?.trim() || '',
                    addressCountry: editForm.locationAddress.split(',')[2]?.trim() || ''
                  }
                })
              };
            }

            // Preserve existing schema metadata (static/auto-extracted fields)
            const existingSchema = (currentMetadata as any)?.schema || {};

            // Update companion metadata file
            const companionMetadata: CompanionMetadata = {
              fileId: editingFile.id,
              googleDriveFileId: editingFile.backendFileId,
              fileName: editingFile.name,
              originalName: editForm.name,
              mimeType: editingFile.mimeType || 'application/octet-stream',
              size: parseInt(editingFile.size?.toString() || '0', 10),
              visibility: currentMetadata.isPublic ? 'public' : 'private',
              uploadedAt: currentMetadata.uploadDate || new Date().toISOString(),
              owner: {
                did: publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`,
                identifier: pnIdentifier
              },
              tags: tags,
              description: editForm.description,
              metadata: {},
              publicToken: currentMetadata.publicToken,
              thumbnail:
                typeof currentMetadata.thumbnail === 'string'
                  ? currentMetadata.thumbnail
                  : currentMetadata.thumbnail?.['@id'],
              inReplyTo: currentMetadata.inReplyTo,
              repostOf: currentMetadata.repostOf,
              isPartOf: currentMetadata.isPartOf,
              indexingPermissions: currentMetadata.indexingPermissions,
              schema: {
                ...existingSchema, // Preserve auto-extracted technical metadata (width, height, duration, etc.)
                ...(genre.length > 0 && { genre }),
                ...(editForm.category && { category: editForm.category }),
                ...(editForm.category && { feedCategories: [editForm.category as FeedCategory] }),
                ...(locationCreated && { locationCreated }),
                ...(editForm.license && { license: editForm.license }),
                // Preserve existing NSFW value (managed via Share Settings)
                ...(currentMetadata.isNSFW !== undefined && { isNSFW: currentMetadata.isNSFW })
              },
              engagement: currentMetadata.engagement || {
                views: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                lastUpdated: currentMetadata.uploadDate || new Date().toISOString()
              }
            };

            // Always update companion metadata (even for private files)
              await GoogleDriveMetadataService.createCompanionMetadataFile(
                token,
                pnIdentifier,
                companionMetadata
              );

              // Always update owner index (contains ALL files)
              await GoogleDriveMetadataService.updateOwnerFileIndex(
                token,
                pnIdentifier,
                companionMetadata
              );

              // Update public index if public
              if (currentMetadata.isPublic) {
                await GoogleDriveMetadataService.updatePublicFileIndex(
                  token,
                  pnIdentifier,
                  companionMetadata
                );
              }
          }
        } catch (driveError) {
          console.warn('Failed to update Google Drive metadata (non-critical):', driveError);
          // Don't fail the whole operation if Google Drive update fails
        }
      }

      // Update local state
      if (updatedMetadata.metadata) {
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          const metadata = updatedMetadata.metadata;
          next.set(editingFile.id, metadata);
          if (editingFile.backendFileId && editingFile.backendFileId !== editingFile.id) {
            next.set(editingFile.backendFileId, metadata);
          }
          if (metadata.fileId && metadata.fileId !== editingFile.id) {
            next.set(metadata.fileId, metadata);
          }
          if (metadata.backendFileId && metadata.backendFileId !== editingFile.id) {
            next.set(metadata.backendFileId, metadata);
          }
          return next;
        });
      }

      // Refresh files to show updated metadata
      if (loadFilesRef.current) {
        loadFilesRef.current();
      }

      setEditingFile(null);
      setEditForm({ ...EMPTY_EDIT_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update metadata');
      console.error('Error updating metadata:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewFile = async (file: AggregatedFile) => {
    setViewingFile(file);
  };

  const loadFilePreview = async (file: AggregatedFile) => {
    // Skip if already loading or loaded
    if (loadingPreviews.has(file.id) || filePreviewUrls.has(file.id)) {
      return;
    }

    // Load previews for images, videos, and PDFs - check mimeType and file extension
    const mimeType = file.mimeType || '';
    const fileName = file.originalName || file.name || '';
    const isImage = isImageFile(mimeType, fileName);
    const isVideo = isVideoFile(mimeType, fileName);
    if (!isImage && !isVideo) {
      return;
    }

    setLoadingPreviews(prev => new Set(prev).add(file.id));

    try {
      let previewUrl: string | null = null;

      // ---------- Attempt 1: Token-based preview (preferred) ----------
      const metadata = fileMetadataMap.get(file.id);
      let token: any = null;

      if (metadata?.publicToken) {
        token = typeof metadata.publicToken === 'string'
          ? JSON.parse(metadata.publicToken)
          : metadata.publicToken;
      }

      if (!token) {
        const cacheKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
        token = shareTokenCache.current.get(cacheKey);
      }

      if (!token) {
        const currentRetries = previewRetryCounts.current.get(file.id) || 0;
        if (currentRetries < 1) {
          console.log('🔁 [Preview] Share token missing, refreshing metadata once...', { fileId: file.id });
          previewRetryCounts.current.set(file.id, currentRetries + 1);
          try {
            await loadFileMetadata([file]);
          } catch (refreshError) {
            console.warn('⚠️ [Preview] Metadata refresh failed:', refreshError);
          }

          const refreshedMetadata = fileMetadataMap.get(file.id);
          if (refreshedMetadata?.publicToken) {
            token = typeof refreshedMetadata.publicToken === 'string'
              ? JSON.parse(refreshedMetadata.publicToken)
              : refreshedMetadata.publicToken;
          } else {
            const refreshedCacheKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
            token = shareTokenCache.current.get(refreshedCacheKey) || null;
          }
        }
      }

      if (token) {
        try {
          console.log('✅ [Preview] Token found, decrypting...', {
            fileId: file.id,
            fileName: file.name,
            hasShareKey: !!token.shareKey,
            hasShareEncrypted: !!token.shareEncrypted
          });

          const { decryptWithToken } = await import('../../../utils/tokenDecryption');
          const decryptedBlob = await decryptWithToken(token);
          previewUrl = URL.createObjectURL(decryptedBlob);
          previewRetryCounts.current.delete(file.id);
        } catch (tokenError) {
          console.warn('⚠️ [Preview] Token-based decryption failed, will attempt owner fallback:', tokenError);
        }
      }

      // ---------- Attempt 2: Owner fallback (private files) ----------
      if (!previewUrl) {
        try {
          if (!aggregatorService || !encryptionService) {
            throw new Error('Aggregator or encryption service not available');
          }

          const sessionId = authenticatedUser?.id;
          let sessionPublicKey = resolvedAuth?.publicKey || authenticatedUser?.publicKey || (authenticatedUser?.id?.startsWith('did:key:') ? authenticatedUser.id : undefined);

          if (!sessionId || !sessionPublicKey) {
            // Try secure storage as last resort
            try {
              const { SecureStorage } = await import('../../../utils/storage');
              const storage = new SecureStorage();
              await storage.init();
              const session = await storage.getCurrentSession();
              if (session) {
                if (!sessionPublicKey) {
                  sessionPublicKey = (session as any).publicKey || (session.id && session.id.startsWith('did:key:') ? session.id : undefined);
                }
              }
            } catch (storageError) {
              console.warn('⚠️ [Preview] Secure storage unavailable during fallback:', storageError);
            }
          }

          if (!sessionId || !sessionPublicKey) {
            throw new Error('Missing pN identity (id/publicKey) for owner decryption');
          }

          console.log('🔐 [Preview] Using owner fallback decryption...', {
            fileId: file.id,
            backendFileId: file.backendFileId,
            sessionId: sessionId.substring(0, 24) + '...',
            hasPublicKey: !!sessionPublicKey
          });

          const encryptedBlob = await aggregatorService.downloadFromBackend(
            file.backend,
            file.backendFileId
          );

          const encryptedPackageText = await encryptedBlob.text();
          const encryptedPackage = JSON.parse(encryptedPackageText);

          const session: AuthSession = {
            id: sessionId,
            publicKey: sessionPublicKey,
          };

          const { decryptedBlob, metadata } = await encryptionService.decryptFileFromDownload(
            encryptedPackage,
            session
          );

          previewUrl = URL.createObjectURL(decryptedBlob);
          previewRetryCounts.current.delete(file.id);

          // Cache metadata fields for future reference
          if (metadata?.publicToken) {
            try {
              const parsedToken = typeof metadata.publicToken === 'string'
                ? JSON.parse(metadata.publicToken)
                : metadata.publicToken;
              const fallbackCacheKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
              shareTokenCache.current.set(fallbackCacheKey, parsedToken);
            } catch (cacheError) {
              console.warn('⚠️ [Preview] Unable to cache token from owner metadata:', cacheError);
            }
          }

          setFileMetadataMap(prev => {
            const next = new Map(prev);
            const lookupKeys = [
              file.id,
              file.backendFileId && file.backendFileId !== file.id ? file.backendFileId : null,
            ].filter(Boolean) as string[];
            if (metadata?.fileId && !lookupKeys.includes(metadata.fileId)) {
              lookupKeys.push(metadata.fileId);
            }
            if (metadata?.backendFileId && !lookupKeys.includes(metadata.backendFileId)) {
              lookupKeys.push(metadata.backendFileId);
            }
            const existingKey = lookupKeys.find((key) => next.has(key));
            const existing = existingKey ? next.get(existingKey)! : ({} as PublicMetadata);
            const merged: PublicMetadata = {
              ...existing,
              thumbnail: existing.thumbnail || metadata?.thumbnail,
              name: existing.name || metadata?.originalName || file.originalName || file.name,
              description: existing.description || metadata?.description,
              publicToken: metadata?.publicToken || existing.publicToken,
            };
            lookupKeys.forEach((key) => {
              next.set(key, merged);
            });
            return next;
          });

          console.log('✅ [Preview] Owner fallback decryption successful');
        } catch (ownerError) {
          console.error('❌ [Preview] Owner fallback failed:', ownerError);
        }
      }

      if (previewUrl) {
        setFilePreviewUrls(prev => {
          const next = new Map(prev);
          next.set(file.id, previewUrl!);
          return next;
        });
      } else {
        console.warn('⚠️ [Preview] Unable to generate preview for file after all attempts:', file.id);
        setLoadingPreviews(prev => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
        return;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorDetails = {
        error: err,
        errorMessage: errorMessage,
        fileId: file.id,
        backendFileId: file.backendFileId,
        fileName: file.name
      };
      console.error('❌ [Preview] Failed to load file preview:', errorDetails);

      // Log stack trace if available
      if (err instanceof Error && err.stack) {
        console.error('❌ [Preview] Error stack:', err.stack);
      }

      // Don't set error state (it's not defined in this scope)
      // The UI will show the lock icon for files that fail to load
    } finally {
      setLoadingPreviews(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      if (filePreviewUrls.has(file.id)) {
        previewRetryCounts.current.delete(file.id);
      }
    }
  };


  // Auto-load previews for image/video files when files are loaded (since user owns them)
  useEffect(() => {
    if (files.length > 0) {
      console.log('🔄 [Auto-Preview] Checking files for auto-preview...', {
        fileCount: files.length,
        metadataMapSize: fileMetadataMap.size
      });
      // Load previews for all image/video/PDF files automatically (token-based, no credentials needed)
      files.forEach(file => {
        const mimeType = file.mimeType || '';
        const fileName = file.originalName || file.name || '';
        const isImage = isImageFile(mimeType, fileName);
        const isVideo = isVideoFile(mimeType, fileName);

        if ((isImage || isVideo) && !filePreviewUrls.has(file.id) && !loadingPreviews.has(file.id)) {
          console.log('🔄 [Auto-Preview] Loading preview for file:', file.id, file.name);
          loadFilePreview(file).catch(err => {
            // Silently fail for auto-preview - don't show error modal
            console.warn('⚠️ [Auto-Preview] Failed to load preview (non-critical):', err);
          });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, fileMetadataMap.size]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup all blob URLs
      filePreviewUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (file: AggregatedFile) => {
    if (!aggregatorService) {
      console.error('⚠️ [Download] Aggregator service unavailable');
      setError('Storage service not available. Try reconnecting your drive.');
      return;
    }

    console.log('📥 [Download] Starting download...', { fileName: file.name, fileId: file.backendFileId });

    // Resolve auth credentials - try multiple sources (same as upload)
    let pnName: string | null = null;
    let publicKey: string | null = null;
    let passcodeToUse: string | null = null;

    // SECURITY: Get credentials from SecureCredentialManager (secrets)
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;

    // Try 1: Use credentials and resolvedAuth (public data)
    if (credentials?.pnName && resolvedAuth?.publicKey) {
      pnName = credentials.pnName;
      publicKey = resolvedAuth.publicKey;
      passcodeToUse = credentials.passcode || null;
      console.log('✅ [Download] Using credentials and resolvedAuth');
    }

    // Try 2: Extract from authenticatedUser prop and credentials
    if (!pnName || !publicKey) {
      if (authenticatedUser && credentials) {
        pnName = credentials.pnName;
        publicKey = authenticatedUser.publicKey ||
          (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
        passcodeToUse = credentials.passcode || null;
        console.log('✅ [Download] Using authenticatedUser prop and credentials:', { pnName: !!pnName, publicKey: !!publicKey });
      }
    }

    // Try 3: Load from storage
    if (!pnName || !publicKey) {
      console.log('📥 [Download] Loading from storage...');
      try {
        const { SecureStorage } = await import('../../../utils/storage');
        const storage = new SecureStorage();
        await storage.init();
        const session = await storage.getCurrentSession();

        if (session) {
          // SECURITY: Get pnName from SecureCredentialManager (secrets), not from session storage
          const sessionId = session.id || (session as any)?.publicKey || null;
          const sessionCredentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          pnName = sessionCredentials?.pnName || null;
          publicKey = (session as any).publicKey ||
            (session.id && session.id.startsWith('did:key:') ? session.id : session.id) || null;
          console.log('✅ [Download] Loaded from storage:', { pnName: !!pnName, publicKey: !!publicKey });
        }
      } catch (err) {
        console.error('❌ [Download] Storage load failed:', err);
      }
    }

    // Final check
    if (!pnName || !publicKey) {
      console.error('❌ [Download] Could not resolve auth from any source');
      setError('Please unlock your pN first to decrypt files');
      return;
    }

    // Verify we have the stable pN identity (id + publicKey) required for decryption
    // The id (DID) is stable and doesn't change between sessions
    if (!authenticatedUser?.id || !publicKey) {
      console.error('❌ [Download] Missing stable identity (id or publicKey)');
      setError('Please unlock your pN first. The pN identity is required to decrypt files.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('📥 [Download] Proceeding with download', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasId: !!authenticatedUser?.id });

      // Download encrypted file from backend
      const encryptedBlob = await aggregatorService.downloadFromBackend(
        file.backend,
        file.backendFileId
      );

      console.log('📥 [Download] Encrypted file downloaded, size:', encryptedBlob.size);

      // Create session object for decryption using stable pN identity
      // We use id (DID) + publicKey for decryption, which are stable across sessions
      const session: AuthSession = {
        id: authenticatedUser!.id,
        publicKey: publicKey!,
        accessToken: authenticatedUser!.accessToken, // Keep for other uses, but not for decryption
        nickname: authenticatedUser?.nickname
      };

      console.log('📥 [Download] Attempting decryption with stable pN identity...', {
        sessionId: session.id?.substring(0, 20) + '...',
        hasId: !!session.id,
        hasPublicKey: !!session.publicKey
      });

      // Decrypt file using stable pN identity (id + publicKey)
      // The id (DID) is stable and doesn't change between sessions, ensuring consistent decryption
      if (!encryptionService) {
        setError('Encryption service not available');
        return;
      }

      // Parse the encrypted package from the blob
      const encryptedPackageText = await encryptedBlob.text();
      const encryptedPackage = JSON.parse(encryptedPackageText);

      // Decrypt using authenticated session token - no user input needed
      console.log('🔐 [Download] Starting decryption...', {
        hasId: !!session.id,
        idPreview: session.id?.substring(0, 20) + '...',
        hasPublicKey: !!session.publicKey,
        publicKeyPreview: session.publicKey?.substring(0, 20) + '...',
        encryptedPackageKeys: Object.keys(encryptedPackage),
        hasEncrypted: !!encryptedPackage.encrypted,
        encryptedLength: encryptedPackage.encrypted?.length,
        hasIv: !!encryptedPackage.iv,
        ivLength: encryptedPackage.iv?.length,
        hasSalt: !!encryptedPackage.salt,
        saltLength: encryptedPackage.salt?.length
      });

      let decryptedBlob: Blob;
      let metadata: any;
      try {
        const result = await encryptionService.decryptFileFromDownload(
          encryptedPackage,
          session
        );
        decryptedBlob = result.decryptedBlob;
        metadata = result.metadata;
      } catch (decryptError: any) {
        console.error('❌ [Download] Decryption failed:', {
          error: decryptError?.message || decryptError,
          errorName: decryptError?.name,
          stack: decryptError?.stack
        });
        const errorMsg = decryptError?.message || 'Unknown error';
        console.error('❌ [Download] Decryption failed:', {
          error: errorMsg,
          errorDetails: decryptError,
          fileId: file.id,
          backendFileId: file.backendFileId,
          fileName: file.name,
          hasSessionId: !!session?.id,
          hasPublicKey: !!session?.publicKey,
          stack: decryptError instanceof Error ? decryptError.stack : undefined
        });
        setError(`Failed to decrypt file: ${errorMsg}. This file may have been encrypted with a different method or credentials.`);
        return;
      }

      console.log('✅ [Download] Decryption successful, downloading file...', { originalName: metadata.originalName });

      // Download decrypted file
      const url = window.URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.originalName || file.name.replace('.encrypted', '');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('✅ [Download] File download initiated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download file';
      console.error('❌ [Download] Download failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetProfileImage = async (file: AggregatedFile) => {
    if (!authenticatedUser?.id) {
      setError('Please unlock your pN first');
      return;
    }
    if (!checkDeviceCapability('profile.write')) return;

    // Check if file is an image
    const mimeType = file.mimeType || '';
    const fileName = file.originalName || file.name || '';
    const isImage = isImageFile(mimeType, fileName);

    if (!isImage) {
      setError('Only image files can be set as profile image');
      return;
    }

    // Get fileId from metadata if available, otherwise use file.id
    const metadata = fileMetadataMap.get(file.id) ||
                     (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);
    const fileId = metadata?.fileId || file.id;

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }

      const ownerPnId = (() => {
        const pk = authenticatedUser?.publicKey || authenticatedUser?.id;
        if (!pk) return null;
        return String(pk).startsWith('pn-') ? String(pk) : `pn-${pk}`;
      })();
      if (!ownerPnId) {
        throw new Error('Missing identity identifier');
      }

      const response = await ownerFetch(accessToken, 'POST', '/api/profile/image', {
        userPnIdentifier: ownerPnId,
        fileId: fileId,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to set profile image' }));
        throw new Error(error.error || 'Failed to set profile image');
      }

      console.log('✅ [Profile Image] Profile image updated successfully');
      // Could show success message here if there's a success handler
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set profile image';
      console.error('❌ [Profile Image] Failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setOpenMenuFor(null);
      actionMenuRef.current = null;
    }
  };

  const handleMoveToCloud = async () => {
    const ownerToken = resolveOwnerApiToken();
    if (!cloudPnIdentifier || !ownerToken || !moveDestKey) {
      setError('Select a destination cloud and unlock your identity.');
      return;
    }
    const sep = moveDestKey.indexOf('|||');
    if (sep < 0) return;
    const destProvider = moveDestKey.slice(0, sep);
    const destAccountId = moveDestKey.slice(sep + 3);
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await ownerFetch(
        ownerToken,
        'POST',
        '/api/storage/migrate/files/start',
        {
          pnIdentifier: cloudPnIdentifier,
          fileIds,
          destProvider,
          destAccountId,
          mode: 'move'
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Move failed');
      }
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);
      setMoveDestKey('');
      await loadFiles();
      setSuccessMessage(`Moved ${fileIds.length} file(s) to ${destProvider}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async (backendId: string) => {
    if (!checkDeviceCapability('drive.upload')) return;

    const accountFiles = filesByBackend.get(backendId) || [];
    const filesToDelete = accountFiles.filter(file => selectedFiles.has(file.id));

    if (filesToDelete.length === 0) return;

    const fileCount = filesToDelete.length;
    if (!window.confirm(`Are you sure you want to delete ${fileCount} file${fileCount > 1 ? 's' : ''}? This action cannot be undone.`)) return;

    setIsLoading(true);
    setError(null);

    try {
      let successCount = 0;
      let failCount = 0;

      // Delete files sequentially
      for (const file of filesToDelete) {
        try {
          await handleDelete(file, true); // Skip confirmation for bulk delete
          successCount++;
        } catch (err: any) {
          failCount++;
          console.error(`[FileStorageAggregator] Error deleting file ${file.id}:`, err);
        }
      }

      // Clear selection and exit bulk delete mode
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);

      if (failCount > 0) {
        setError(`Deleted ${successCount} file${successCount !== 1 ? 's' : ''}, ${failCount} failed`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete files');
      console.error('[FileStorageAggregator] Bulk delete error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Select all files in current backend
  const selectAllFiles = (backendId: string) => {
    const accountFiles = filesByBackend.get(backendId) || [];
    const accountFilesIds = accountFiles.map(f => f.id);
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      accountFilesIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  // Deselect all files
  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  const handleDelete = async (file: AggregatedFile, skipConfirm: boolean = false) => {
    if (!file.backendFileId) {
      setError('Cannot delete file: missing file ID');
      return;
    }
    if (!checkDeviceCapability('drive.upload')) return;

    // Confirm deletion (skip confirmation if called from bulk delete)
    if (!skipConfirm) {
      const confirmed = window.confirm(`Are you sure you want to delete "${file.originalName || file.name}"? This action cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use backend directly to delete file (bypasses API token validation)
      const backend = aggregatorService?.getBackend(file.backend);
      if (!backend) {
        throw new Error(`Backend not found for ${file.backend}`);
      }

      if (!backend.isConnected()) {
        throw new Error('Backend is not connected');
      }

      console.log('🗑️ [Delete] Deleting file via API endpoint...', {
        fileId: file.backendFileId,
        fileName: file.name,
        backend: file.backend
      });

      // Use API endpoint for complete deletion (handles file, thumbnail, and metadata)
      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }

      const account = driveAccounts.find(acc => acc.backendId === file.backend);
      const accountId = account?.backendId;
      const accountIdParam = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';

      try {
        const deletePath = `/api/drive/files/${file.backendFileId}${accountIdParam}`;
        const response = await ownerFetch(accessToken, 'DELETE', deletePath);

        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          console.log('✅ [Delete] File deleted successfully via API (includes file, thumbnail, and metadata)', result);
        } else if (response.status === 401) {
          // Token expired - try fallback to direct backend deletion
          console.warn('⚠️ [Delete] Token expired - attempting fallback to direct backend deletion...');
          try {
            await backend.deleteFile(file.backendFileId);
            console.log('✅ [Delete] File deleted from Google Drive via backend (fallback)');

            // Try to remove from database via metadata-index endpoint
            try {
              const metaPath = `/api/aggregator/metadata-index/${file.backendFileId}`;
              const dbResponse = await ownerFetch(accessToken, 'DELETE', metaPath);
              if (dbResponse.ok) {
                console.log('✅ [Delete] File removed from database via fallback endpoint');
              }
            } catch (fallbackError) {
              console.warn('⚠️ [Delete] Fallback database removal failed:', fallbackError);
            }
          } catch (backendError) {
            throw new Error(`Failed to delete file: ${backendError instanceof Error ? backendError.message : 'Unknown error'}`);
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          // If API fails, try fallback to direct backend deletion
          console.warn(`⚠️ [Delete] API deletion failed (${response.status}): ${errorText} - attempting fallback...`);
          try {
            await backend.deleteFile(file.backendFileId);
            console.log('✅ [Delete] File deleted from Google Drive via backend (fallback)');
          } catch (backendError) {
            throw new Error(`Failed to delete file via API and fallback: ${errorText}`);
          }
        }
      } catch (apiError) {
        // If API call fails completely, try fallback to direct backend deletion
        console.warn('⚠️ [Delete] API deletion failed - attempting fallback to direct backend deletion:', apiError);
        try {
          await backend.deleteFile(file.backendFileId);
          console.log('✅ [Delete] File deleted from Google Drive via backend (fallback)');
        } catch (backendError) {
          throw new Error(`Failed to delete file: ${apiError instanceof Error ? apiError.message : 'API error'} and ${backendError instanceof Error ? backendError.message : 'backend error'}`);
        }
      }

      // Reload files after deletion
      if (loadFilesRef.current) {
        await loadFilesRef.current();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete file';
      console.error('❌ [Delete] Delete failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    handleEditMetadata,
    handleSaveMetadata,
    handleViewFile,
    loadFilePreview,
    handleDownload,
    handleSetProfileImage,
    handleMoveToCloud,
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    handleDelete,
  };
}

export type UseDriveFileActionsResult = ReturnType<typeof useDriveFileActions>;
