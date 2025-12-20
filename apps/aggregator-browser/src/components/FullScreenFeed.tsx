/**
 * Full Screen Feed Component
 * TikTok-style full-screen vertical feed with swipe navigation
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { IndexedFile } from '../types/aggregator';
import { FeedEngagementSidebar } from './FeedEngagementSidebar';
import { EngagementOverlay } from './EngagementOverlay';
import { PlaybackControls } from './PlaybackControls';
import { ContentRatingBadge } from './ContentRatingBadge';
import { File } from 'lucide-react';
import { useVerticalSwipe } from '../hooks/useVerticalSwipe';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';
import { useViewportHeightCSS } from '../hooks/useViewportHeight';
import { formatTimestamp } from '../utils/formatTimestamp';
import { decryptWithToken, ShareToken } from '../utils/tokenDecryption';
import { cleanTitle } from '../utils/cleanTitle';
import { CollectionFeed } from './CollectionFeed';
import { PNOAuthService } from '../services/pnOAuthService';

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

interface FullScreenFeedProps {
  files: IndexedFile[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onLike: (fileId: string) => void;
  onComment: (file: IndexedFile) => void;
  onShare: (fileId: string) => void;
  onAddToFeed?: (file: IndexedFile) => void;
  onSave?: (file: IndexedFile) => void;
  onEdit?: (file: IndexedFile) => void;
  isLiked: (fileId: string) => boolean;
  getLikeCount: (fileId: string, defaultCount: number) => number;
  getComments: (fileId: string) => any[];
  loadComments?: (fileId: string) => Promise<any[]>; // Optional: for preloading comments
  getShareCount: (fileId: string, defaultCount: number) => number;
  userState: {
    isUnlocked: boolean;
    pnIdentifier?: string;
  };
  onCreatorClick?: (creatorId: string) => void;
  onMessage?: (creatorId: string) => void;
  onSwipeLeft?: () => void; // Horizontal swipe left handler
  onSwipeRight?: () => void; // Horizontal swipe right handler
  mePageTab?: 'all' | 'media' | 'thoughts' | 'likes' | 'comments' | 'saved' | 'connections'; // For Me page tab context
  thumbnails?: Map<string, string>; // Optional: pre-generated thumbnails from parent
  videoBlobs?: Map<string, string>; // Optional: pre-loaded video blobs from parent
}

export function FullScreenFeed({
  files,
  currentIndex,
  onIndexChange,
  onLike,
  onComment,
  onShare: _onShare,
  onAddToFeed,
  onSave,
  onEdit,
  isLiked,
  getLikeCount,
  getComments,
  loadComments,
  getShareCount,
  userState,
  onCreatorClick,
  onMessage,
  onSwipeLeft,
  onSwipeRight,
  mePageTab,
  thumbnails: externalThumbnails,
  videoBlobs: externalVideoBlobs
}: FullScreenFeedProps) {
  // CACHE BUSTER: If you see this log, the new code is running! Version: 2024-12-19-v3
  console.log('%c[FullScreenFeed] NEW CODE LOADED - Version 2024-12-19-v3', 'color: red; font-size: 20px; font-weight: bold;');
  console.error('[FullScreenFeed] VERSION CHECK - If you see this, new code is loaded!');
  (window as any).__fullScreenFeedVersion = '2024-12-19-v3';
  
  // Debug function to test thumbnail loading for a specific file ID
  (window as any).__testThumbnailLoad = async (fileId: string) => {
    console.log(`[DEBUG] Testing thumbnail load for: ${fileId}`);
    try {
      const { PNOAuthService } = await import('../services/pnOAuthService');
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const accessToken = await PNOAuthService.getValidAccessToken();
      
      if (!accessToken) {
        console.error('[DEBUG] No access token');
        return;
      }
      
      const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      console.log(`[DEBUG] Metadata response status: ${metadataResponse.status}`);
      
      if (!metadataResponse.ok) {
        console.error(`[DEBUG] Failed to fetch metadata: ${metadataResponse.status}`);
        return;
      }
      
      const metadataData = await metadataResponse.json();
      const metadata = metadataData.metadata || metadataData;
      
      console.log(`[DEBUG] Metadata for ${fileId}:`, {
        hasPublicToken: !!metadata.publicToken,
        hasThumbnailFileId: !!metadata.thumbnailFileId,
        thumbnailFileId: metadata.thumbnailFileId,
        fileName: metadata.name || metadata.title,
        fileType: metadata.fileType,
        accountId: metadata.accountId || metadata.backendFileId
      });
      
      return metadata;
    } catch (err) {
      console.error(`[DEBUG] Error:`, err);
    }
  };
  
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(externalVideoBlobs || new Map());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(externalThumbnails || new Map());
  const accountIdCacheRef = useRef<string | null>(null); // Cache accountId to avoid repeated API calls
  const [collectionDataCache, setCollectionDataCache] = useState<Map<string, any>>(new Map()); // Cache for fetched collection data
  const fetchingCollectionRef = useRef<Set<string>>(new Set()); // Track files currently being fetched to prevent duplicates
  const loadingCollectionThumbnailsRef = useRef<Set<string>>(new Set()); // Track collection file IDs currently loading thumbnails
  const loadingStartTimesRef = useRef<Map<string, number>>(new Map()); // Track when each file ID started loading
  const triggeredImmediateLoadRef = useRef<Set<string>>(new Set()); // Track collections we've already triggered immediate loading for
  
  // Helper function to clear loading state for a file ID
  const clearLoadingState = (fileId: string) => {
    loadingCollectionThumbnailsRef.current.delete(fileId);
    loadingStartTimesRef.current.delete(fileId);
  };
  
  // Clear stuck loading states after 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const stuckIds: string[] = [];
      
      loadingCollectionThumbnailsRef.current.forEach((fileId) => {
        const startTime = loadingStartTimesRef.current.get(fileId);
        if (startTime && (now - startTime) > 15000) {
          stuckIds.push(fileId);
        }
      });
      
      if (stuckIds.length > 0) {
        console.warn(`[FullScreenFeed] Clearing ${stuckIds.length} stuck loading states:`, stuckIds);
        stuckIds.forEach((fileId) => {
          loadingCollectionThumbnailsRef.current.delete(fileId);
          loadingStartTimesRef.current.delete(fileId);
        });
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // DEBUG: Log files passed to FullScreenFeed
  useEffect(() => {
    console.log(`[FullScreenFeed] Component mounted/received files:`, {
      filesCount: files.length,
      files: files.map(f => ({
        fileId: f.metadata?.fileId,
        fileType: f.metadata?.fileType,
        name: f.metadata?.name || f.metadata?.title,
        hasCollection: !!f.metadata?.collection,
        collectionFileIds: f.metadata?.collection?.collectionFileIds?.length || 0,
        // FULL metadata dump for debugging
        fullMetadata: f.metadata
      })),
      thumbnailsMapSize: thumbnails.size,
      externalThumbnailsSize: externalThumbnails?.size || 0,
      thumbnailsMapKeys: Array.from(thumbnails.keys()),
      externalThumbnailsKeys: externalThumbnails ? Array.from(externalThumbnails.keys()) : []
    });
    
    // Check for collections specifically - check ALL possible locations
    const collections = files.filter(f => {
      const hasCollection = (f.metadata?.collection?.collectionFileIds?.length ?? 0) > 0;
      if (hasCollection) return true;
      
      // Also check if fileType is collection
      if (f.metadata?.fileType === 'collection') {
        console.warn(`[FullScreenFeed] File has fileType='collection' but no collectionFileIds:`, {
          fileId: f.metadata?.fileId,
          metadata: f.metadata
        });
      }
      return false;
    });
    
    if (collections.length > 0) {
      console.log(`[FullScreenFeed] Found ${collections.length} collections in files:`, collections.map(f => ({
        fileId: f.metadata?.fileId,
        collectionFileIds: f.metadata?.collection?.collectionFileIds,
        collectionData: f.metadata?.collection,
        fullMetadata: f.metadata
      })));
      
      // Collections found - thumbnail loading will be handled by the FILES CHANGED useEffect
    } else {
      console.warn(`[FullScreenFeed] NO COLLECTIONS FOUND in ${files.length} files`);
      // Log each file's metadata to see what we're actually getting
      files.forEach((f, idx) => {
        console.log(`[FullScreenFeed] File ${idx + 1}/${files.length}:`, {
          fileId: f.metadata?.fileId,
          fileType: f.metadata?.fileType,
          name: f.metadata?.name || f.metadata?.title,
          hasCollectionProperty: 'collection' in (f.metadata || {}),
          collectionValue: f.metadata?.collection,
          metadataKeys: Object.keys(f.metadata || {}),
          fullMetadata: JSON.stringify(f.metadata, null, 2)
        });
      });
    }
  }, [files.length, externalThumbnails]);
  
  // Load collection thumbnails immediately when files change
  useEffect(() => {
    console.log(`[FullScreenFeed] FILES CHANGED: Checking for collections to load thumbnails`, {
      filesLength: files.length,
      currentIndex,
      currentFileId: files[currentIndex]?.metadata?.fileId
    });
    
    // Check if current file is a collection
    const currentFile = files[currentIndex];
    if (currentFile?.metadata) {
      const fileId = currentFile.metadata.fileId;
      const collectionData = currentFile.metadata.collection || collectionDataCache.get(fileId);
      
      if (collectionData?.collectionFileIds && Array.isArray(collectionData.collectionFileIds)) {
        console.log(`[FullScreenFeed] FILES CHANGED: Current file ${fileId} is a collection, loading thumbnails`);
        // Trigger the existing loadCollectionThumbnails by ensuring visibleFileId is set
        if (!visibleFileId) {
          setVisibleFileId(fileId);
        }
      }
    }
  }, [files, currentIndex]); // Run when files or currentIndex changes
  
  // Sync external thumbnails/videoBlobs when they change
  // Merge instead of replace to preserve thumbnails loaded internally
  useEffect(() => {
    if (externalThumbnails) {
      setThumbnails(prev => {
        const merged = new Map(prev);
        externalThumbnails.forEach((url, fileId) => {
          merged.set(fileId, url);
        });
        return merged;
      });
    }
  }, [externalThumbnails]);
  
  useEffect(() => {
    if (externalVideoBlobs) {
      setVideoBlobs(externalVideoBlobs);
    }
  }, [externalVideoBlobs]);
  const [visibleFileId, setVisibleFileId] = useState<string | null>(null);
  const [mediaDimensions, setMediaDimensions] = useState<Map<string, { width: number; height: number }>>(new Map());
  const [showEngagementOverlay, setShowEngagementOverlay] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState<Map<string, boolean>>(new Map());
  const [expandedCaptions, setExpandedCaptions] = useState<Set<string>>(new Set());
  const [currentCommentIndex, setCurrentCommentIndex] = useState<Map<string, number>>(new Map());
  
  const [commentOpacity, setCommentOpacity] = useState<Map<string, number>>(new Map());

  // MOBILE FIX: Use actual viewport height instead of 100vh to account for mobile browser UI
  const viewportHeightCSS = useViewportHeightCSS(true); // true = exclude bottom nav

  // Handle vertical swipe for next/previous media
  const verticalSwipeRef = useVerticalSwipe({
    onSwipeUp: () => {
      if (currentIndex < files.length - 1) {
        onIndexChange(currentIndex + 1);
      }
    },
    onSwipeDown: () => {
      if (currentIndex > 0) {
        onIndexChange(currentIndex - 1);
      }
    },
    enabled: true,
    threshold: 50,
    snapThreshold: 0.2
  });

  // Handle horizontal swipe for feed switching
  const horizontalSwipeRef = useHorizontalSwipe({
    onSwipeLeft,
    onSwipeRight,
    enabled: !!(onSwipeLeft || onSwipeRight),
    threshold: 40,
    snapThreshold: 0.2
  });


  // Helper function to get accountId with caching
  const getAccountId = async (indexedFile: IndexedFile, accessToken: string | null): Promise<string | null> => {
    // Return cached accountId if available
    if (accountIdCacheRef.current) {
      return accountIdCacheRef.current;
    }
    
    // Try to get from indexedFile metadata first (if available)
    const fileMetadata = indexedFile.metadata as any;
    let accountId = fileMetadata?.accountId || fileMetadata?.backendFileId;
    if (accountId && accountId.includes('::')) {
      accountIdCacheRef.current = accountId;
      return accountId;
    }
    
    // Fetch from API if needed and we have access token
    if (accessToken) {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const session = PNOAuthService.loadSession();
        if (session?.did || session?.pnIdentifier) {
          const userId = session.pnIdentifier || session.did;
          const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            const accounts = accountsData.accounts || [];
            if (accounts.length > 0) {
              accountId = accounts[0].accountId;
              accountIdCacheRef.current = accountId;
              return accountId;
            }
          }
        }
      } catch (err) {
        console.warn(`[FullScreenFeed] Failed to fetch accountId:`, err);
      }
    }
    
    return accountId || null;
  };


  // Function to get popular comments for a file
  const getPopularComments = useCallback((fileId: string): any[] => {
    const allComments = getComments(fileId);
    if (!allComments || allComments.length === 0) {
      return [];
    }
    // Filter to top-level comments only (no replies), sort by likes, filter very short comments
    const topLevelComments = allComments
      .filter((c: any) => {
        // Include comments that are top-level (no parent) and have content
        return !c.parentCommentId && c.content && typeof c.content === 'string' && c.content.trim().length >= 3;
      })
      .sort((a: any, b: any) => {
        const aLikes = Array.isArray(a.likes) ? a.likes.length : 0;
        const bLikes = Array.isArray(b.likes) ? b.likes.length : 0;
        // If likes are equal, prefer more recent comments
        if (aLikes === bLikes) {
          const aTime = new Date(a.timestamp || 0).getTime();
          const bTime = new Date(b.timestamp || 0).getTime();
          return bTime - aTime;
        }
        return bLikes - aLikes; // Most liked first
      })
      .slice(0, 15); // Top 15 most liked
    return topLevelComments;
  }, [getComments]);

  // Track previous index and file ID to prevent unnecessary scrolling
  const prevIndexRef = useRef<number>(-1);
  const prevFileIdRef = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Handle scroll events to detect user scrolling vs programmatic scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Mark as user scrolling
      isUserScrollingRef.current = true;
      
      // Clear existing timeout
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
      
      // Reset flag after scroll ends
      userScrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);
  
  // Scroll to current index when it changes - only if not user scrolling
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const currentFile = files[currentIndex];
    if (!currentFile) return;
    
    // Don't scroll if user is actively scrolling
    if (isUserScrollingRef.current) {
      return;
    }
    
    // Don't scroll if index/file hasn't actually changed
    if (prevIndexRef.current === currentIndex && prevFileIdRef.current === currentFile.metadata.fileId) {
      return;
    }
    
    prevIndexRef.current = currentIndex;
    prevFileIdRef.current = currentFile.metadata.fileId;

    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Use a small delay to batch rapid index changes and let CSS snap handle smoothness
    scrollTimeoutRef.current = setTimeout(() => {
      // Check again if user started scrolling
      if (isUserScrollingRef.current) {
        return;
      }
      
      const element = scrollContainerRef.current?.querySelector(`[data-file-id="${currentFile.metadata.fileId}"]`);
      if (element && scrollContainerRef.current) {
        // Use smooth scroll - CSS snap will provide the snap behavior
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setVisibleFileId(currentFile.metadata.fileId);
        
        // Preload comments for the visible file if loadComments is available
        if (loadComments) {
          loadComments(currentFile.metadata.fileId).catch(err => {
            // Silently fail - comments will be loaded when modal opens
            console.debug('Failed to preload comments:', err);
          });
        }
      }
    }, 50);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [currentIndex, files, loadComments]);

  // Rotate comments every 2 seconds with fade transitions
  useEffect(() => {
    if (!visibleFileId) return;
    
    let intervalId: NodeJS.Timeout | null = null;
    
    // Check comments with a small delay to allow them to load
    const checkComments = () => {
      const popularComments = getPopularComments(visibleFileId);
      // Rotation effect check (logging removed - was too verbose)
      
      if (popularComments.length === 0) {
        // Reset state if no comments
        setCurrentCommentIndex(prev => {
          const newMap = new Map(prev);
          newMap.delete(visibleFileId);
          return newMap;
        });
        setCommentOpacity(prev => {
          const newMap = new Map(prev);
          newMap.delete(visibleFileId);
          return newMap;
        });
        return null;
      }
      
      // Initialize index and opacity if not set
      if (!currentCommentIndex.has(visibleFileId)) {
        setCurrentCommentIndex(prev => {
          const newMap = new Map(prev);
          newMap.set(visibleFileId, 0);
          return newMap;
        });
      }
      if (!commentOpacity.has(visibleFileId)) {
        setCommentOpacity(prev => {
          const newMap = new Map(prev);
          newMap.set(visibleFileId, 1);
          return newMap;
        });
      }
      
      return popularComments;
    };
    
    // Initial check with delay to allow comments to load
    const initialTimeout = setTimeout(() => {
      const popularComments = checkComments();
      if (!popularComments || popularComments.length === 0) return;
      
      intervalId = setInterval(() => {
        // Re-check comments in case they've loaded
        const currentPopularComments = getPopularComments(visibleFileId);
        if (currentPopularComments.length === 0) {
          if (intervalId) clearInterval(intervalId);
          return;
        }
        
        // Fade out current comment
        setCommentOpacity(prev => {
          const newMap = new Map(prev);
          newMap.set(visibleFileId, 0);
          return newMap;
        });
        
        // After fade out completes, switch to next comment and fade in
        setTimeout(() => {
          setCurrentCommentIndex(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(visibleFileId) || 0;
            newMap.set(visibleFileId, (current + 1) % currentPopularComments.length);
            return newMap;
          });
          
          setCommentOpacity(prev => {
            const newMap = new Map(prev);
            newMap.set(visibleFileId, 1);
            return newMap;
          });
        }, 200); // Wait for fade out to complete (200ms)
      }, 2000); // Rotate every 2 seconds
    }, 500); // Wait 500ms for comments to load
    
    return () => {
      clearTimeout(initialTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [visibleFileId, getPopularComments]);

  // Thoughts now render as images (thumbnails) - no special loading needed!
  // Load video blobs and thumbnails for visible files (only if not provided externally)
  useEffect(() => {
    // FORCE LOG - this should ALWAYS appear if useEffect runs
    console.error(`[FullScreenFeed] loadMedia useEffect triggered`, {
      filesLength: files.length, 
      currentIndex, 
      thumbnailsSize: thumbnails.size, 
      externalThumbnailsSize: externalThumbnails?.size, 
      externalVideoBlobsSize: externalVideoBlobs?.size,
      filesArray: files.map(f => f.metadata?.fileId)
    });
    const loadMedia = async () => {
      // Load current file and adjacent files
      const indicesToLoad = [
        currentIndex - 1,
        currentIndex,
        currentIndex + 1
      ].filter(idx => idx >= 0 && idx < files.length);
      console.error(`[FullScreenFeed] loadMedia running`, {indicesToLoad, filesLength: files.length, files: files.map(f => ({fileId: f.metadata?.fileId, name: f.metadata?.name}))});

      // Parallelize loading for better performance
      await Promise.all(indicesToLoad.map(async (idx) => {
        const indexedFile = files[idx];
        const file = indexedFile.metadata;
        const fileId = file.fileId;

        // Thoughts now render as images (thumbnails) - no special detection needed!
        // Just detect images and videos
        
        // Detect videos
        const isVideo = file.fileType === 'video' || 
          !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
        
        // Detect images (includes thought thumbnails which are just PNG images)
        const fileNameForImageCheck = file.name || file.title || '';
        const hasImageExtension = !!(fileNameForImageCheck.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i));
        const mimeType = (file as any).mimeType || indexedFile.metadata?.mimeType || file.encodingFormat || indexedFile.metadata?.encodingFormat || '';
        const hasImageMimeType = mimeType.startsWith('image/');
        const atType = file['@type'] || indexedFile.metadata?.['@type'];
        const isImageObject = Array.isArray(atType) 
          ? atType.some(t => String(t).toLowerCase().includes('image'))
          : String(atType || '').toLowerCase().includes('image');
        const isImage = file.fileType === 'image' || 
          isImageObject ||
          (file.fileType === 'other' && hasImageExtension) ||
          hasImageExtension ||
          hasImageMimeType;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FullScreenFeed.tsx:597',message:'Image detection check',data:{fileId,fileName:fileNameForImageCheck,fileType:file.fileType,hasImageExtension,hasImageMimeType,isImageObject,isImage,hasThumbnail:thumbnails.has(fileId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion

        console.error(`[FullScreenFeed] Processing file ${fileId}:`, {isImage, isVideo, fileType: file.fileType, fileName: file.name, hasPublicToken: !!file.publicToken, alreadyHasThumbnail: thumbnails.has(fileId)});
        
        // Only load video if not provided externally or if external map doesn't have this file
        if (isVideo && file.publicToken && !videoBlobs.has(fileId)) {
          // Check if external videoBlobs has this file
          const hasExternalVideo = externalVideoBlobs && externalVideoBlobs.has(fileId);
          if (!hasExternalVideo) {
            try {
              let token: ShareToken;
              try {
                token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
              } catch (e) {
                return; // Skip this file if token parsing fails
              }
              const decryptedBlob = await decryptWithToken(token);
              const videoUrl = URL.createObjectURL(decryptedBlob);
              setVideoBlobs(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, videoUrl);
                return newMap;
              });
            } catch (err) {
              console.warn('Failed to load video:', err);
            }
          }
        }

                // Only load image if not provided externally or if external map doesn't have this file
                if (isImage && !thumbnails.has(fileId)) {
          // Check if external thumbnails has this file
          const hasExternalThumbnail = externalThumbnails && externalThumbnails.has(fileId);
          if (!hasExternalThumbnail) {
            try {
              // CRITICAL: Public index contains thumbnail files (files starting with "thumb_")
              // If this file IS a thumbnail (name starts with "thumb_"), load it directly
              // Otherwise, check for thumbnailFileId (for main files that reference thumbnails)
              const fileName = (file.name || file.title || '').toLowerCase();
              const isThumbnailFile = fileName.startsWith('thumb_');
              
                // PRIORITY 1: If this IS a thumbnail file, load it using the same pattern as HorizontalThumbnailFeed
              if (isThumbnailFile) {
                console.error(`[FullScreenFeed] Detected thumbnail file ${fileId}, loading...`);
                const publicToken = indexedFile.publicToken || file.publicToken;
                const { PNOAuthService } = await import('../services/pnOAuthService');
                const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
                
                // Get accountId (needed for API call)
                const getAccountId = async (): Promise<string | null> => {
                  try {
                    const session = PNOAuthService.loadSession();
                    if (session?.did || session?.pnIdentifier) {
                      const userId = session.pnIdentifier || session.did;
                      const accessToken = await PNOAuthService.getValidAccessToken();
                      if (accessToken) {
                        const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
                          headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        if (accountsResponse.ok) {
                          const accountsData = await accountsResponse.json();
                          const accounts = accountsData.accounts || [];
                          if (accounts.length > 0) {
                            return accounts[0].accountId;
                          }
                        }
                      }
                    }
                  } catch (err) {
                    console.warn(`[FullScreenFeed] Failed to fetch accountId:`, err);
                  }
                  return null;
                };
                
                const accountId = await getAccountId();
                
                // Build URL (matching HorizontalThumbnailFeed pattern)
                let thumbnailUrl = `${apiEndpoint}/api/drive/files/${fileId}?thumbnail=true`;
                if (accountId && accountId.includes('::')) {
                  thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
                }
                
                // Fetch with auth token (same as HorizontalThumbnailFeed)
                let accessToken = await PNOAuthService.getValidAccessToken();
                let response = await fetch(thumbnailUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                // Retry with refreshed token on 401
                if (response.status === 401) {
                  const refreshedToken = await PNOAuthService.getValidAccessToken(true);
                  if (refreshedToken) {
                    response = await fetch(thumbnailUrl, {
                      headers: { 'Authorization': `Bearer ${refreshedToken}` }
                    });
                  }
                }
                
                if (!response.ok || response.status !== 200) {
                  console.warn(`[FullScreenFeed] Thumbnail ${fileId} failed: ${response.status}`);
                  return;
                }
                
                const contentType = response.headers.get('content-type') || '';
                const blob = await response.blob();
                
                // Handle encrypted files (matching HorizontalThumbnailFeed pattern)
                if (contentType.includes('application/json')) {
                  try {
                    const text = await blob.text();
                    const parsed = JSON.parse(text);
                    
                    if (parsed.encrypted && parsed.iv && parsed.salt &&
                        typeof parsed.encrypted === 'string' &&
                        typeof parsed.iv === 'string' &&
                        typeof parsed.salt === 'string') {
                      
                      // PRIORITY 1: If we have a publicToken, use it for decryption
                      if (publicToken) {
                        try {
                          const { decryptWithToken } = await import('../utils/tokenDecryption');
                          let token: ShareToken;
                          try {
                            token = typeof publicToken === 'string' ? JSON.parse(publicToken) : publicToken;
                          } catch (e) {
                            console.warn(`[FullScreenFeed] Failed to parse token for thumbnail ${fileId}:`, e);
                            return;
                          }
                          
                          // Decrypt using token
                          const decryptedBlob = await decryptWithToken(token);
                          const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                          
                          setThumbnails(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, thumbnailUrlObj);
                            return newMap;
                          });
                          
                          return; // Success!
                        } catch (tokenError) {
                          console.warn(`[FullScreenFeed] Token decryption failed for thumbnail ${fileId}, falling back to session:`, tokenError);
                          // Fall through to session-based decryption
                        }
                      }
                      
                      // PRIORITY 2: Fall back to session-based decryption
                      const { EncryptionManager } = await import('../utils/encryptionManager');
                      const session = PNOAuthService.loadSession();
                      if (!session?.did) {
                        console.warn(`[FullScreenFeed] Cannot decrypt - no session and no token`);
                        return;
                      }
                      
                      const pnId = session.did;
                      let publicKey = session?.publicKey;
                      if (!publicKey && session.did.startsWith('did:key:')) {
                        publicKey = session.did.substring(8);
                      }
                      if (!publicKey) {
                        console.warn(`[FullScreenFeed] Cannot decrypt - no public key`);
                        return;
                      }
                      
                      const encryptionManager = new EncryptionManager();
                      const decryptedData = await encryptionManager.decrypt(
                        parsed.encrypted,
                        parsed.iv,
                        parsed.salt,
                        pnId,
                        publicKey
                      );
                      
                      const decryptedBlob = new Blob([decryptedData as BlobPart], {
                        type: parsed.metadata?.originalMimeType || 'image/jpeg'
                      });
                      const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                      
                      setThumbnails(prev => {
                        const newMap = new Map(prev);
                        newMap.set(fileId, thumbnailUrlObj);
                        return newMap;
                      });
                      
                      return; // Success!
                    }
                  } catch (parseError) {
                    console.error(`[FullScreenFeed] Failed to parse encrypted thumbnail ${fileId}:`, parseError);
                    return;
                  }
                } else {
                  // Not encrypted - use directly
                  const thumbnailUrlObj = URL.createObjectURL(blob);
                  setThumbnails(prev => {
                    const newMap = new Map(prev);
                    newMap.set(fileId, thumbnailUrlObj);
                    return newMap;
                  });
                  return;
                }
              }
              
              // PRIORITY 2: Check for thumbnailFileId in metadata (for main files that reference thumbnails)
              const thumbnailFileId = file.thumbnailFileId;
              if (thumbnailFileId) {
                const { PNOAuthService } = await import('../services/pnOAuthService');
                const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
                const accessToken = await PNOAuthService.getValidAccessToken();
                
                if (accessToken) {
                  // Get accountId with caching
                  const accountId = await getAccountId(indexedFile, accessToken);
                  
                  // Load thumbnail file
                  let thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailFileId}?thumbnail=true`;
                  if (accountId && accountId.includes('::')) {
                    thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
                  }
                  
                  let response = await fetch(thumbnailUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  
                  if (response.status === 401) {
                    const refreshedToken = await PNOAuthService.getValidAccessToken(true);
                    if (refreshedToken) {
                      response = await fetch(thumbnailUrl, {
                        headers: { 'Authorization': `Bearer ${refreshedToken}` }
                      });
                    }
                  }
                  
                  if (response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    const blob = await response.blob();
                    
                    // Decrypt thumbnail if encrypted
                    let thumbnailBlob: Blob;
                    if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                      const { EncryptionManager } = await import('../utils/encryptionManager');
                      const session = PNOAuthService.loadSession();
                      if (session?.did) {
                        const pnId = session.did;
                        let publicKey = session?.publicKey;
                        if (!publicKey && session.did.startsWith('did:key:')) {
                          publicKey = session.did.substring(8);
                        }
                        if (publicKey) {
                          const encryptedText = await blob.text();
                          const encryptedPackage = JSON.parse(encryptedText);
                          const encryptionManager = new EncryptionManager();
                          const decryptedData = await encryptionManager.decrypt(
                            encryptedPackage.encrypted,
                            encryptedPackage.iv,
                            encryptedPackage.salt,
                            pnId,
                            publicKey
                          );
                          // Convert Uint8Array to ArrayBuffer for Blob creation
                          const arrayBuffer = decryptedData.buffer.slice(decryptedData.byteOffset, decryptedData.byteOffset + decryptedData.byteLength) as ArrayBuffer;
                          thumbnailBlob = new Blob([arrayBuffer], {
                            type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                          });
                        } else {
                          return; // Skip if can't decrypt
                        }
                      } else {
                        return; // Skip if no session
                      }
                    } else {
                      thumbnailBlob = blob;
                    }
                    
                    const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
                    setThumbnails(prev => {
                      const newMap = new Map(prev);
                      newMap.set(fileId, thumbnailUrlObj);
                      return newMap;
                    });
                    
                    return; // Skip to next file, thumbnail is loaded
                  }
                }
              }
              
              // PRIORITY 2: Try API endpoint with ?thumbnail=true
              // BUT FIRST: Check if thumbnail was just loaded by PRIORITY 1 (race condition fix)
              if (!thumbnails.has(fileId)) {
                const { PNOAuthService } = await import('../services/pnOAuthService');
                const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
                const accessToken = await PNOAuthService.getValidAccessToken();
                
                if (accessToken) {
                  // Get accountId with caching
                  const accountId = await getAccountId(indexedFile, accessToken);
                  
                  // Try thumbnail endpoint
                  let thumbnailUrl = `${apiEndpoint}/api/drive/files/${fileId}?thumbnail=true`;
                  if (accountId && accountId.includes('::')) {
                    thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
                  }
                  
                  let response = await fetch(thumbnailUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  
                  if (response.status === 401) {
                    const refreshedToken = await PNOAuthService.getValidAccessToken(true);
                    if (refreshedToken) {
                      response = await fetch(thumbnailUrl, {
                        headers: { 'Authorization': `Bearer ${refreshedToken}` }
                      });
                    }
                  }
                  
                  if (response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    const blob = await response.blob();
                    
                    // Decrypt thumbnail if encrypted
                    let thumbnailBlob: Blob | null = null;
                    if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                      const { EncryptionManager } = await import('../utils/encryptionManager');
                      const session = PNOAuthService.loadSession();
                      if (session?.did) {
                        const pnId = session.did;
                        let publicKey = session?.publicKey;
                        if (!publicKey && session.did.startsWith('did:key:')) {
                          publicKey = session.did.substring(8);
                        }
                        if (publicKey) {
                          try {
                            const encryptedText = await blob.text();
                            const encryptedPackage = JSON.parse(encryptedText);
                            const encryptionManager = new EncryptionManager();
                            const decryptedData = await encryptionManager.decrypt(
                              encryptedPackage.encrypted,
                              encryptedPackage.iv,
                              encryptedPackage.salt,
                              pnId,
                              publicKey
                            );
                            const arrayBuffer = decryptedData.buffer.slice(decryptedData.byteOffset, decryptedData.byteOffset + decryptedData.byteLength) as ArrayBuffer;
                            thumbnailBlob = new Blob([arrayBuffer], {
                              type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                            });
                          } catch (decryptErr) {
                            console.warn(`[FullScreenFeed] Failed to decrypt thumbnail for ${fileId}:`, decryptErr);
                            thumbnailBlob = null;
                          }
                        }
                      }
                    } else {
                      thumbnailBlob = blob;
                    }
                    
                    if (thumbnailBlob) {
                      const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
                      setThumbnails(prev => {
                        const newMap = new Map(prev);
                        newMap.set(fileId, thumbnailUrlObj);
                        return newMap;
                      });
                      return; // Success - thumbnail loaded via API
                    }
                  }
                }
              }
              
              // DO NOT load full file as fallback - if thumbnail loading fails, show placeholder
              // This prevents loading both thumbnail and full file
            } catch (err) {
              console.error(`[FullScreenFeed] Failed to load thumbnail for ${fileId}:`, err);
            }
          }
        }

      }));
    };

    loadMedia();
  }, [currentIndex, files, externalThumbnails, externalVideoBlobs]); // Removed videoBlobs and thumbnails from deps to prevent loops

  // Retry loading thumbnails when authentication becomes available
  useEffect(() => {
    if (!userState.isUnlocked) {
      return; // Not authenticated yet
    }

    // When user becomes authenticated, check if there are any collections that need thumbnails loaded
    const currentFile = files[currentIndex];
    if (!currentFile) return;

    const fileId = currentFile.metadata.fileId;
    const collectionData = currentFile.metadata.collection;
    
    if (!collectionData?.collectionFileIds) return;

    // Find missing thumbnails
    const missingThumbnailIds = collectionData.collectionFileIds.filter(
      (cfId: string) => 
        !thumbnails.has(cfId) && 
        (!externalThumbnails || !externalThumbnails.has(cfId)) &&
        !loadingCollectionThumbnailsRef.current.has(cfId)
    );

    if (missingThumbnailIds.length === 0) return;

    console.log(`[FullScreenFeed] Authentication available, retrying thumbnail load for ${missingThumbnailIds.length} files:`, missingThumbnailIds);

    // Trigger thumbnail loading by clearing the "already triggered" flag
    // This will cause the immediate load check to run again
    triggeredImmediateLoadRef.current.delete(fileId);
  }, [userState.isUnlocked, currentIndex, files, thumbnails, externalThumbnails]);

  // Load thumbnails for collection files when a collection is visible
  useEffect(() => {
    console.log(`[FullScreenFeed] loadCollectionThumbnails useEffect triggered:`, {
      visibleFileId,
      currentIndex,
      filesLength: files.length,
      currentFileId: files[currentIndex]?.metadata?.fileId
    });
    
    const loadCollectionThumbnails = async () => {
      // Use visibleFileId if available, otherwise use currentIndex
      const targetFileId = visibleFileId || (files[currentIndex]?.metadata?.fileId);
      
      console.log(`[FullScreenFeed] loadCollectionThumbnails: starting with targetFileId=${targetFileId}`);
      
      if (!targetFileId) {
        console.log(`[FullScreenFeed] loadCollectionThumbnails: no targetFileId (visibleFileId=${visibleFileId}, currentIndex=${currentIndex})`);
        return;
      }
      
      const indexedFile = files.find(f => f.metadata.fileId === targetFileId);
      if (!indexedFile) {
        console.log(`[FullScreenFeed] loadCollectionThumbnails: no indexedFile for ${targetFileId}`);
        return;
      }
      
      const file = indexedFile.metadata;
      const collectionData = file.collection || collectionDataCache.get(targetFileId);
      
      console.log(`[FullScreenFeed] loadCollectionThumbnails: checking ${targetFileId}`, {
        targetFileId,
        visibleFileId,
        currentIndex,
        fileId: file.fileId,
        fileType: file.fileType,
        hasCollection: !!file.collection,
        hasCachedCollection: !!collectionDataCache.get(targetFileId),
        collectionData: collectionData ? {
          hasCollectionFileIds: !!collectionData.collectionFileIds,
          collectionFileIdsLength: collectionData.collectionFileIds?.length,
          collectionFileIds: collectionData.collectionFileIds
        } : null,
        thumbnailsSize: thumbnails.size,
        thumbnailsKeys: Array.from(thumbnails.keys())
      });
      
      // Check if this is a collection
      if (!collectionData?.collectionFileIds || !Array.isArray(collectionData.collectionFileIds)) {
        console.log(`[FullScreenFeed] loadCollectionThumbnails: not a collection or no collectionFileIds`);
        return;
      }
      
      // Find collection file IDs that don't have thumbnails yet and aren't currently loading
      const missingThumbnailIds = collectionData.collectionFileIds.filter(
        (fileId: string) => 
          !thumbnails.has(fileId) && 
          (!externalThumbnails || !externalThumbnails.has(fileId)) &&
          !loadingCollectionThumbnailsRef.current.has(fileId)
      );
      
      if (missingThumbnailIds.length === 0) {
        console.log(`[FullScreenFeed] loadCollectionThumbnails: All thumbnails already loaded or loading for ${targetFileId}`);
        return; // All thumbnails already loaded or loading
      }
      
      console.log(`[FullScreenFeed] Loading ${missingThumbnailIds.length} missing thumbnails for collection ${targetFileId}:`, missingThumbnailIds);
      
      // Check if user is authenticated before attempting to load
      if (!userState.isUnlocked) {
        console.log(`[FullScreenFeed] loadCollectionThumbnails: User not authenticated, will retry when authenticated`);
        return; // Will retry when userState.isUnlocked becomes true
      }
      
      // Mark as loading
      missingThumbnailIds.forEach((fileId: string) => {
        loadingCollectionThumbnailsRef.current.add(fileId);
        loadingStartTimesRef.current.set(fileId, Date.now());
      });
      
      // Load thumbnails for missing collection files
      await Promise.all(missingThumbnailIds.map(async (fileId: string) => {
        console.log(`[FullScreenFeed] loadCollectionThumbnails: Starting to load thumbnail for collection file ${fileId}`);
        try {
          const { PNOAuthService } = await import('../services/pnOAuthService');
          const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
          const accessToken = await PNOAuthService.getValidAccessToken();
          
          if (!accessToken) {
            console.warn(`[FullScreenFeed] loadCollectionThumbnails: No access token for ${fileId}, will retry when available`);
            // Don't clear loading state - we'll retry when token is available
            return;
          }
          
          // Fetch metadata for this collection file to get publicToken/thumbnailFileId
          const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (!metadataResponse.ok) {
            console.warn(`[FullScreenFeed] Failed to fetch metadata for collection file ${fileId}:`, metadataResponse.status);
            return;
          }
          
          const metadataData = await metadataResponse.json();
          const collectionFileMetadata = metadataData.metadata || metadataData;
          
          console.log(`[FullScreenFeed] Fetched metadata for collection file ${fileId}:`, {
            fileId,
            fileName: collectionFileMetadata.name || collectionFileMetadata.title,
            hasPublicToken: !!collectionFileMetadata.publicToken,
            hasThumbnailFileId: !!collectionFileMetadata.thumbnailFileId,
            fileType: collectionFileMetadata.fileType,
            isThumbnailFile: (collectionFileMetadata.name || collectionFileMetadata.title || '').toLowerCase().startsWith('thumb_')
          });
          
          // Get accountId for the collection file (try from metadata first, then API)
          let accountId: string | null = collectionFileMetadata.accountId || collectionFileMetadata.backendFileId;
          if (!accountId || !accountId.includes('::')) {
            // Try to get from API using creator identifier
            const pnIdentifier = collectionFileMetadata.creatorId || collectionFileMetadata.creator?.identifier?.value || 
                                 collectionFileMetadata.creator?.["@id"] || collectionFileMetadata.author?.did;
            if (pnIdentifier && !accountIdCacheRef.current) {
              try {
                const accountResponse = await fetch(`${apiEndpoint}/api/users/${encodeURIComponent(pnIdentifier)}/accounts`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (accountResponse.ok) {
                  const accounts = await accountResponse.json();
                  if (Array.isArray(accounts) && accounts.length > 0) {
                    accountId = accounts[0].id;
                    accountIdCacheRef.current = accountId;
                  }
                }
              } catch (err) {
                console.warn(`[FullScreenFeed] Failed to get accountId for collection file ${fileId}:`, err);
              }
            } else if (accountIdCacheRef.current) {
              accountId = accountIdCacheRef.current;
            }
          } else if (accountId) {
            accountIdCacheRef.current = accountId;
          }
          
          // Try to load thumbnail using the same logic as regular files
          const fileName = (collectionFileMetadata.name || collectionFileMetadata.title || '').toLowerCase();
          const isThumbnailFile = fileName.startsWith('thumb_');
          
          // PRIORITY 1: If this IS a thumbnail file, decrypt using publicToken
          if (isThumbnailFile && collectionFileMetadata.publicToken) {
            try {
              const { decryptWithToken } = await import('../utils/tokenDecryption');
              let token: ShareToken;
              try {
                token = typeof collectionFileMetadata.publicToken === 'string' 
                  ? JSON.parse(collectionFileMetadata.publicToken) 
                  : collectionFileMetadata.publicToken;
              } catch (e) {
                return;
              }
              
              const decryptedBlob = await decryptWithToken(token);
              const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
              
              setThumbnails(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, thumbnailUrlObj);
                return newMap;
              });
              
              console.log(`[FullScreenFeed] Loaded thumbnail for collection file ${fileId} via publicToken`);
              return;
            } catch (decryptErr) {
              console.warn(`[FullScreenFeed] Failed to decrypt thumbnail with publicToken for ${fileId}:`, decryptErr);
            }
          }
          
          // PRIORITY 2: Check for thumbnailFileId
          const thumbnailFileId = collectionFileMetadata.thumbnailFileId;
          if (thumbnailFileId) {
            let thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailFileId}?thumbnail=true`;
            if (accountId && accountId.includes('::')) {
              thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
            }
            
            let response = await fetch(thumbnailUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (response.status === 401) {
              const refreshedToken = await PNOAuthService.getValidAccessToken(true);
              if (refreshedToken) {
                response = await fetch(thumbnailUrl, {
                  headers: { 'Authorization': `Bearer ${refreshedToken}` }
                });
              }
            }
            
            if (response.ok) {
              const contentType = response.headers.get('content-type') || '';
              const blob = await response.blob();
              
              let thumbnailBlob: Blob;
              if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                const { EncryptionManager } = await import('../utils/encryptionManager');
                const session = PNOAuthService.loadSession();
                if (session?.did) {
                  const pnId = session.did;
                  let publicKey = session?.publicKey;
                  if (!publicKey && session.did.startsWith('did:key:')) {
                    publicKey = session.did.substring(8);
                  }
                  if (publicKey) {
                    const encryptedText = await blob.text();
                    const encryptedPackage = JSON.parse(encryptedText);
                    const encryptionManager = new EncryptionManager();
                    const decryptedData = await encryptionManager.decrypt(
                      encryptedPackage.encrypted,
                      encryptedPackage.iv,
                      encryptedPackage.salt,
                      pnId,
                      publicKey
                    );
                    const arrayBuffer = decryptedData.buffer.slice(decryptedData.byteOffset, decryptedData.byteOffset + decryptedData.byteLength) as ArrayBuffer;
                    thumbnailBlob = new Blob([arrayBuffer], {
                      type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                    });
                  } else {
                    return;
                  }
                } else {
                  return;
                }
              } else {
                thumbnailBlob = blob;
              }
              
              const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
              setThumbnails(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, thumbnailUrlObj);
                return newMap;
              });
              
              console.log(`[FullScreenFeed] Loaded thumbnail for collection file ${fileId} via thumbnailFileId`);
              return;
            }
          }
          
          // PRIORITY 3: Try API endpoint with ?thumbnail=true
          let thumbnailUrl = `${apiEndpoint}/api/drive/files/${fileId}?thumbnail=true`;
          if (accountId && accountId.includes('::')) {
            thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
          }
          
          let response = await fetch(thumbnailUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (response.status === 401) {
            const refreshedToken = await PNOAuthService.getValidAccessToken(true);
            if (refreshedToken) {
              response = await fetch(thumbnailUrl, {
                headers: { 'Authorization': `Bearer ${refreshedToken}` }
              });
            }
          }
          
          if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            const blob = await response.blob();
            
            let thumbnailBlob: Blob | null = null;
            if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
              const { EncryptionManager } = await import('../utils/encryptionManager');
              const session = PNOAuthService.loadSession();
              if (session?.did) {
                const pnId = session.did;
                let publicKey = session?.publicKey;
                if (!publicKey && session.did.startsWith('did:key:')) {
                  publicKey = session.did.substring(8);
                }
                if (publicKey) {
                  try {
                    const encryptedText = await blob.text();
                    const encryptedPackage = JSON.parse(encryptedText);
                    const encryptionManager = new EncryptionManager();
                    const decryptedData = await encryptionManager.decrypt(
                      encryptedPackage.encrypted,
                      encryptedPackage.iv,
                      encryptedPackage.salt,
                      pnId,
                      publicKey
                    );
                    const arrayBuffer = decryptedData.buffer.slice(decryptedData.byteOffset, decryptedData.byteOffset + decryptedData.byteLength) as ArrayBuffer;
                    thumbnailBlob = new Blob([arrayBuffer], {
                      type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                    });
                  } catch (decryptErr) {
                    console.warn(`[FullScreenFeed] Failed to decrypt thumbnail for collection file ${fileId}:`, decryptErr);
                    thumbnailBlob = null;
                  }
                }
              }
            } else {
              thumbnailBlob = blob;
            }
            
            if (thumbnailBlob) {
              const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
              setThumbnails(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, thumbnailUrlObj);
                return newMap;
              });
              
              console.log(`[FullScreenFeed] Loaded thumbnail for collection file ${fileId} via API endpoint`);
            }
          }
        } catch (err) {
          console.error(`[FullScreenFeed] ERROR loading thumbnail for collection file ${fileId}:`, {
            error: err,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? err.stack : undefined,
            fileId
          });
        } finally {
          // Remove from loading set
          loadingCollectionThumbnailsRef.current.delete(fileId);
        }
      }));
    };
    
    loadCollectionThumbnails();
  }, [visibleFileId, currentIndex, files, externalThumbnails, collectionDataCache, thumbnails.size, userState.isUnlocked]); // Added userState.isUnlocked to retry when authenticated

  // Auto-play video when it becomes visible
  useEffect(() => {
    if (!visibleFileId) return;

    const videoElement = videoRefs.current.get(visibleFileId);
    const indexedFile = files.find(f => f.metadata.fileId === visibleFileId);
    if (!indexedFile) return;

    const file = indexedFile.metadata;
    const isVideo = file.fileType === 'video' || 
                   !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

    if (isVideo && videoElement && videoBlobs.has(visibleFileId)) {
      videoElement.play().catch(err => {
        console.warn('Failed to auto-play video:', err);
      });
    }
  }, [visibleFileId, files, videoBlobs]);


  // Intersection Observer for auto-playing videos
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const fileId = entry.target.getAttribute('data-file-id');
          if (!fileId) return;

          const videoElement = videoRefs.current.get(fileId);
          const indexedFile = files.find(f => f.metadata.fileId === fileId);
          if (!indexedFile) return;

          const file = indexedFile.metadata;
          const isVideo = file.fileType === 'video' || 
                         !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setVisibleFileId(fileId);
            if (isVideo && videoElement && videoBlobs.has(fileId)) {
              videoElement.play().catch(err => {
                console.warn('Failed to auto-play video:', err);
              });
            }
          } else {
            if (visibleFileId === fileId) {
              setVisibleFileId(null);
            }
            if (videoElement) {
              videoElement.pause();
            }
          }
        });
      },
      {
        threshold: [0, 0.5, 1],
        rootMargin: '0px'
      }
    );

    const fileElements = scrollContainerRef.current?.querySelectorAll('[data-file-id]');
    fileElements?.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [files, videoBlobs, visibleFileId]);

  // Cleanup video URLs on unmount
  useEffect(() => {
    return () => {
      videoBlobs.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const currentFile = files[currentIndex];
  if (!currentFile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black text-white">
        <p>No content available</p>
      </div>
    );
  }

  return (
    <div
      ref={(el) => {
        scrollContainerRef.current = el;
        if (verticalSwipeRef.current !== el) {
          (verticalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
        if (horizontalSwipeRef.current !== el) {
          (horizontalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      }}
      className="w-full overflow-y-scroll snap-y snap-mandatory bg-black"
      style={{ 
        scrollbarWidth: 'none', 
        msOverflowStyle: 'none', 
        WebkitOverflowScrolling: 'touch',
        scrollBehavior: 'smooth', // Enable smooth CSS scroll snapping
        scrollSnapType: 'y mandatory', // Ensure snap behavior
        // MOBILE FIX: Use actual viewport height (excludes mobile browser UI)
        height: viewportHeightCSS,
        maxHeight: viewportHeightCSS,
        // Start at top of window
        marginTop: '0',
        paddingTop: '0',
        boxSizing: 'border-box'
      }}
    >
      {/* Only render visible files (currentIndex ± 1) for better performance */}
      {(() => {
        // CRITICAL DEBUG: Log FullScreenFeed rendering
        console.log('🔍 [FullScreenFeed] Rendering:', {
          filesCount: files.length,
          fileIds: files.slice(0, 5).map((f: any) => f.metadata?.fileId),
          currentIndex
        });
        
        // Debug: Log all files in the array with their indices
        const allFilesWithIndices = files.map((f, idx) => ({
          index: idx,
          fileId: f.metadata.fileId,
          fileType: f.metadata.fileType,
          fileName: f.metadata.name || f.metadata.title
        }));
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log(`[FullScreenFeed] ${files.length} files, currentIndex: ${currentIndex}`);
        }
        // Show currentIndex and next 2 files (or previous if at start)
        // This ensures we always show at least 3 files when available
        const startIdx = Math.max(0, currentIndex - 1);
        const endIdx = Math.min(files.length, currentIndex + 3); // Show current + next 2
        return files.slice(startIdx, endIdx);
      })()
        .map((indexedFile) => {
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        
        // DEBUG: Log every file being processed, especially if it has collection data
        if (indexedFile.metadata?.collection) {
          console.log(`[FullScreenFeed] Processing file with collection data:`, {
            fileId,
            fileName: file.name || file.title,
            fileType: file.fileType,
            collection: indexedFile.metadata.collection,
            collectionFileIds: indexedFile.metadata.collection?.collectionFileIds,
            collectionFileIdsLength: indexedFile.metadata.collection?.collectionFileIds?.length
          });
        }
        
        // Thoughts now render as images (thumbnails) - no special detection needed!
        // Just detect images, videos, and collections
        
        // Check fileType in ALL possible locations
        const fileTypeFromFile = file.fileType;
        const fileTypeFromMetadata = indexedFile.metadata?.fileType;
        const fileTypeFromIndexedFile = (indexedFile as any)?.fileType;
        const actualFileType = fileTypeFromFile || fileTypeFromMetadata || fileTypeFromIndexedFile;
        
        // Detect videos
        const isVideo = file.fileType === 'video' || 
          !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
        
        // Detect images (includes thought thumbnails which are just PNG images)
        const fileNameForImageCheck = file.name || file.title || '';
        const hasImageExtension = !!(fileNameForImageCheck.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif)$/i));
        const mimeType = (file as any).mimeType || indexedFile.metadata?.mimeType || file.encodingFormat || indexedFile.metadata?.encodingFormat || '';
        const hasImageMimeType = mimeType.startsWith('image/');
        const atType = file['@type'] || indexedFile.metadata?.['@type'];
        const isImageObject = Array.isArray(atType) 
          ? atType.some(t => String(t).toLowerCase().includes('image'))
          : String(atType || '').toLowerCase().includes('image');
        const isImage = file.fileType === 'image' || 
          isImageObject ||
          hasImageMimeType ||
          (file.fileType === 'other' && hasImageExtension) ||
          hasImageExtension;
        
        // Check for collection - PRIMARY check: collectionFileIds existence
        // A file is a collection if it has collectionFileIds, regardless of fileType
        // Also check cache for fetched collection data
        // IMPORTANT: Check fileType FIRST to avoid false positives
        let collectionData = indexedFile.metadata?.collection || collectionDataCache.get(fileId);
        const isCollectionFile = (actualFileType === 'collection' || collectionData) && 
                                collectionData &&
                                typeof collectionData === 'object' &&
                                collectionData.collectionFileIds && 
                                Array.isArray(collectionData.collectionFileIds) &&
                                collectionData.collectionFileIds.length > 0;
        
        // Debug: Log collection detection state
        if (actualFileType === 'collection' || collectionData) {
          console.log(`[FullScreenFeed] Collection detection check for ${fileId}:`, {
            actualFileType,
            hasCollectionData: !!collectionData,
            collectionDataType: typeof collectionData,
            hasCollectionFileIds: !!collectionData?.collectionFileIds,
            collectionFileIdsType: Array.isArray(collectionData?.collectionFileIds),
            collectionFileIdsLength: collectionData?.collectionFileIds?.length,
            isCollectionFile
          });
        }
        
        // Trigger thumbnail loading for collection files immediately when collection is detected
        // (don't wait for visibleFileId to be set)
        console.log(`[FullScreenFeed] PRE-CHECK: fileId=${fileId}, isCollectionFile=${isCollectionFile}, hasCollectionData=${!!collectionData}, hasCollectionFileIds=${!!collectionData?.collectionFileIds}`);
        
        if (isCollectionFile && collectionData?.collectionFileIds) {
          const collectionFileIds = collectionData.collectionFileIds;
          
          // Check if we've already triggered loading for this collection
          const alreadyTriggered = triggeredImmediateLoadRef.current.has(fileId);
          
          console.log(`[FullScreenFeed] IMMEDIATE LOAD CHECK: Collection ${fileId}`, {
            isCollectionFile,
            hasCollectionData: !!collectionData,
            hasCollectionFileIds: !!collectionData?.collectionFileIds,
            collectionFileIdsLength: collectionFileIds?.length,
            alreadyTriggered,
            thumbnailsMapSize: thumbnails.size
          });
          
          // Debug: Log the state of all collection file IDs
          const thumbnailStates = collectionFileIds.map((cfId: string) => ({
            fileId: cfId,
            inThumbnails: thumbnails.has(cfId),
            inExternalThumbnails: externalThumbnails?.has(cfId) || false,
            inLoadingRef: loadingCollectionThumbnailsRef.current.has(cfId)
          }));
          console.log(`[FullScreenFeed] IMMEDIATE LOAD: Collection ${fileId} thumbnail states:`, thumbnailStates);
          
          const missingThumbnailIds = collectionFileIds.filter(
            (cfId: string) => 
              !thumbnails.has(cfId) && 
              (!externalThumbnails || !externalThumbnails.has(cfId)) &&
              !loadingCollectionThumbnailsRef.current.has(cfId)
          );
          
          console.log(`[FullScreenFeed] IMMEDIATE LOAD: Collection ${fileId} missing thumbnails check:`, {
            totalCollectionFileIds: collectionFileIds.length,
            missingCount: missingThumbnailIds.length,
            missingIds: missingThumbnailIds,
            thumbnailsMapSize: thumbnails.size,
            loadingRefSize: loadingCollectionThumbnailsRef.current.size,
            loadingRefIds: Array.from(loadingCollectionThumbnailsRef.current)
          });
          
          if (missingThumbnailIds.length > 0 && !alreadyTriggered) {
            console.log(`[FullScreenFeed] IMMEDIATE LOAD: Triggering thumbnail load for collection ${fileId} (${missingThumbnailIds.length} missing):`, missingThumbnailIds);
            triggeredImmediateLoadRef.current.add(fileId);
            // Mark as loading
            missingThumbnailIds.forEach((cfId: string) => {
              loadingCollectionThumbnailsRef.current.add(cfId);
              loadingStartTimesRef.current.set(cfId, Date.now());
            });
            
            // Load thumbnails asynchronously (fire and forget)
            (async () => {
              try {
                // Wait for authentication before attempting to load
                if (!userState.isUnlocked) {
                  console.log(`[FullScreenFeed] IMMEDIATE LOAD: User not authenticated, will retry when authenticated`);
                  // Don't clear loading states - we'll retry when authenticated
                  return;
                }
                
                const { PNOAuthService } = await import('../services/pnOAuthService');
                const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
                const accessToken = await PNOAuthService.getValidAccessToken();
                
                console.log(`[FullScreenFeed] IMMEDIATE LOAD: Got access token: ${!!accessToken}`);
                
                if (!accessToken) {
                  console.warn(`[FullScreenFeed] IMMEDIATE LOAD: No access token, will retry when available`);
                  // Don't clear loading states - we'll retry when token is available
                  return;
                }
                
                await Promise.all(missingThumbnailIds.map(async (cfId: string) => {
                  console.log(`[FullScreenFeed] IMMEDIATE LOAD: Starting to load thumbnail for collection file ${cfId}`);
                  let success = false;
                  let collectionFileMetadata: any = null;
                  let accountId: string | null = null;
                  
                  try {
                    console.log(`[FullScreenFeed] IMMEDIATE LOAD: About to fetch metadata for ${cfId}, accessToken exists: ${!!accessToken}`);
                    // Fetch metadata for this collection file
                    const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${cfId}`, {
                      headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    console.log(`[FullScreenFeed] IMMEDIATE LOAD: Response for ${cfId}:`, {
                      status: metadataResponse.status,
                      statusText: metadataResponse.statusText,
                      ok: metadataResponse.ok,
                      headers: Object.fromEntries(metadataResponse.headers.entries())
                    });
                    
                    if (!metadataResponse.ok) {
                      const errorText = await metadataResponse.text().catch(() => 'Could not read error response');
                      console.error(`[FullScreenFeed] Failed to fetch metadata for collection file ${cfId}:`, {
                        status: metadataResponse.status,
                        statusText: metadataResponse.statusText,
                        errorBody: errorText
                      });
                      clearLoadingState(cfId);
                      return;
                    }
                    
                    const metadataData = await metadataResponse.json();
                    collectionFileMetadata = metadataData.metadata || metadataData;
                    
                    // Log FULL metadata to see what we're working with
                    console.log(`[FullScreenFeed] IMMEDIATE LOAD: FULL Metadata for ${cfId}:`, collectionFileMetadata);
                    console.log(`[FullScreenFeed] IMMEDIATE LOAD: Metadata summary for ${cfId}:`, {
                      hasPublicToken: !!collectionFileMetadata.publicToken,
                      hasThumbnailFileId: !!collectionFileMetadata.thumbnailFileId,
                      thumbnailFileId: collectionFileMetadata.thumbnailFileId,
                      fileName: collectionFileMetadata.name || collectionFileMetadata.title,
                      fileType: collectionFileMetadata.fileType,
                      isThumbnailFile: (collectionFileMetadata.name || collectionFileMetadata.title || '').toLowerCase().startsWith('thumb_'),
                      accountId: collectionFileMetadata.accountId || collectionFileMetadata.backendFileId,
                      allKeys: Object.keys(collectionFileMetadata)
                    });
                    
                    // Get accountId
                    accountId = collectionFileMetadata.accountId || collectionFileMetadata.backendFileId;
                    if (!accountId || !accountId.includes('::')) {
                      const pnIdentifier = collectionFileMetadata.creatorId || collectionFileMetadata.creator?.identifier?.value || 
                                           collectionFileMetadata.creator?.["@id"] || collectionFileMetadata.author?.did;
                      if (pnIdentifier && !accountIdCacheRef.current) {
                        try {
                          const accountResponse = await fetch(`${apiEndpoint}/api/users/${encodeURIComponent(pnIdentifier)}/accounts`, {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                          });
                          if (accountResponse.ok) {
                            const accounts = await accountResponse.json();
                            if (Array.isArray(accounts) && accounts.length > 0) {
                              accountId = accounts[0].id;
                              accountIdCacheRef.current = accountId;
                            }
                          }
                        } catch (err) {
                          console.warn(`[FullScreenFeed] Failed to get accountId for collection file ${cfId}:`, err);
                        }
                      } else if (accountIdCacheRef.current) {
                        accountId = accountIdCacheRef.current;
                      }
                    } else if (accountId) {
                      accountIdCacheRef.current = accountId;
                    }
                    
                    // Try to load thumbnail
                    const fileName = (collectionFileMetadata.name || collectionFileMetadata.title || '').toLowerCase();
                    const isThumbnailFile = fileName.startsWith('thumb_');
                    
                    // PRIORITY 1: If this IS a thumbnail file, decrypt using publicToken
                    if (isThumbnailFile && collectionFileMetadata.publicToken) {
                      try {
                        const { decryptWithToken } = await import('../utils/tokenDecryption');
                        let token: ShareToken;
                        try {
                          token = typeof collectionFileMetadata.publicToken === 'string' 
                            ? JSON.parse(collectionFileMetadata.publicToken) 
                            : collectionFileMetadata.publicToken;
                        } catch (e) {
                          loadingCollectionThumbnailsRef.current.delete(cfId);
                          return;
                        }
                        
                        const decryptedBlob = await decryptWithToken(token);
                        const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                        
                        setThumbnails(prev => {
                          const newMap = new Map(prev);
                          newMap.set(cfId, thumbnailUrlObj);
                          return newMap;
                        });
                        
                        console.log(`[FullScreenFeed] Loaded thumbnail for collection file ${cfId} via publicToken`);
                        success = true;
                        clearLoadingState(cfId);
                        return;
                      } catch (decryptErr) {
                        console.warn(`[FullScreenFeed] Failed to decrypt thumbnail with publicToken for ${cfId}:`, decryptErr);
                      }
                    }
                    
                    // PRIORITY 2: Check for thumbnailFileId
                    const thumbnailFileId = collectionFileMetadata.thumbnailFileId;
                    if (thumbnailFileId) {
                      let thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailFileId}?thumbnail=true`;
                      if (accountId && accountId.includes('::')) {
                        thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
                      }
                      
                      let response = await fetch(thumbnailUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                      });
                      
                      if (response.status === 401) {
                        const refreshedToken = await PNOAuthService.getValidAccessToken(true);
                        if (refreshedToken) {
                          response = await fetch(thumbnailUrl, {
                            headers: { 'Authorization': `Bearer ${refreshedToken}` }
                          });
                        }
                      }
                      
                      if (response.ok) {
                        const contentType = response.headers.get('content-type') || '';
                        const blob = await response.blob();
                        
                        let thumbnailBlob: Blob;
                        if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                          const { EncryptionManager } = await import('../utils/encryptionManager');
                          const session = PNOAuthService.loadSession();
                          if (session?.did) {
                            const pnId = session.did;
                            let publicKey = session?.publicKey;
                            if (!publicKey && session.did.startsWith('did:key:')) {
                              publicKey = session.did.substring(8);
                            }
                            if (publicKey) {
                              const encryptedText = await blob.text();
                              const encryptedPackage = JSON.parse(encryptedText);
                              const encryptionManager = new EncryptionManager();
                              const decryptedData = await encryptionManager.decrypt(
                                encryptedPackage.encrypted,
                                encryptedPackage.iv,
                                encryptedPackage.salt,
                                pnId,
                                publicKey
                              );
                              const arrayBuffer = decryptedData.buffer.slice(decryptedData.byteOffset, decryptedData.byteOffset + decryptedData.byteLength) as ArrayBuffer;
                              thumbnailBlob = new Blob([arrayBuffer], {
                                type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                              });
                            } else {
                              loadingCollectionThumbnailsRef.current.delete(cfId);
                              return;
                            }
                          } else {
                            loadingCollectionThumbnailsRef.current.delete(cfId);
                            return;
                          }
                        } else {
                          thumbnailBlob = blob;
                        }
                        
                        const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
                        setThumbnails(prev => {
                          const newMap = new Map(prev);
                          newMap.set(cfId, thumbnailUrlObj);
                          return newMap;
                        });
                        
                        console.log(`[FullScreenFeed] Loaded thumbnail for collection file ${cfId} via thumbnailFileId`);
                        success = true;
                        clearLoadingState(cfId);
                        return;
                      }
                    }
                    
                    // PRIORITY 3: Try API endpoint with ?thumbnail=true
                    let thumbnailUrl = `${apiEndpoint}/api/drive/files/${cfId}?thumbnail=true`;
                    if (accountId && accountId.includes('::')) {
                      thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
                    }
                    
                    let response = await fetch(thumbnailUrl, {
                      headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    if (response.status === 401) {
                      const refreshedToken = await PNOAuthService.getValidAccessToken(true);
                      if (refreshedToken) {
                        response = await fetch(thumbnailUrl, {
                          headers: { 'Authorization': `Bearer ${refreshedToken}` }
                        });
                      }
                    }
                    
                    if (response.ok) {
                      const contentType = response.headers.get('content-type') || '';
                      const blob = await response.blob();
                      
                      let thumbnailBlob: Blob | null = null;
                      if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                        const { EncryptionManager } = await import('../utils/encryptionManager');
                        const session = PNOAuthService.loadSession();
                        if (session?.did) {
                          const pnId = session.did;
                          let publicKey = session?.publicKey;
                          if (!publicKey && session.did.startsWith('did:key:')) {
                            publicKey = session.did.substring(8);
                          }
                          if (publicKey) {
                            try {
                              const encryptedText = await blob.text();
                              const encryptedPackage = JSON.parse(encryptedText);
                              const encryptionManager = new EncryptionManager();
                              const decryptedData = await encryptionManager.decrypt(
                                encryptedPackage.encrypted,
                                encryptedPackage.iv,
                                encryptedPackage.salt,
                                pnId,
                                publicKey
                              );
                              const arrayBuffer = decryptedData.buffer.slice(decryptedData.byteOffset, decryptedData.byteOffset + decryptedData.byteLength) as ArrayBuffer;
                              thumbnailBlob = new Blob([arrayBuffer], {
                                type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                              });
                            } catch (decryptErr) {
                              console.warn(`[FullScreenFeed] Failed to decrypt thumbnail for collection file ${cfId}:`, decryptErr);
                              thumbnailBlob = null;
                            }
                          }
                        }
                      } else {
                        thumbnailBlob = blob;
                      }
                      
                      if (thumbnailBlob) {
                        const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
                        setThumbnails(prev => {
                          const newMap = new Map(prev);
                          newMap.set(cfId, thumbnailUrlObj);
                          return newMap;
                        });
                        
                        console.log(`[FullScreenFeed] Loaded thumbnail for collection file ${cfId} via API endpoint`);
                        success = true;
                        clearLoadingState(cfId);
                        return; // Success - exit early
                      } else {
                        console.warn(`[FullScreenFeed] Failed to decrypt/process thumbnail for collection file ${cfId}`);
                        clearLoadingState(cfId);
                      }
                    } else {
                      console.warn(`[FullScreenFeed] API endpoint returned non-OK status for collection file ${cfId}:`, response.status);
                      clearLoadingState(cfId);
                    }
                  } catch (err) {
                    console.error(`[FullScreenFeed] ERROR loading thumbnail for collection file ${cfId}:`, err);
                    console.error(`[FullScreenFeed] Error stack:`, err instanceof Error ? err.stack : 'No stack trace');
                    clearLoadingState(cfId);
                  }
                  
                  // Final fallback: if all else failed and file is image/video, try loading the file itself
                  if (!success) {
                    try {
                      const fileType = collectionFileMetadata?.fileType || '';
                      const isImageOrVideo = fileType === 'image' || fileType === 'video';
                      
                      if (isImageOrVideo && accountId) {
                        console.log(`[FullScreenFeed] IMMEDIATE LOAD: Trying final fallback - load file directly for ${cfId}`);
                        let fileUrl = `${apiEndpoint}/api/drive/files/${cfId}?thumbnail=true`;
                        if (accountId && accountId.includes('::')) {
                          fileUrl += `&accountId=${encodeURIComponent(accountId)}`;
                        }
                        
                        const fileResponse = await fetch(fileUrl, {
                          headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        
                        if (fileResponse.ok) {
                          const fileBlob = await fileResponse.blob();
                          const contentType = fileResponse.headers.get('content-type') || '';
                          
                          if (contentType.startsWith('image/')) {
                            const thumbnailUrlObj = URL.createObjectURL(fileBlob);
                            setThumbnails(prev => {
                              const newMap = new Map(prev);
                              newMap.set(cfId, thumbnailUrlObj);
                              return newMap;
                            });
                            console.log(`[FullScreenFeed] IMMEDIATE LOAD: SUCCESS - loaded file directly as thumbnail for ${cfId}`);
                            success = true;
                            clearLoadingState(cfId);
                          }
                        }
                      }
                    } catch (fallbackErr) {
                      console.warn(`[FullScreenFeed] IMMEDIATE LOAD: Fallback also failed for ${cfId}:`, fallbackErr);
                    }
                  }
                  
                  // Log final result
                  if (!success) {
                    console.warn(`[FullScreenFeed] IMMEDIATE LOAD: FAILED to load thumbnail for ${cfId} - no successful path executed`);
                  } else {
                    console.log(`[FullScreenFeed] IMMEDIATE LOAD: SUCCESS loading thumbnail for ${cfId}`);
                  }
                }));
                
                // Log summary after all thumbnails are processed
                console.log(`[FullScreenFeed] IMMEDIATE LOAD: Completed processing ${missingThumbnailIds.length} thumbnails`);
                missingThumbnailIds.forEach((cfId: string) => {
                  const loaded = thumbnails.has(cfId) || (externalThumbnails?.has(cfId));
                  console.log(`[FullScreenFeed] IMMEDIATE LOAD: ${cfId} - ${loaded ? 'LOADED' : 'FAILED'}`);
                });
              } catch (err) {
                console.error(`[FullScreenFeed] Error loading collection thumbnails:`, err);
                missingThumbnailIds.forEach((cfId: string) => clearLoadingState(cfId));
              }
            })();
          }
        }
        
        // If fileType is 'collection' but collection data is missing, fetch it
        // Use ref to prevent multiple simultaneous fetches
        if (actualFileType === 'collection' && !collectionData && !collectionDataCache.has(fileId) && !fetchingCollectionRef.current.has(fileId)) {
          fetchingCollectionRef.current.add(fileId);
          
          // Fetch collection data asynchronously
          (async () => {
            try {
              const { PNOAuthService } = await import('../services/pnOAuthService');
              const accessToken = await PNOAuthService.getValidAccessToken();
              if (!accessToken) {
                fetchingCollectionRef.current.delete(fileId);
                return;
              }
              
              console.log(`[FullScreenFeed] Fetching collection data for ${fileId}`);
              const response = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              
              if (response.ok) {
                const data = await response.json();
                console.log(`[FullScreenFeed] API response for collection ${fileId}:`, {
                  hasMetadata: !!data.metadata,
                  hasCollection: !!data.metadata?.collection,
                  hasTopLevelCollection: !!data.collection,
                  metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
                  dataKeys: Object.keys(data),
                  fullResponse: JSON.stringify(data, null, 2)
                });
                
                const fetchedCollection = data.metadata?.collection || data.collection;
                if (fetchedCollection?.collectionFileIds) {
                  console.log(`[FullScreenFeed] Successfully fetched collection data for ${fileId}:`, fetchedCollection);
                  setCollectionDataCache(prev => {
                    const newMap = new Map(prev);
                    newMap.set(fileId, fetchedCollection);
                    return newMap;
                  });
                } else {
                  console.warn(`[FullScreenFeed] Collection data fetch returned no collectionFileIds for ${fileId}`, {
                    fetchedCollection,
                    dataMetadata: data.metadata,
                    fullData: data
                  });
                }
              } else {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.warn(`[FullScreenFeed] Failed to fetch collection data for ${fileId}: ${response.status}`, errorText);
              }
            } catch (err) {
              console.error(`[FullScreenFeed] Error fetching collection data for ${fileId}:`, err);
            } finally {
              fetchingCollectionRef.current.delete(fileId);
            }
          })();
        }
        
        // DEBUG: Log collection detection
        if (collectionData) {
          console.log(`[FullScreenFeed] Collection check for ${fileId}:`, {
            hasCollectionData: !!collectionData,
            collectionDataType: typeof collectionData,
            hasCollectionFileIds: !!collectionData.collectionFileIds,
            collectionFileIdsType: Array.isArray(collectionData.collectionFileIds),
            collectionFileIdsLength: collectionData.collectionFileIds?.length,
            isCollectionFile,
            actualFileType,
            fileType: file.fileType,
            collectionData: JSON.stringify(collectionData)
          });
        }
        
        // Final detection (collections take precedence)
        const isVideoFinal = isCollectionFile ? false : isVideo;
        const isImageFinal = isCollectionFile ? false : isImage;
        
        // DEBUG: Log final detection results
        if (isCollectionFile || collectionData) {
          console.log(`[FullScreenFeed] Final detection for ${fileId}:`, {
            isCollectionFile,
            isVideo,
            isVideoFinal,
            isImage,
            isImageFinal,
            willRenderCollection: isCollectionFile && collectionData?.collectionFileIds,
            willRenderVideo: isVideoFinal,
            willRenderImage: isImageFinal,
            willRenderFallback: !isImageFinal && !isVideoFinal && !isCollectionFile
          });
        }
        
        // NO THOUGHT DETECTION - thoughts are just images (thumbnails) now!
        
        // Debug logging for image detection (only in development)
        if (process.env.NODE_ENV === 'development' && (file.fileType === 'image' || (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i)) && !isImageFinal) {
          console.warn(`[FullScreenFeed] Image not detected: ${fileId}`);
        }
        
        // Debug logging only in development mode
        if (process.env.NODE_ENV === 'development') {
          const isLikelyImage = file.fileType === 'image' || 
                               !!(file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif)$/i) ||
                               hasImageMimeType;
          
          if (isLikelyImage && !isImageFinal) {
            console.warn(`[FullScreenFeed] Image not rendering: ${fileId}`);
          }
        }
        
        const fileName = file.name || file.title || 'Untitled';
        // Get creatorId - this is now the pN identifier (set from entry.pnIdentifier during conversion)
        const creatorId = (indexedFile.metadata as any).creatorId || 
                          file.creator?.identifier?.value || 
                          file.creator?.["@id"] || 
                          file.author?.did;

        return (
          <div
            key={fileId}
            data-file-id={fileId}
            className="w-full snap-start flex items-center justify-center bg-black relative"
            style={{ 
              // MOBILE FIX: Use actual viewport height (excludes mobile browser UI)
              height: viewportHeightCSS,
              minHeight: viewportHeightCSS,
              maxHeight: viewportHeightCSS,
              // Start at top of window
              marginTop: '0',
              paddingTop: '0',
              boxSizing: 'border-box',
              overflow: 'hidden', // Ensure background doesn't overflow
              position: 'relative', // Ensure proper stacking context
              zIndex: 0 // Ensure all tiles are on the same z-index level
            }}
          >
            {/* Thoughts now render as images (thumbnails) - no special rendering needed! */}
            
            {/* Full-screen video */}
            {isVideoFinal && videoBlobs.get(fileId) && (() => {
              const containerHeight = window.innerHeight - 64; // Account for bottom nav
              const containerWidth = window.innerWidth;
              const containerAspect = containerWidth / containerHeight;
              const dims = mediaDimensions.get(fileId);
              const videoAspect = dims ? dims.width / dims.height : 16/9; // Default to 16:9
              
              // If video is wider than container (widescreen), scale background to fill height
              // If video is taller than container (portrait), scale background to fill width
              const isWidescreen = videoAspect > containerAspect;
              const backgroundStyle: React.CSSProperties = {
                filter: 'blur(40px)',
                opacity: 0.6,
                zIndex: 0,
                position: 'absolute',
                inset: 0,
                ...(isWidescreen 
                  ? { 
                      width: 'auto', 
                      height: '100%',
                      left: '50%',
                      transform: 'translateX(-50%) scale(1.1)'
                    }
                  : { 
                      height: 'auto', 
                      width: '100%',
                      top: '50%',
                      transform: 'translateY(-50%) scale(1.1)'
                    }
                )
              };

              return (
                <>
                  {/* Blurred background video */}
                  <video
                    src={videoBlobs.get(fileId)!}
                    className="absolute"
                    style={backgroundStyle}
                    muted
                    loop
                    playsInline
                    autoPlay={visibleFileId === fileId}
                  />
                  {/* Main video */}
                  <video
                    ref={(el) => {
                      if (el) {
                        videoRefs.current.set(fileId, el);
                        // Track dimensions when loaded
                        el.addEventListener('loadedmetadata', () => {
                          setMediaDimensions(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, { width: el.videoWidth, height: el.videoHeight });
                            return newMap;
                          });
                        });
                        // Track playing state
                        el.addEventListener('play', () => {
                          setVideoPlaying(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, true);
                            return newMap;
                          });
                        });
                        el.addEventListener('pause', () => {
                          setVideoPlaying(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, false);
                            return newMap;
                          });
                        });
                      }
                    }}
                    src={videoBlobs.get(fileId)!}
                    className="w-full object-contain relative z-10"
                    style={{ 
                      // MOBILE FIX: Use actual viewport height (excludes mobile browser UI)
                      maxHeight: viewportHeightCSS,
                      height: 'auto',
                      width: '100%'
                    }}
                    controls={false}
                    muted
                    loop
                    playsInline
                    autoPlay={visibleFileId === fileId}
                  />
                  {/* Playback Controls */}
                  {visibleFileId === fileId && (
                    <div className="absolute top-4 left-4 z-20">
                      <PlaybackControls
                        videoElement={videoRefs.current.get(fileId) || null}
                        isPlaying={videoPlaying.get(fileId) || false}
                        onPlayPause={() => {
                          const videoElement = videoRefs.current.get(fileId);
                          if (videoElement) {
                            if (videoElement.paused) {
                              videoElement.play();
                            } else {
                              videoElement.pause();
                            }
                          }
                        }}
                      />
                    </div>
                  )}
                </>
              );
            })()}
            
            {/* Full-screen image (single image) - Only render if NOT a text post */}
            {/* Show image if detected as image (show placeholder if thumbnail not loaded yet) */}
            {isImageFinal && (() => {
              const thumbnailUrl = thumbnails.get(fileId);
              if (!thumbnailUrl) {
                // Show placeholder while thumbnail loads
                return (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex flex-col items-center justify-center text-neutral-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2"></div>
                      <span className="text-xs">Loading image...</span>
                    </div>
                  </div>
                );
              }
              
              const containerHeight = window.innerHeight - 64; // Account for bottom nav
              const containerWidth = window.innerWidth;
              const containerAspect = containerWidth / containerHeight;
              const dims = mediaDimensions.get(fileId);
              const imageAspect = dims ? dims.width / dims.height : 16/9; // Default to 16:9
              
              // If image is wider than container (widescreen), scale background to fill height
              // If image is taller than container (portrait), scale background to fill width
              const isWidescreen = imageAspect > containerAspect;
              const backgroundStyle: React.CSSProperties = {
                filter: 'blur(40px)',
                opacity: 0.6,
                zIndex: 0,
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                objectFit: 'cover', // Ensure it covers the entire area
                ...(isWidescreen 
                  ? { 
                      width: 'auto', 
                      height: '100%',
                      left: '50%',
                      transform: 'translateX(-50%) scale(1.1)'
                    }
                  : { 
                      height: 'auto', 
                      width: '100%',
                      top: '50%',
                      transform: 'translateY(-50%) scale(1.1)'
                    }
                )
              };

              return (
                <>
                  {/* Blurred background image */}
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="absolute"
                    style={backgroundStyle}
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      console.error(`[FullScreenFeed] Background image failed to load for ${fileId}:`, e);
                      console.error(`[FullScreenFeed] Thumbnail URL:`, thumbnailUrl);
                    }}
                  />
                  {/* Main image container - centers image */}
                  <div className="w-full h-full flex items-center justify-center relative z-10">
                  <img
                    ref={(el) => {
                      if (el) {
                        imageRefs.current.set(fileId, el);
                        // Track dimensions when loaded
                        el.addEventListener('load', () => {
                          setMediaDimensions(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, { width: el.naturalWidth, height: el.naturalHeight });
                            return newMap;
                          });
                        });
                        el.addEventListener('error', (err) => {
                          console.error(`[FullScreenFeed] Image failed to load for ${fileId}:`, err);
                          console.error(`[FullScreenFeed] Image src:`, el.src);
                          console.error(`[FullScreenFeed] Thumbnail URL:`, thumbnailUrl);
                        });
                      }
                    }}
                    src={thumbnailUrl}
                    alt={fileName}
                    style={{ 
                        // Fill container while maintaining aspect ratio
                        height: '100%',
                        width: '100%',
                        objectFit: 'contain', // Maintain aspect ratio, fill container
                        imageRendering: 'auto' as const,
                        // Prevent pixelation and ensure high quality
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'translateZ(0)' // Force hardware acceleration
                      }}
                      loading="eager"
                      decoding="sync"
                      onError={(e) => {
                        console.error(`[FullScreenFeed] Main image failed to load for ${fileId}:`, e);
                        console.error(`[FullScreenFeed] Image src:`, (e.target as HTMLImageElement).src);
                      }}
                    />
                  </div>
                </>
              );
            })()}

            {/* Collection - Simple thumbnail slideshow */}
            {isCollectionFile && (collectionData || collectionDataCache.get(fileId))?.collectionFileIds ? (
              (() => {
                // Use cached collection data if available
                const finalCollectionData = collectionData || collectionDataCache.get(fileId);
                
                console.log(`[FullScreenFeed] RENDERING COLLECTION for ${fileId}:`, {
                  fileId,
                  collectionFileIds: finalCollectionData.collectionFileIds,
                  collectionFileIdsLength: finalCollectionData.collectionFileIds.length,
                  thumbnailsMapSize: thumbnails.size,
                  thumbnailsMapKeys: Array.from(thumbnails.keys()),
                  isCollectionFile,
                  hasCollectionData: !!finalCollectionData,
                  fromCache: !!collectionDataCache.get(fileId)
                });
                
                // Get thumbnails from Map for collection file IDs
                const collectionThumbnails = finalCollectionData.collectionFileIds
                  .map((fileId: string): string | undefined => {
                    const thumbnail = thumbnails.get(fileId);
                    console.log(`[FullScreenFeed] Thumbnail lookup for collection file ${fileId}:`, {
                      found: !!thumbnail,
                      url: thumbnail || 'NOT FOUND'
                    });
                    return thumbnail;
                  })
                  .filter((url: string | undefined): url is string => url !== undefined);
                
                console.log(`[FullScreenFeed] Collection thumbnails result for ${fileId}:`, {
                  requestedCount: finalCollectionData.collectionFileIds.length,
                  foundCount: collectionThumbnails.length,
                  thumbnailUrls: collectionThumbnails
                });
                
                if (collectionThumbnails.length > 0) {
                  console.log(`[FullScreenFeed] Rendering slideshow with ${collectionThumbnails.length} thumbnails for ${fileId}`);
                  // Render horizontal slideshow of thumbnails
                  return (
                    <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                      {collectionThumbnails.map((thumbnailUrl: string, idx: number) => (
                        <div
                          key={`${fileId}-${idx}`}
                          className="flex-shrink-0 w-full h-full snap-start"
                        >
                          <img
                            src={thumbnailUrl}
                            alt={`${fileName} - ${idx + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error(`[FullScreenFeed] Thumbnail failed to load for collection ${fileId}, index ${idx}:`, thumbnailUrl);
                              e.currentTarget.src = '/placeholder-thumbnail.png';
                            }}
                            onLoad={() => {
                              console.log(`[FullScreenFeed] Thumbnail loaded successfully for collection ${fileId}, index ${idx}`);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  );
                } else {
                  console.warn(`[FullScreenFeed] No thumbnails found for collection ${fileId}, showing placeholder`);
                  // Fallback: show placeholder if no thumbnails available
                  return (
                    <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400">
                      <div className="text-4xl mb-2">📚</div>
                      <div className="text-sm">Collection</div>
                      <div className="text-xs mt-1">{finalCollectionData.collectionFileIds.length} files</div>
                    </div>
                  );
                }
              })()
            ) : (() => {
              // DEBUG: Log why collection is NOT rendering
              if (collectionData) {
                console.log(`[FullScreenFeed] Collection NOT rendering for ${fileId}:`, {
                  isCollectionFile,
                  hasCollectionData: !!collectionData,
                  hasCollectionFileIds: !!collectionData.collectionFileIds,
                  collectionFileIds: collectionData.collectionFileIds,
                  reason: !isCollectionFile ? 'isCollectionFile is false' : !collectionData?.collectionFileIds ? 'no collectionFileIds' : 'unknown'
                });
              }
              return null;
            })()}

            {/* Non-image/video/slideshow/collection file */}
            {!isImageFinal && !isVideoFinal && !isCollectionFile && (
              <div className="flex flex-col items-center justify-center text-neutral-500">
                <File className="h-24 w-24 mb-4" />
                <h3 className="text-white text-xl font-medium mb-2">{cleanTitle(fileName)}</h3>
                <p className="text-text-secondary text-sm">{file.fileType || 'File'}</p>
              </div>
            )}
            
            {/* Engagement Sidebar - Right Side */}
            <FeedEngagementSidebar
              file={{
                ...indexedFile,
                metadata: {
                  ...indexedFile.metadata,
                  engagement: {
                    ...indexedFile.metadata.engagement,
                    views: indexedFile.metadata.engagement?.views || 0,
                    likes: getLikeCount(fileId, indexedFile.metadata.engagement?.likes || 0),
                    comments: getComments(fileId).length + (indexedFile.metadata.engagement?.comments || 0),
                    shares: getShareCount(fileId, indexedFile.metadata.engagement?.shares || 0),
                    lastUpdated: indexedFile.metadata.engagement?.lastUpdated || new Date().toISOString()
                  }
                }
              }}
              isLiked={isLiked(fileId)}
              onLike={() => {
                if (visibleFileId === fileId && showEngagementOverlay) {
                  setShowEngagementOverlay(false);
                }
                onLike(fileId);
              }}
              onComment={() => {
                console.log('[FullScreenFeed] onComment called', { fileId, indexedFile: !!indexedFile });
                if (visibleFileId === fileId && showEngagementOverlay) {
                  setShowEngagementOverlay(false);
                }
                if (onComment && indexedFile) {
                  console.log('[FullScreenFeed] Calling onComment with file', indexedFile.metadata.fileId);
                  onComment(indexedFile);
                } else {
                  console.warn('[FullScreenFeed] onComment or indexedFile is missing', { onComment: !!onComment, indexedFile: !!indexedFile });
                }
              }}
              onShare={async () => {
                _onShare(fileId);
                // Directly copy link to clipboard
                const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  // Could show a toast here if needed
                } catch (err) {
                  console.error('Failed to copy link:', err);
                }
              }}
              onAddToFeed={onAddToFeed ? () => onAddToFeed(indexedFile) : undefined}
              onEdit={onEdit ? () => onEdit(indexedFile) : undefined}
              isOwner={!!(userState.isUnlocked && userState.pnIdentifier && (
                creatorId === userState.pnIdentifier
              ))}
              onCreatorClick={onCreatorClick}
              onMessage={onMessage}
              indexedFiles={files}
            />

            {/* Engagement Overlay - Show when like/comment/save is clicked (share now directly copies) */}
            {visibleFileId === fileId && showEngagementOverlay && (
              <EngagementOverlay
                file={indexedFile}
                isLiked={isLiked(fileId)}
                likeCount={getLikeCount(fileId, indexedFile.metadata.engagement?.likes || 0)}
                commentCount={getComments(fileId).length + (indexedFile.metadata.engagement?.comments || 0)}
                shareCount={getShareCount(fileId, indexedFile.metadata.engagement?.shares || 0)}
                onLike={() => onLike(fileId)}
                onComment={() => {
                  setShowEngagementOverlay(false);
                  onComment(indexedFile);
                }}
                onShare={async () => {
                _onShare(fileId);
                  // Copy link to clipboard
                  const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setShowEngagementOverlay(false);
                  } catch (err) {
                    console.error('Failed to copy link:', err);
                  }
                }}
                onSave={onSave ? () => onSave(indexedFile) : undefined}
                onClose={() => setShowEngagementOverlay(false)}
                isOpen={showEngagementOverlay}
              />
            )}

            {/* Content Info Overlay - Split into two halves */}
            {(() => {
              const hasPaginationCircles = false;
              
              return (
                <div 
                  className={`absolute left-0 right-20 p-4 md:p-6 transition-all duration-300 z-30 ${
                    expandedCaptions.has(fileId) 
                      ? 'bottom-0' 
                      : 'bottom-0'
                  }`}
                  style={{ 
                    maxHeight: expandedCaptions.has(fileId) ? '70%' : 'auto',
                    overflowY: expandedCaptions.has(fileId) ? 'auto' : 'hidden',
                    overflowX: 'hidden',
                    // MOBILE FIX: Position above pagination circles if they exist (48px), otherwise at bottom (0)
                    bottom: hasPaginationCircles ? '48px' : '0',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    zIndex: 30 // Ensure it's above media (z-10) and background (z-0)
                  }}
                >
              <div className="flex gap-4">
                {/* Left Half - Title & Caption */}
                <div className="flex-1">
                  {/* Title */}
                  <h3 className="text-white text-base md:text-lg font-semibold mb-1 line-clamp-1">
                    {cleanTitle(file.title || file.name || 'Untitled')}
                  </h3>
                  
                  {/* Caption with expand/collapse */}
                  {file.description && (
                    <div className="mb-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCaptions(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(fileId)) {
                              newSet.delete(fileId);
                            } else {
                              newSet.add(fileId);
                            }
                            return newSet;
                          });
                        }}
                        className="text-left w-full"
                      >
                        <p 
                          className={`text-white/90 text-sm leading-relaxed ${
                            expandedCaptions.has(fileId) 
                              ? '' 
                              : 'line-clamp-2'
                          }`}
                        >
                          {file.description}
                        </p>
                        {/* Show expand/collapse if description is long enough to potentially need more than 2 lines */}
                        {(file.description.length > 100 || file.description.split('\n').length > 2) && (
                          <span className="text-white/70 text-xs mt-1 inline-block hover:text-white transition-colors">
                            {expandedCaptions.has(fileId) ? 'Show less' : 'Tap to expand'}
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                  
                  {/* Metadata Tags/Category */}
                  {(file.keywords || file.tags || file.category) && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {file.category && (
                        <span className="px-2 py-1 bg-blue-500/30 text-blue-200 text-xs rounded-full border border-blue-400/50">
                          {file.category}
                        </span>
                      )}
                      {(file.keywords || file.tags || []).slice(0, 5).map((tag, tagIdx) => (
                        <span
                          key={tagIdx}
                          className="px-2 py-1 bg-white/20 text-white text-xs rounded-full"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Timestamp */}
                  {file.uploadDate && (
                    <div className="text-white/70 text-xs mb-2">
                      {formatTimestamp(file.uploadDate)}
                    </div>
                  )}
                  
                  {/* NSFW Badge */}
                  {file.metadata?.isNSFW && (
                    <div className="flex items-center space-x-2">
                      <ContentRatingBadge isNSFW={file.metadata?.isNSFW || false} size="sm" />
                    </div>
                  )}
                </div>

                {/* Right Half - Live Comments */}
                <div className="flex-1 flex items-center">
                  {(() => {
                    // Only show comments for the currently visible file
                    if (visibleFileId !== fileId) {
                      return null;
                    }
                    
                    const allComments = getComments(fileId);
                    const popularComments = getPopularComments(fileId);
                    
                    // If on Comments tab, show user's comment statically
                    if (mePageTab === 'comments' && userState.pnIdentifier) {
                      const userComment = allComments?.find((comment: any) => 
                        comment.authorId === userState.pnIdentifier || 
                        comment.authorId === `pn-${userState.pnIdentifier}` ||
                        (userState.pnIdentifier && comment.authorId === userState.pnIdentifier.replace(/^pn-/, ''))
                      );
                      
                      if (userComment) {
                        const likeCount = Array.isArray(userComment.likes) ? userComment.likes.length : 0;
                        return (
                          <div
                            className="bg-transparent rounded-lg p-3 w-full cursor-pointer hover:bg-black/20 transition-colors"
                            style={{
                              opacity: 1,
                              transition: 'background-color 200ms ease-in-out'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Open comment modal when clicking on comment
                              onComment(indexedFile);
                            }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-white/90 text-xs font-semibold">
                                {userComment.authorName || 'You'}
                              </span>
                              {likeCount > 0 && (
                                <span className="text-white/70 text-xs flex items-center gap-1">
                                  <span>❤️</span>
                                  <span>{likeCount}</span>
                                </span>
                              )}
                            </div>
                            <p className="text-white text-sm line-clamp-2 leading-snug">
                              {userComment.content}
                            </p>
                          </div>
                        );
                      }
                    }
                    
                    // If no comments, don't show anything
                    if (popularComments.length === 0) {
                      return null;
                    }
                    
                    const currentIndex = currentCommentIndex.get(fileId) ?? 0;
                    const opacity = commentOpacity.get(fileId) ?? 1;
                    const currentComment = popularComments[currentIndex];
                    
                    if (!currentComment) {
                      return null;
                    }
                    
                    const likeCount = Array.isArray(currentComment.likes) ? currentComment.likes.length : 0;
                    
                    return (
                      <div
                        className="bg-transparent rounded-lg p-3 w-full cursor-pointer hover:bg-black/20 transition-colors"
                        style={{
                          opacity,
                          transition: 'opacity 200ms ease-in-out, background-color 200ms ease-in-out'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Open comment modal when clicking on comment
                          onComment(indexedFile);
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white/90 text-xs font-semibold">
                            {currentComment.authorName || 'Anonymous'}
                          </span>
                          {likeCount > 0 && (
                            <span className="text-white/70 text-xs flex items-center gap-1">
                              <span>❤️</span>
                              <span>{likeCount}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-white text-sm line-clamp-2 leading-snug">
                          {currentComment.content}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

