/**
 * Thumbnails and video blob state, generation, and preload.
 * Isolates thumbnail/video-asset logic so edits here don't affect discovery or feed filtering.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { IndexedFile } from '../types/aggregator';
import type { MediaDimensions } from '../utils/mediaScaling';
import type { ShareToken } from '../utils/tokenDecryption';
import { decryptPublicFeedMedia } from '../utils/publicMediaDecrypt';
import { createThumbnailFromBlob, createVideoThumbnailFromBlob } from '../utils/thumbnailUtils';
import { PNOAuthService } from '../services/pnOAuthService';
import { ownerGet } from '../services/ownerApiFetch';

export interface UseThumbnailsAndMediaParams {
  mediaFiles: IndexedFile[];
  thoughtsFiles: IndexedFile[];
  collectionsFiles: IndexedFile[];
  viewMode: 'grid' | 'feed';
}

export function useThumbnailsAndMedia({
  mediaFiles,
  thoughtsFiles,
  collectionsFiles,
  viewMode,
}: UseThumbnailsAndMediaParams) {
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [generatingThumbnails, setGeneratingThumbnails] = useState<Set<string>>(new Set());
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(new Map());
  const [videoPlaying, setVideoPlaying] = useState<Map<string, boolean>>(new Map());
  const [mediaDimensions, setMediaDimensions] = useState<Map<string, MediaDimensions>>(new Map());

  const thumbnailsRef = useRef<Map<string, string>>(new Map());
  const videoBlobsRef = useRef<Map<string, string>>(new Map());
  const generatingThumbnailsRef = useRef<Set<string>>(new Set());
  const generateThumbnailsForImagesRef = useRef<((files: IndexedFile[]) => Promise<void>) | null>(null);

  useEffect(() => {
    videoBlobsRef.current = videoBlobs;
  }, [videoBlobs]);
  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);
  useEffect(() => {
    generatingThumbnailsRef.current = generatingThumbnails;
  }, [generatingThumbnails]);

  const cleanupThumbnailsForFiles = useCallback((fileIds: string[]) => {
    setThumbnails((prev) => {
      const newMap = new Map(prev);
      fileIds.forEach((fileId) => {
        const thumbnailUrl = newMap.get(fileId);
        if (thumbnailUrl) {
          if (thumbnailUrl.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(thumbnailUrl);
            } catch (err) {
              if (import.meta.env.DEV) console.warn(`Failed to revoke thumbnail URL for ${fileId}:`, err);
            }
          }
          newMap.delete(fileId);
        }
      });
      return newMap;
    });
  }, []);

  const generateThumbnailsForImages = useCallback(
    async (files: IndexedFile[]) => {
      const CONCURRENCY = 3;
      let cursor = 0;

      const processOne = async (indexedFile: IndexedFile) => {
        const file = indexedFile.metadata;
        const isImage =
          file.fileType === 'image' ||
          !!(file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
        const isVideo =
          file.fileType === 'video' ||
          !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
        const hasValidToken =
          file.publicToken &&
          typeof file.publicToken === 'string' &&
          file.publicToken.trim().length > 0;
        const hasThumbnailFile = !!file.thumbnailFileId;
        const fileName = (file.name || file.title || '').toLowerCase();
        const isThumbnailFile = fileName.startsWith('thumb_');

        if (
          (!isImage && !isVideo) ||
          !hasValidToken ||
          thumbnailsRef.current.has(file.fileId) ||
          generatingThumbnailsRef.current.has(file.fileId) ||
          hasThumbnailFile ||
          isThumbnailFile
        ) {
          if (hasValidToken === false && (isImage || isVideo) && import.meta.env.DEV) {
            console.warn(`⚠️ [Feed] Skipping ${file.fileId} - missing or invalid publicToken`);
          }
          return;
        }

        const next = new Set(generatingThumbnailsRef.current).add(file.fileId);
        generatingThumbnailsRef.current = next;
        setGeneratingThumbnails(next);

        try {
          let token: ShareToken;
          try {
            token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
            if (!token || !token.shareKey) throw new Error('Invalid token structure');
          } catch (e) {
            if (import.meta.env.DEV) console.error(`❌ [Feed] Failed to parse/validate token for ${file.fileId}:`, e);
            return;
          }

          const decryptedBlob = await decryptPublicFeedMedia(
            file.fileId,
            token,
            file.name || file.title
          );
          const thumbnailUrl = isVideo
            ? await createVideoThumbnailFromBlob(decryptedBlob, 300, 300)
            : await createThumbnailFromBlob(decryptedBlob, 300, 300);
          setThumbnails((prev) => {
            const n = new Map(prev);
            n.set(file.fileId, thumbnailUrl);
            return n;
          });
        } catch (err) {
          if (import.meta.env.DEV) console.warn(`Failed to generate thumbnail for ${file.fileId}:`, err);
        } finally {
          const n = new Set(generatingThumbnailsRef.current);
          n.delete(file.fileId);
          generatingThumbnailsRef.current = n;
          setGeneratingThumbnails(n);
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
        while (cursor < files.length) {
          const item = files[cursor++];
          await processOne(item);
        }
      });
      await Promise.all(workers);
    },
    []
  );

  useEffect(() => {
    generateThumbnailsForImagesRef.current = generateThumbnailsForImages;
  }, [generateThumbnailsForImages]);

  // Generate thumbnails when indices change
  useEffect(() => {
    if (mediaFiles.length === 0 && thoughtsFiles.length === 0 && collectionsFiles.length === 0) return;
    const allFiles = [...mediaFiles, ...thoughtsFiles, ...collectionsFiles];
    const filesToThumbnail = allFiles.filter((f) => {
      const fileId = f.metadata.fileId;
      return !thumbnails.has(fileId) && !generatingThumbnails.has(fileId);
    });
    if (filesToThumbnail.length > 0 && generateThumbnailsForImagesRef.current) {
      generateThumbnailsForImagesRef.current(filesToThumbnail);
    }
  }, [mediaFiles, thoughtsFiles, collectionsFiles, thumbnails, generatingThumbnails, generateThumbnailsForImages]);

  // Pre-load video blobs when in feed mode and indices change
  useEffect(() => {
    if (viewMode !== 'feed') return;
    const allFiles = [...mediaFiles, ...thoughtsFiles, ...collectionsFiles];
    for (const indexedFile of allFiles) {
      const file = indexedFile.metadata;
      const isVideo =
        file.fileType === 'video' ||
        !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
      if (!isVideo || videoBlobsRef.current.has(file.fileId)) continue;
      const isUnencrypted = file.isEncrypted === false;
      const hasToken = file.publicToken && typeof file.publicToken === 'string' && file.publicToken.trim().length > 0;
      if (!isUnencrypted && !hasToken) continue;
      (async () => {
        try {
          let videoBlob: Blob;
          if (isUnencrypted) {
            const ownerId = indexedFile.pnIdentifier || (file.creator as any)?.identifier?.value || (file as any).author?.did;
            if (!ownerId) {
              if (import.meta.env.DEV) console.warn('Cannot pre-load unencrypted video: missing owner identifier');
              return;
            }
            const session = PNOAuthService.loadSession();
            const accessToken = session?.accessToken;
            if (!accessToken) return;
            const backend = file.backend || 'google_drive';
            const backendFileId = file.backendFileId || file.fileId;
            const { resolveFileUrl } = await import('../services/storageApiClient');
            const url = resolveFileUrl(ownerId, backend, backendFileId, file.accountId);
            const response = await ownerGet(url);
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
            videoBlob = await response.blob();
          } else {
            let token: ShareToken;
            try {
              token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
            } catch {
              return;
            }
            videoBlob = await decryptPublicFeedMedia(file.fileId, token, file.name || file.title);
          }
          const videoUrl = URL.createObjectURL(videoBlob);
          setVideoBlobs((prev) => {
            const n = new Map(prev);
            n.set(file.fileId, videoUrl);
            return n;
          });
        } catch (err) {
          if (import.meta.env.DEV) console.warn('Failed to pre-load video for feed:', err);
        }
      })();
    }
  }, [mediaFiles, thoughtsFiles, collectionsFiles, viewMode]);

  return {
    thumbnails,
    setThumbnails,
    generatingThumbnails,
    setGeneratingThumbnails,
    videoBlobs,
    setVideoBlobs,
    videoPlaying,
    setVideoPlaying,
    mediaDimensions,
    setMediaDimensions,
    cleanupThumbnailsForFiles,
  };
}
