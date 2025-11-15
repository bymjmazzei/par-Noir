/**
 * File State Hook
 * Manages file-related state (indexedFiles, thumbnails, videoBlobs, etc.)
 */

import { useState, useRef } from 'react';
import { IndexedFile } from '../types/aggregator';

export function useFileState() {
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ file: IndexedFile; blob: Blob; url: string } | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [generatingThumbnails, setGeneratingThumbnails] = useState<Set<string>>(new Set());
  const [videoPlaying, setVideoPlaying] = useState<Map<string, boolean>>(new Map());
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(new Map());
  const [imageBlobs, setImageBlobs] = useState<Map<string, string>>(new Map());
  const [visibleFileId, setVisibleFileId] = useState<string | null>(null);
  const [commentingFile, setCommentingFile] = useState<IndexedFile | null>(null);
  const [addingToFeedFile, setAddingToFeedFile] = useState<IndexedFile | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  return {
    indexedFiles,
    setIndexedFiles,
    isLoading,
    setIsLoading,
    error,
    setError,
    viewingFile,
    setViewingFile,
    thumbnails,
    setThumbnails,
    generatingThumbnails,
    setGeneratingThumbnails,
    videoPlaying,
    setVideoPlaying,
    videoBlobs,
    setVideoBlobs,
    imageBlobs,
    setImageBlobs,
    visibleFileId,
    setVisibleFileId,
    commentingFile,
    setCommentingFile,
    addingToFeedFile,
    setAddingToFeedFile,
    videoRefs
  };
}

