/**
 * Thumbnails and video blob state, generation, and preload.
 * Public feed media: CDN only (poster / sd via public-media).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { IndexedFile } from '../types/aggregator';
import type { MediaDimensions } from '../utils/mediaScaling';
import {
  hasFeedPreviewPlayback,
  resolvePublicMediaObjectUrl,
  resolvePublicFeedObjectUrl,
} from '../services/feedPreviewPlayback';
import { feedMediaSessionCache } from '../services/feedMediaSessionCache';

export interface UseThumbnailsAndMediaParams {
  mediaFiles: IndexedFile[];
  notesFiles: IndexedFile[];
  collectionsFiles: IndexedFile[];
  viewMode: 'grid' | 'feed';
}

export function useThumbnailsAndMedia({
  mediaFiles,
  notesFiles,
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
    // Drop React mirrors only — session cache keeps blob URLs for feed revisit.
    setThumbnails((prev) => {
      const newMap = new Map(prev);
      fileIds.forEach((fileId) => {
        newMap.delete(fileId);
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
        const hasFeedPreview = hasFeedPreviewPlayback(file);
        const hasThumbnailFile = !!file.thumbnailFileId;
        const fileName = (file.name || file.title || '').toLowerCase();
        const isThumbnailFile = fileName.startsWith('thumb_');

        if (
          (!isImage && !isVideo) ||
          !hasFeedPreview ||
          thumbnailsRef.current.has(file.fileId) ||
          generatingThumbnailsRef.current.has(file.fileId) ||
          hasThumbnailFile ||
          isThumbnailFile
        ) {
          if (!hasFeedPreview && (isImage || isVideo) && import.meta.env.DEV) {
            console.warn(`[Feed] Skipping ${file.fileId} - missing feed preview refs`);
          }
          const cached = feedMediaSessionCache.getObjectUrl(file.fileId, 'poster');
          if (cached && !thumbnailsRef.current.has(file.fileId) && hasFeedPreview) {
            setThumbnails((prev) => {
              if (prev.has(file.fileId)) return prev;
              const n = new Map(prev);
              n.set(file.fileId, cached);
              return n;
            });
          }
          return;
        }

        const next = new Set(generatingThumbnailsRef.current).add(file.fileId);
        generatingThumbnailsRef.current = next;
        setGeneratingThumbnails(next);

        try {
          const cached = feedMediaSessionCache.getObjectUrl(file.fileId, 'poster');
          if (cached) {
            setThumbnails((prev) => {
              const n = new Map(prev);
              n.set(file.fileId, cached);
              return n;
            });
            return;
          }
          // Poster is already CDN preview-sized — use object URL directly (session cache).
          const thumbnailUrl = await resolvePublicMediaObjectUrl(file.fileId, 'poster');
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

  // Grid mode thumbnails; feed mode uses FullScreenFeed viewport CDN load
  useEffect(() => {
    if (viewMode === 'feed') return;
    if (mediaFiles.length === 0 && notesFiles.length === 0 && collectionsFiles.length === 0) return;
    const allFiles = [...mediaFiles, ...notesFiles, ...collectionsFiles];
    const filesToThumbnail = allFiles.filter((f) => {
      const fileId = f.metadata.fileId;
      return !thumbnails.has(fileId) && !generatingThumbnails.has(fileId);
    });
    if (filesToThumbnail.length > 0 && generateThumbnailsForImagesRef.current) {
      generateThumbnailsForImagesRef.current(filesToThumbnail);
    }
  }, [mediaFiles, notesFiles, collectionsFiles, thumbnails, generatingThumbnails, generateThumbnailsForImages, viewMode]);

  // Pre-load video blobs in grid mode (CDN sd only)
  useEffect(() => {
    if (viewMode !== 'grid') return;
    const allFiles = [...mediaFiles, ...notesFiles, ...collectionsFiles];
    for (const indexedFile of allFiles) {
      const file = indexedFile.metadata;
      const isVideo =
        file.fileType === 'video' ||
        !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
      if (!isVideo || videoBlobsRef.current.has(file.fileId)) continue;
      if (!hasFeedPreviewPlayback(file)) continue;
      const cachedSd = feedMediaSessionCache.getObjectUrl(file.fileId, 'sd');
      if (cachedSd) {
        setVideoBlobs((prev) => {
          if (prev.has(file.fileId)) return prev;
          const n = new Map(prev);
          n.set(file.fileId, cachedSd);
          return n;
        });
        continue;
      }
      (async () => {
        try {
          const videoUrl = await resolvePublicFeedObjectUrl(file.fileId, file as any, {
            variant: 'sd',
          });
          setVideoBlobs((prev) => {
            if (prev.has(file.fileId)) return prev;
            const n = new Map(prev);
            n.set(file.fileId, videoUrl);
            return n;
          });
        } catch (err) {
          if (import.meta.env.DEV) console.warn('Failed to pre-load video for feed:', err);
        }
      })();
    }
  }, [mediaFiles, notesFiles, collectionsFiles, viewMode]);

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
