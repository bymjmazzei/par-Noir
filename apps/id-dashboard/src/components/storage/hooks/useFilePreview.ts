/**
 * Inline previews (and the full-file viewer trigger) for FileStorageAggregator.
 *
 * Preview decryption has two tiers on purpose: the share token (cheap, works for
 * anything already published) and an owner-key fallback that downloads and
 * decrypts private files. Both are needed — owners see files that have no token.
 *
 * Previews for images and videos are kicked off automatically as files load, and
 * every blob URL is revoked on unmount.
 */
import React, { useEffect } from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { EncryptionService } from '../../../services/aggregator/EncryptionService';
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken } from '../../../types/aggregator';
import { isImageFile, isVideoFile } from '../FileStorageAggregatorHelpers';

export interface UseFilePreviewParams {
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  encryptionService: EncryptionService | null;
  activeBackendId: string | null;
  files: AggregatedFile[];
  fileMetadataMap: Map<string, PublicMetadata>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  filePreviewUrls: Map<string, string>;
  setFilePreviewUrls: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  loadingPreviews: Set<string>;
  setLoadingPreviews: React.Dispatch<React.SetStateAction<Set<string>>>;
  setViewingFile: React.Dispatch<React.SetStateAction<AggregatedFile | null>>;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  loadFileMetadata: (filesToLoad: AggregatedFile[]) => Promise<void>;
  /** Shared ref owned by FileStorageAggregator. */
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
}

export function useFilePreview({
  authenticatedUser,
  resolvedAuth,
  aggregatorService,
  encryptionService,
  activeBackendId,
  files,
  fileMetadataMap,
  setFileMetadataMap,
  filePreviewUrls,
  setFilePreviewUrls,
  loadingPreviews,
  setLoadingPreviews,
  setViewingFile,
  makeShareTokenCacheKey,
  loadFileMetadata,
  shareTokenCache,
}: UseFilePreviewParams) {
  const previewRetryCounts = React.useRef<Map<string, number>>(new Map());

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

  return {
    handleViewFile,
    loadFilePreview,
  };
}

export type UseFilePreviewResult = ReturnType<typeof useFilePreview>;
