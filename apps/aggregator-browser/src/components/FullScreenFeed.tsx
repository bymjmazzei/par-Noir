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
import { ShareToken } from '../utils/tokenDecryption';
import { cleanTitle } from '../utils/cleanTitle';
import { calculateMediaScaling, getContainerDimensions } from '../utils/mediaScaling';

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
  // CACHE BUSTER: Version: 2024-12-19-v4
  (window as any).__fullScreenFeedVersion = '2024-12-19-v4';
  
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
  
  useEffect(() => {
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

  // Wrapper for onIndexChange with bounds checking
  const handleIndexChange = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= files.length) {
      return; // Prevent going beyond bounds
    }
    onIndexChange(newIndex);
  }, [files.length, onIndexChange]);
  
  // Prevent scrolling beyond content bounds
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (container.scrollTop > maxScroll) {
        container.scrollTop = maxScroll;
      }
      if (container.scrollTop < 0) {
        container.scrollTop = 0;
      }
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Handle vertical swipe for next/previous media
  const verticalSwipeRef = useVerticalSwipe({
    onSwipeUp: () => {
      if (currentIndex < files.length - 1) {
        handleIndexChange(currentIndex + 1);
      }
    },
    onSwipeDown: () => {
      if (currentIndex > 0) {
        handleIndexChange(currentIndex - 1);
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

  // Load thumbnails for all thumbnail files in the feed
  // Browser is stateless - public files use publicToken only (no session fallback)
  // The token contains the encrypted data, so we don't need to fetch from API
  useEffect(() => {
    const loadThumbnails = async () => {
      // Process ALL files in the feed to find thumbnail files
      const thumbnailFiles = files.filter((indexedFile) => {
        const fileName = (indexedFile.metadata?.name || indexedFile.metadata?.title || '').toLowerCase();
        return fileName.startsWith('thumb_');
      });

      // Load each thumbnail file
      await Promise.all(thumbnailFiles.map(async (indexedFile) => {
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        const fileName = file.name || file.title || '';
        
        // Skip if already loaded or provided externally
        if (thumbnails.has(fileId) || (externalThumbnails && externalThumbnails.has(fileId))) {
          return;
        }

        // Get publicToken (REQUIRED - no fallback)
        const publicToken = indexedFile.publicToken || file.publicToken;
        if (!publicToken) {
          console.warn(`[FullScreenFeed] Thumbnail ${fileId} (${fileName}) has no publicToken - cannot decrypt`);
          return;
        }

        try {
          // Parse publicToken
          let token: ShareToken;
          try {
            token = typeof publicToken === 'string' ? JSON.parse(publicToken) : publicToken;
          } catch (e) {
            console.warn(`[FullScreenFeed] Failed to parse token for thumbnail ${fileId}:`, e);
            return;
          }
          
          // Decrypt using token directly (token contains shareEncrypted data)
          // No need to fetch from API - the token has everything we need
          const { decryptWithToken } = await import('../utils/tokenDecryption');
          const decryptedBlob = await decryptWithToken(token);
          const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
          
          setThumbnails(prev => {
            const newMap = new Map(prev);
            newMap.set(fileId, thumbnailUrlObj);
            return newMap;
          });
        } catch (err) {
          console.error(`[FullScreenFeed] Failed to decrypt thumbnail for ${fileId} (${fileName}):`, err);
        }
      }));
    };

    loadThumbnails();
  }, [files, externalThumbnails, thumbnails]);

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

    // Trigger thumbnail loading by clearing the "already triggered" flag
    // This will cause the immediate load check to run again
    triggeredImmediateLoadRef.current.delete(fileId);
  }, [userState.isUnlocked, currentIndex, files, thumbnails, externalThumbnails]);

  // Helper function to immediately load thumbnails for a collection
  const loadCollectionThumbnailsImmediate = async (fileId: string, collectionData: any) => {
    const collectionFileIds = collectionData.collectionFileIds || [];
    const thumbnailTokens = collectionData.thumbnailTokens || {}; // Get tokens from collection data if available
    
    // DEBUG: Log token details
    console.log(`[FullScreenFeed] Collection ${fileId} token analysis:`, {
      collectionFileIdsCount: collectionFileIds.length,
      thumbnailTokensKeys: Object.keys(thumbnailTokens),
      thumbnailTokensCount: Object.keys(thumbnailTokens).length,
      firstCollectionFileId: collectionFileIds[0],
      firstTokenKey: Object.keys(thumbnailTokens)[0],
      tokensMatch: collectionFileIds.map((id: string) => ({
        id,
        hasToken: !!thumbnailTokens[id],
        tokenPreview: thumbnailTokens[id] ? thumbnailTokens[id].substring(0, 50) + '...' : 'NO TOKEN'
      }))
    });
    
    const missingThumbnailIds = collectionFileIds.filter(
      (cfId: string) => 
        !thumbnails.has(cfId) && 
        (!externalThumbnails || !externalThumbnails.has(cfId)) &&
        !loadingCollectionThumbnailsRef.current.has(cfId)
    );
    
    if (missingThumbnailIds.length > 0 && !triggeredImmediateLoadRef.current.has(fileId)) {
      triggeredImmediateLoadRef.current.add(fileId);
      
      // Mark as loading
      missingThumbnailIds.forEach((cfId: string) => {
        loadingCollectionThumbnailsRef.current.add(cfId);
        loadingStartTimesRef.current.set(cfId, Date.now());
      });
      
      // Load thumbnails asynchronously
      (async () => {
        try {
          const { decryptWithToken } = await import('../utils/tokenDecryption');
          
          // FIRST: Try to use tokens from collection data (fastest - no API call)
          const thumbnailsWithTokens = missingThumbnailIds.filter((cfId: string) => !!thumbnailTokens[cfId]);
          if (thumbnailsWithTokens.length > 0) {
            
            // PRIORITY: Decrypt the first thumbnail immediately to show it ASAP
            const firstThumbnailId = thumbnailsWithTokens[0];
            if (firstThumbnailId) {
              try {
                const startTime = Date.now();
                const tokenString = thumbnailTokens[firstThumbnailId];
                const token: ShareToken = typeof tokenString === 'string' ? JSON.parse(tokenString) : tokenString;
                const decryptedBlob = await decryptWithToken(token);
                const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                const decryptTime = Date.now() - startTime;
                
                setThumbnails(prev => {
                  const newMap = new Map(prev);
                  newMap.set(firstThumbnailId, thumbnailUrlObj);
                  return newMap;
                });
                
                console.log(`[FullScreenFeed] ✓ PRIORITY: Decrypted first thumbnail ${firstThumbnailId} in ${decryptTime}ms using token from collection`);
                clearLoadingState(firstThumbnailId);
              } catch (decryptErr) {
                console.warn(`[FullScreenFeed] Failed to decrypt first thumbnail ${firstThumbnailId} with token from collection:`, decryptErr);
                clearLoadingState(firstThumbnailId);
              }
            }
            
            // Then decrypt remaining thumbnails in parallel (skip first one)
            const remainingThumbnails = thumbnailsWithTokens.slice(1);
            if (remainingThumbnails.length > 0) {
              const decryptPromises = remainingThumbnails.map(async (cfId: string) => {
                const startTime = Date.now();
                try {
                  const tokenString = thumbnailTokens[cfId];
                  const token: ShareToken = typeof tokenString === 'string' ? JSON.parse(tokenString) : tokenString;
                  const decryptedBlob = await decryptWithToken(token);
                  const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                  const decryptTime = Date.now() - startTime;
                  
                  setThumbnails(prev => {
                    const newMap = new Map(prev);
                    newMap.set(cfId, thumbnailUrlObj);
                    return newMap;
                  });
                  
                  console.log(`[FullScreenFeed] ✓ Decrypted thumbnail ${cfId} in ${decryptTime}ms using token from collection`);
                  clearLoadingState(cfId);
                } catch (decryptErr) {
                  console.warn(`[FullScreenFeed] Failed to decrypt thumbnail ${cfId} with token from collection:`, decryptErr);
                  clearLoadingState(cfId);
                }
              });
              
              // Don't await - let them decrypt in parallel and update as they complete
              Promise.all(decryptPromises).catch(err => {
                console.error(`[FullScreenFeed] Error in parallel thumbnail decryption:`, err);
              });
            }
          } else {
            console.warn(`[FullScreenFeed] No tokens found in collection data for ${missingThumbnailIds.length} thumbnails - will use metadata fetch fallback`);
          }
          
          // SECOND: Fetch metadata for thumbnails without tokens (fallback)
          const thumbnailsWithoutTokens = missingThumbnailIds.filter((cfId: string) => !thumbnailTokens[cfId]);
          if (thumbnailsWithoutTokens.length > 0) {
            console.log(`[FullScreenFeed] Loading ${thumbnailsWithoutTokens.length} thumbnails via metadata fetch (fallback)`);
            const { PNOAuthService } = await import('../services/pnOAuthService');
            const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
            const accessToken = await PNOAuthService.getValidAccessToken().catch(() => null);
            
            await Promise.all(thumbnailsWithoutTokens.map(async (cfId: string) => {
              try {
                // Fetch metadata
                const headers: HeadersInit = {};
                if (accessToken) {
                  headers['Authorization'] = `Bearer ${accessToken}`;
                }
                
                const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${cfId}`, { headers });
                if (!metadataResponse.ok) {
                  clearLoadingState(cfId);
                  return;
                }
                
                const metadataData = await metadataResponse.json();
                const collectionFileMetadata = metadataData.metadata || metadataData;
                
                // If thumbnail file with publicToken, decrypt directly
                const fileName = (collectionFileMetadata.name || collectionFileMetadata.title || '').toLowerCase();
                if (fileName.startsWith('thumb_') && collectionFileMetadata.publicToken) {
                  try {
                    const token: ShareToken = typeof collectionFileMetadata.publicToken === 'string' 
                      ? JSON.parse(collectionFileMetadata.publicToken) 
                      : collectionFileMetadata.publicToken;
                    
                    const decryptedBlob = await decryptWithToken(token);
                    const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                    
                    setThumbnails(prev => {
                      const newMap = new Map(prev);
                      newMap.set(cfId, thumbnailUrlObj);
                      return newMap;
                    });
                    
                    clearLoadingState(cfId);
                    return;
                  } catch (decryptErr) {
                    console.warn(`[FullScreenFeed] Failed to decrypt thumbnail ${cfId}:`, decryptErr);
                  }
                }
                
                clearLoadingState(cfId);
              } catch (err) {
                console.error(`[FullScreenFeed] Error loading thumbnail ${cfId} via metadata fetch:`, err);
                clearLoadingState(cfId);
              }
            }));
          }
        } catch (err) {
          console.error(`[FullScreenFeed] Error in thumbnail load batch:`, err);
        } finally {
        }
      })();
    }
  };

  // Check for collection data from metadata API and load thumbnails immediately
  // Priority: Load thumbnails for first few items first to reduce initial lag
  useEffect(() => {
    // Process first 3 files with higher priority (immediate render items)
    const priorityFiles = files.slice(0, 3);
    const remainingFiles = files.slice(3);
    
    // Process priority files first
    for (const indexedFile of priorityFiles) {
      const file = indexedFile.metadata;
      const fileId = file.fileId;
      const fileName = (file.name || file.title || '').toLowerCase();
      const isCollectionFile = fileName.endsWith('.collection') || file.fileType === 'collection';
      
      if (!isCollectionFile) {
        continue;
      }
      
      // Check if collection data is available from metadata API (not just from cache)
      const collectionDataFromMetadata = file.collection;
      if (collectionDataFromMetadata && collectionDataFromMetadata.collectionFileIds && Array.isArray(collectionDataFromMetadata.collectionFileIds)) {
        // Cache it if not already cached
        if (!collectionDataCache.has(fileId)) {
          collectionDataCache.set(fileId, collectionDataFromMetadata);
          const thumbnailTokens = (collectionDataFromMetadata as any).thumbnailTokens;
          console.log(`[FullScreenFeed] Cached collection data from metadata API for ${fileId} (PRIORITY)`, {
            collectionFileIdsCount: collectionDataFromMetadata.collectionFileIds.length,
            hasThumbnailTokens: !!thumbnailTokens,
            tokenCount: thumbnailTokens ? Object.keys(thumbnailTokens).length : 0
          });
        }
        
        // Load thumbnails immediately (priority)
        loadCollectionThumbnailsImmediate(fileId, collectionDataFromMetadata);
      }
    }
    
    // Process remaining files with slight delay to prioritize first items
    if (remainingFiles.length > 0) {
      setTimeout(() => {
        for (const indexedFile of remainingFiles) {
          const file = indexedFile.metadata;
          const fileId = file.fileId;
          const fileName = (file.name || file.title || '').toLowerCase();
          const isCollectionFile = fileName.endsWith('.collection') || file.fileType === 'collection';
          
          if (!isCollectionFile) {
            continue;
          }
          
          // Check if collection data is available from metadata API (not just from cache)
          const collectionDataFromMetadata = file.collection;
          if (collectionDataFromMetadata && collectionDataFromMetadata.collectionFileIds && Array.isArray(collectionDataFromMetadata.collectionFileIds)) {
            // Cache it if not already cached
            if (!collectionDataCache.has(fileId)) {
              collectionDataCache.set(fileId, collectionDataFromMetadata);
              const thumbnailTokens = (collectionDataFromMetadata as any).thumbnailTokens;
              console.log(`[FullScreenFeed] Cached collection data from metadata API for ${fileId}`, {
                collectionFileIdsCount: collectionDataFromMetadata.collectionFileIds.length,
                hasThumbnailTokens: !!thumbnailTokens,
                tokenCount: thumbnailTokens ? Object.keys(thumbnailTokens).length : 0
              });
            }
            
            // Load thumbnails immediately
            loadCollectionThumbnailsImmediate(fileId, collectionDataFromMetadata);
          }
        }
      }, 50); // Small delay to prioritize first items
    }
  }, [files]); // Removed thumbnails/externalThumbnails from deps to avoid unnecessary re-runs

  // Decrypt public collection files to get collectionFileIds
  useEffect(() => {
    const decryptCollectionFiles = async () => {
      // Process all files to find collection files that need decryption
      for (const indexedFile of files) {
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        
        // Skip if already cached
        if (collectionDataCache.has(fileId)) {
          continue;
        }
        
        // Check if it's a collection file (by name or fileType)
        const fileName = (file.name || file.title || '').toLowerCase();
        const isCollectionFile = fileName.endsWith('.collection') || file.fileType === 'collection';
        
        if (!isCollectionFile) {
          continue;
        }
        
        // Check if it has publicToken
        const publicToken = indexedFile.publicToken || file.publicToken;
        if (!publicToken) {
          console.log(`[FullScreenFeed] Collection file ${fileId} has no publicToken, skipping decryption`);
          continue;
        }
        
        console.log(`[FullScreenFeed] Decrypting public collection file ${fileId} (${fileName})`);
        
        try {
          // Parse publicToken
          let token: ShareToken;
          try {
            token = typeof publicToken === 'string' ? JSON.parse(publicToken) : publicToken;
          } catch (e) {
            console.warn(`[FullScreenFeed] Failed to parse token for collection ${fileId}:`, e);
            continue;
          }
          
          // Decrypt collection file
          const { decryptWithToken } = await import('../utils/tokenDecryption');
          const decryptedBlob = await decryptWithToken(token);
          
          // Parse decrypted JSON to get collection data
          const decryptedText = await decryptedBlob.text();
          const collectionFileData = JSON.parse(decryptedText);
          
          console.log(`[FullScreenFeed] Decrypted collection file ${fileId} structure:`, {
            hasCollection: !!collectionFileData.collection,
            collectionKeys: collectionFileData.collection ? Object.keys(collectionFileData.collection) : [],
            topLevelKeys: Object.keys(collectionFileData),
            fullStructure: collectionFileData
          });
          
          // Extract collection data (structure: { collection: { collectionFileIds: [...] }, version: '1.0', ... })
          const collectionData = collectionFileData.collection;
          
          if (collectionData && collectionData.collectionFileIds && Array.isArray(collectionData.collectionFileIds)) {
            console.log(`[FullScreenFeed] Successfully decrypted collection ${fileId}, found ${collectionData.collectionFileIds.length} file IDs`, {
              collectionFileIds: collectionData.collectionFileIds,
              hasThumbnailTokens: !!collectionData.thumbnailTokens,
              tokenCount: collectionData.thumbnailTokens ? Object.keys(collectionData.thumbnailTokens).length : 0
            });
            collectionDataCache.set(fileId, collectionData);
            
            // IMMEDIATELY load thumbnails for this collection (don't wait for render)
            const collectionFileIds = collectionData.collectionFileIds;
            const thumbnailTokens = collectionData.thumbnailTokens || {}; // Get tokens from collection data if available
            
            // DEBUG: Log token details
            console.log(`[FullScreenFeed] Collection ${fileId} token analysis:`, {
              collectionFileIdsCount: collectionFileIds.length,
              thumbnailTokensKeys: Object.keys(thumbnailTokens),
              thumbnailTokensCount: Object.keys(thumbnailTokens).length,
              firstCollectionFileId: collectionFileIds[0],
              firstTokenKey: Object.keys(thumbnailTokens)[0],
              tokensMatch: collectionFileIds.map((id: string) => ({
                id,
                hasToken: !!thumbnailTokens[id],
                tokenPreview: thumbnailTokens[id] ? thumbnailTokens[id].substring(0, 50) + '...' : 'NO TOKEN'
              }))
            });
            
            const missingThumbnailIds = collectionFileIds.filter(
              (cfId: string) => 
                !thumbnails.has(cfId) && 
                (!externalThumbnails || !externalThumbnails.has(cfId)) &&
                !loadingCollectionThumbnailsRef.current.has(cfId)
            );
            
            if (missingThumbnailIds.length > 0 && !triggeredImmediateLoadRef.current.has(fileId)) {
              console.log(`[FullScreenFeed] Triggering immediate thumbnail load for collection ${fileId} (${missingThumbnailIds.length} thumbnails, hasTokens: ${!!collectionData.thumbnailTokens})`);
              triggeredImmediateLoadRef.current.add(fileId);
              
              // Mark as loading
              missingThumbnailIds.forEach((cfId: string) => {
                loadingCollectionThumbnailsRef.current.add(cfId);
                loadingStartTimesRef.current.set(cfId, Date.now());
              });
              
              // Load thumbnails asynchronously
              (async () => {
                try {
                  const { decryptWithToken } = await import('../utils/tokenDecryption');
                  
                  // FIRST: Try to use tokens from collection data (fastest - no API call)
                  const thumbnailsWithTokens = missingThumbnailIds.filter((cfId: string) => {
                    const hasToken = !!thumbnailTokens[cfId];
                    if (!hasToken) {
                      console.log(`[FullScreenFeed] Thumbnail ${cfId} has no token in thumbnailTokens object`);
                    }
                    return hasToken;
                  });
                  console.log(`[FullScreenFeed] Token filter result: ${thumbnailsWithTokens.length} thumbnails have tokens out of ${missingThumbnailIds.length} missing`);
                  if (thumbnailsWithTokens.length > 0) {
                    console.log(`[FullScreenFeed] Loading ${thumbnailsWithTokens.length} thumbnails using tokens from collection data (tokens available for: ${thumbnailsWithTokens.length}/${missingThumbnailIds.length})`);
                    
                    // Decrypt thumbnails in parallel but update state as each completes (don't wait for all)
                    // This allows the first thumbnail to appear immediately
                    const decryptPromises = thumbnailsWithTokens.map(async (cfId: string) => {
                      const startTime = Date.now();
                      try {
                        const tokenString = thumbnailTokens[cfId];
                        const token: ShareToken = typeof tokenString === 'string' ? JSON.parse(tokenString) : tokenString;
                        const decryptedBlob = await decryptWithToken(token);
                        const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                        const decryptTime = Date.now() - startTime;
                        
                        setThumbnails(prev => {
                          const newMap = new Map(prev);
                          newMap.set(cfId, thumbnailUrlObj);
                          return newMap;
                        });
                        
                        console.log(`[FullScreenFeed] ✓ Decrypted thumbnail ${cfId} in ${decryptTime}ms`);
                        clearLoadingState(cfId);
                      } catch (decryptErr) {
                        console.warn(`[FullScreenFeed] Failed to decrypt thumbnail ${cfId} with token from collection:`, decryptErr);
                        clearLoadingState(cfId);
                      }
                    });
                    
                    // Don't await - let them decrypt in parallel and update as they complete
                    Promise.all(decryptPromises).catch(err => {
                      console.error(`[FullScreenFeed] Error in parallel thumbnail decryption:`, err);
                    });
                  } else {
                    console.warn(`[FullScreenFeed] No tokens found in collection data for ${missingThumbnailIds.length} thumbnails - will use metadata fetch fallback`);
                  }
                  
                  // SECOND: Fetch metadata for thumbnails without tokens (fallback)
                  const thumbnailsWithoutTokens = missingThumbnailIds.filter((cfId: string) => !thumbnailTokens[cfId]);
                  if (thumbnailsWithoutTokens.length > 0) {
                    console.log(`[FullScreenFeed] Loading ${thumbnailsWithoutTokens.length} thumbnails via metadata fetch (fallback)`);
                    const { PNOAuthService } = await import('../services/pnOAuthService');
                    const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
                    const accessToken = await PNOAuthService.getValidAccessToken().catch(() => null);
                    
                    await Promise.all(thumbnailsWithoutTokens.map(async (cfId: string) => {
                      try {
                        // Fetch metadata
                        const headers: HeadersInit = {};
                        if (accessToken) {
                          headers['Authorization'] = `Bearer ${accessToken}`;
                        }
                        
                        const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${cfId}`, { headers });
                        if (!metadataResponse.ok) {
                          clearLoadingState(cfId);
                          return;
                        }
                        
                        const metadataData = await metadataResponse.json();
                        const collectionFileMetadata = metadataData.metadata || metadataData;
                        
                        // If thumbnail file with publicToken, decrypt directly
                        const fileName = (collectionFileMetadata.name || collectionFileMetadata.title || '').toLowerCase();
                        if (fileName.startsWith('thumb_') && collectionFileMetadata.publicToken) {
                          try {
                            const token: ShareToken = typeof collectionFileMetadata.publicToken === 'string' 
                              ? JSON.parse(collectionFileMetadata.publicToken) 
                              : collectionFileMetadata.publicToken;
                            
                            const decryptedBlob = await decryptWithToken(token);
                            const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                            
                            setThumbnails(prev => {
                              const newMap = new Map(prev);
                              newMap.set(cfId, thumbnailUrlObj);
                              return newMap;
                            });
                            
                            clearLoadingState(cfId);
                            return;
                          } catch (decryptErr) {
                            console.warn(`[FullScreenFeed] Failed to decrypt thumbnail ${cfId}:`, decryptErr);
                          }
                        }
                        
                        clearLoadingState(cfId);
                      } catch (err) {
                        console.error(`[FullScreenFeed] Error loading thumbnail ${cfId}:`, err);
                        clearLoadingState(cfId);
                      }
                    }));
                  }
                } catch (err) {
                  console.error(`[FullScreenFeed] Error in thumbnail load batch:`, err);
                }
              })();
            }
            
            // Force re-render by updating state (use a dummy state update)
            setThumbnails(prev => new Map(prev));
          } else {
            console.warn(`[FullScreenFeed] Decrypted collection ${fileId} but no collectionFileIds found. Collection data:`, collectionData, 'Full file data:', collectionFileData);
          }
        } catch (err) {
          console.error(`[FullScreenFeed] Failed to decrypt collection file ${fileId}:`, err);
        }
      }
    };
    
    decryptCollectionFiles();
  }, [files, collectionDataCache]);

  // Load thumbnails for collection files when a collection is visible
  useEffect(() => {
    const loadCollectionThumbnails = async () => {
      // Use visibleFileId if available, otherwise use currentIndex
      const targetFileId = visibleFileId || (files[currentIndex]?.metadata?.fileId);
      
      if (!targetFileId) {
        return;
      }
      
      const indexedFile = files.find(f => f.metadata.fileId === targetFileId);
      if (!indexedFile) {
        return;
      }
      
      const file = indexedFile.metadata;
      const collectionData = file.collection || collectionDataCache.get(targetFileId);
      
      // Check if this is a collection
      if (!collectionData?.collectionFileIds || !Array.isArray(collectionData.collectionFileIds)) {
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
        return; // All thumbnails already loaded or loading
      }
      
      // Check if user is authenticated before attempting to load
      if (!userState.isUnlocked) {
        return; // Will retry when userState.isUnlocked becomes true
      }
      
      // Mark as loading
      missingThumbnailIds.forEach((fileId: string) => {
        loadingCollectionThumbnailsRef.current.add(fileId);
        loadingStartTimesRef.current.set(fileId, Date.now());
      });
      
      // Load thumbnails for missing collection files
      await Promise.all(missingThumbnailIds.map(async (fileId: string) => {
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
          const isThoughtCollectionThumbnail = collectionFileMetadata.fileType === 'thought-collection-thumbnail';
          
          
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
          
          // PRIORITY 3: Try API endpoint
          // For thought-collection-thumbnails, they ARE the image files, so use download=true
          // For regular images, thumbnail=true might generate a thumbnail, but for collection thumbnails we want the full file
          const useDownload = isThoughtCollectionThumbnail;
          let thumbnailUrl = `${apiEndpoint}/api/drive/files/${fileId}?${useDownload ? 'download' : 'thumbnail'}=true`;
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
        minHeight: viewportHeightCSS,
        // Start at top of window
        marginTop: '0',
        paddingTop: '0',
        paddingBottom: '0',
        marginBottom: '0',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        position: 'relative'
      }}
    >
      {/* Only render visible files (currentIndex ± 1) for better performance */}
      {(() => {
        // Show currentIndex and next 2 files (or previous if at start)
        // This ensures we always show at least 3 files when available
        // Expand to show more files so we can see all thumbnails that are loaded
        const startIdx = Math.max(0, currentIndex - 1);
        const endIdx = Math.min(files.length, currentIndex + 5); // Show current + next 4 to see all files
        return files.slice(startIdx, endIdx);
      })()
        .map((indexedFile) => {
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        
        
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
        
        // Trigger thumbnail loading for collection files immediately when collection is detected
        // (don't wait for visibleFileId to be set)
        
        if (isCollectionFile && collectionData?.collectionFileIds) {
          const collectionFileIds = collectionData.collectionFileIds;
          
          // Check if we've already triggered loading for this collection
          const alreadyTriggered = triggeredImmediateLoadRef.current.has(fileId);
          
          const missingThumbnailIds = collectionFileIds.filter(
            (cfId: string) => 
              !thumbnails.has(cfId) && 
              (!externalThumbnails || !externalThumbnails.has(cfId)) &&
              !loadingCollectionThumbnailsRef.current.has(cfId)
          );
          
          if (missingThumbnailIds.length > 0 && !alreadyTriggered) {
            triggeredImmediateLoadRef.current.add(fileId);
            // Mark as loading
            missingThumbnailIds.forEach((cfId: string) => {
              loadingCollectionThumbnailsRef.current.add(cfId);
              loadingStartTimesRef.current.set(cfId, Date.now());
            });
            
            // Load thumbnails asynchronously (fire and forget)
            // For public collections, we should be able to load thumbnails using publicToken without authentication
            (async () => {
              try {
                const { PNOAuthService } = await import('../services/pnOAuthService');
                const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
                
                // Try to get access token (optional - may not be available for public files)
                const accessToken = await PNOAuthService.getValidAccessToken().catch(() => null);
                
                await Promise.all(missingThumbnailIds.map(async (cfId: string) => {
                  
                  let success = false;
                  let collectionFileMetadata: any = null;
                  let accountId: string | null = null;
                  
                  try {
                    // Fetch metadata for this collection file (try with auth if available, but should work without for public files)
                    const headers: HeadersInit = {};
                    if (accessToken) {
                      headers['Authorization'] = `Bearer ${accessToken}`;
                    }
                    
                    const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${cfId}`, {
                      headers
                    });
                    
                    
                    if (!metadataResponse.ok) {
                      const errorText = await metadataResponse.text().catch(() => 'Could not read error response');
                      const errorData = errorText ? (() => {
                        try { return JSON.parse(errorText); } catch { return errorText; }
                      })() : null;
                      
                      if (metadataResponse.status === 404) {
                        console.warn(`[FullScreenFeed] IMMEDIATE LOAD: Collection thumbnail file ${cfId} not found in public aggregator index (404). These PDF thumbnail files need to be submitted to the public index with their publicTokens when the collection is made public.`);
                      } else {
                        console.error(`[FullScreenFeed] IMMEDIATE LOAD: Failed to fetch metadata for collection file ${cfId}:`, {
                          status: metadataResponse.status,
                          statusText: metadataResponse.statusText,
                          errorBody: errorData
                        });
                      }
                      clearLoadingState(cfId);
                      return;
                    }
                    
                    const metadataData = await metadataResponse.json();
                    collectionFileMetadata = metadataData.metadata || metadataData;
                    
                    
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
                    
                    // PRIORITY 1: If this IS a thumbnail file, decrypt using publicToken (WORKS FOR PUBLIC FILES WITHOUT AUTH)
                    if (isThumbnailFile && collectionFileMetadata.publicToken) {
                      try {
                        const { decryptWithToken } = await import('../utils/tokenDecryption');
                        let token: ShareToken;
                        try {
                          token = typeof collectionFileMetadata.publicToken === 'string' 
                            ? JSON.parse(collectionFileMetadata.publicToken) 
                            : collectionFileMetadata.publicToken;
                        } catch (e) {
                          console.warn(`[FullScreenFeed] IMMEDIATE LOAD: Failed to parse token for ${cfId}:`, e);
                          clearLoadingState(cfId);
                          return;
                        }
                        
                        const decryptedBlob = await decryptWithToken(token);
                        const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                        
                        setThumbnails(prev => {
                          const newMap = new Map(prev);
                          newMap.set(cfId, thumbnailUrlObj);
                          return newMap;
                        });
                        
                        clearLoadingState(cfId);
                        return;
                      } catch (decryptErr) {
                        console.warn(`[FullScreenFeed] IMMEDIATE LOAD: Failed to decrypt thumbnail with publicToken for ${cfId}:`, decryptErr);
                      }
                    }
                    
                    // If we reach here and still don't have an access token, we can't load non-public thumbnails
                    if (!accessToken) {
                      console.warn(`[FullScreenFeed] IMMEDIATE LOAD: No access token and no publicToken for ${cfId}, cannot load thumbnail`);
                      clearLoadingState(cfId);
                      return;
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
                  if (!success && collectionFileMetadata && accountId) {
                    try {
                      const fileType = collectionFileMetadata.fileType || '';
                      const isImageOrVideo = fileType === 'image' || fileType === 'video';
                      
                      if (isImageOrVideo) {
                        console.log(`[FullScreenFeed] IMMEDIATE LOAD: Trying final fallback - load file directly for ${cfId}`);
                        let fileUrl = `${apiEndpoint}/api/drive/files/${cfId}?thumbnail=true`;
                        if (accountId.includes('::')) {
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
        
        // Final detection (collections take precedence)
        const isVideoFinal = isCollectionFile ? false : isVideo;
        const isImageFinal = isCollectionFile ? false : isImage;
        
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

        // Check if this is a connection placeholder
        const isConnectionPlaceholder = (file as any).isConnectionPlaceholder || (indexedFile.metadata as any).isConnectionPlaceholder;
        
        // Check if this is a me page cover placeholder
        const isMePageCover = (indexedFile.metadata as any).isMePageCover === true;

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
              flexShrink: 0,
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
            {!isConnectionPlaceholder && isVideoFinal && videoBlobs.get(fileId) && (() => {
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
            
            {/* Me Page Cover - Show when user has no media posts */}
            {isMePageCover && (() => {
              const coverThumbnailUrl = thumbnails.get(fileId);
              
              if (!coverThumbnailUrl) {
                // Show placeholder while cover loads
                return (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex flex-col items-center justify-center text-neutral-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2"></div>
                      <span className="text-xs">Loading cover...</span>
                    </div>
                  </div>
                );
              }
              
              const containerDims = getContainerDimensions(64);
              const dims = mediaDimensions.get(fileId);
              const scalingStyles = calculateMediaScaling(dims, containerDims);
              
              return (
                <>
                  {/* Blurred background image */}
                  <img
                    src={coverThumbnailUrl}
                    alt="Par-Noir Cover"
                    className="absolute"
                    style={scalingStyles.background}
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      console.error(`[FullScreenFeed] Cover background image failed to load for ${fileId}:`, e);
                    }}
                  />
                  {/* Main cover image container - centers image */}
                  <div className="w-full h-full flex items-center justify-center relative z-10">
                    <img
                      ref={(el) => {
                        if (el) {
                          imageRefs.current.set(fileId, el);
                          // Track dimensions when loaded
                          el.addEventListener('load', () => {
                            const naturalWidth = el.naturalWidth;
                            const naturalHeight = el.naturalHeight;
                            setMediaDimensions(prev => {
                              const newMap = new Map(prev);
                              newMap.set(fileId, { width: naturalWidth, height: naturalHeight });
                              return newMap;
                            });
                          });
                        }
                      }}
                      src={coverThumbnailUrl}
                      alt="Par-Noir Cover"
                      style={scalingStyles.mainMedia}
                      loading="eager"
                      decoding="sync"
                      onError={(e) => {
                        console.error(`[FullScreenFeed] Cover image failed to load for ${fileId}:`, e);
                      }}
                    />
                  </div>
                </>
              );
            })()}

            {/* Full-screen image (single image) - Only render if NOT a text post */}
            {/* Show image if detected as image (show placeholder if thumbnail not loaded yet) */}
            {!isConnectionPlaceholder && !isMePageCover && isImageFinal && (() => {
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
              
              const containerDims = getContainerDimensions(64);
              const dims = mediaDimensions.get(fileId);
              const scalingStyles = calculateMediaScaling(dims, containerDims);
              
              return (
                <>
                  {/* Blurred background image */}
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="absolute"
                    style={scalingStyles.background}
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
                          const naturalWidth = el.naturalWidth;
                          const naturalHeight = el.naturalHeight;
                          setMediaDimensions(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, { width: naturalWidth, height: naturalHeight });
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
                    style={scalingStyles.mainMedia}
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

            {/* Connection Placeholder - Show when connection has no posts */}
            {isConnectionPlaceholder ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-white p-8">
                <div className="text-6xl mb-6">👤</div>
                <h2 className="text-2xl font-semibold mb-2">Connected</h2>
                <p className="text-neutral-400 text-center mb-6">
                  {creatorId ? `${creatorId.substring(0, 8)}...` : 'This connection'} hasn't posted anything yet
                </p>
                {onCreatorClick && creatorId && (
                  <button
                    onClick={() => onCreatorClick(creatorId)}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
                  >
                    View Profile
                  </button>
                )}
              </div>
            ) : null}

            {/* Collection - Simple thumbnail slideshow */}
            {!isConnectionPlaceholder && isCollectionFile && (collectionData || collectionDataCache.get(fileId))?.collectionFileIds ? (
              (() => {
                // Use cached collection data if available
                const finalCollectionData = collectionData || collectionDataCache.get(fileId);
                
                // Get thumbnails from Map for collection file IDs
                const collectionThumbnails = finalCollectionData.collectionFileIds
                  .map((fileId: string): string | undefined => thumbnails.get(fileId))
                  .filter((url: string | undefined): url is string => url !== undefined);
                
                if (collectionThumbnails.length > 0) {
                  const containerDims = getContainerDimensions(64);
                  
                  // Render horizontal slideshow of thumbnails with individual scaling
                  return (
                    <div 
                      className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                      style={{
                        height: '100%',
                        maxHeight: '100%',
                        minHeight: '100%',
                        overflowY: 'hidden', // Prevent vertical scrolling
                        overflowX: 'auto', // Allow horizontal scrolling
                        boxSizing: 'border-box',
                        position: 'relative'
                      }}
                    >
                      {collectionThumbnails.map((thumbnailUrl: string, idx: number) => {
                        // Use composite key for dimension tracking: collection file ID + index
                        // Or use the individual file ID from the collection if available
                        const collectionFileId = finalCollectionData.collectionFileIds[idx];
                        const dimensionKey = collectionFileId || `${fileId}-${idx}`;
                        const dims = mediaDimensions.get(dimensionKey);
                        const scalingStyles = calculateMediaScaling(dims, containerDims);
                        
                        return (
                          <div
                            key={`${fileId}-${idx}`}
                            className="flex-shrink-0 w-full h-full snap-start relative"
                            style={{
                              height: '100%',
                              maxHeight: '100%',
                              minHeight: '100%',
                              overflow: 'hidden', // Prevent any content overflow
                              boxSizing: 'border-box',
                              width: '100%'
                            }}
                          >
                            {/* Blurred background image */}
                            <img
                              src={thumbnailUrl}
                              alt=""
                              className="absolute"
                              style={scalingStyles.background}
                              loading="eager"
                              decoding="async"
                              onError={() => {
                                console.error(`[FullScreenFeed] Background image failed to load for collection ${fileId}, index ${idx}:`, thumbnailUrl);
                              }}
                            />
                            {/* Main image container */}
                            <div className="w-full h-full flex items-center justify-center relative z-10">
                              <img
                                src={thumbnailUrl}
                                alt={`${fileName} - ${idx + 1}`}
                                style={scalingStyles.mainMedia}
                                onError={(e) => {
                                  console.error(`[FullScreenFeed] Thumbnail failed to load for collection ${fileId}, index ${idx}:`, thumbnailUrl);
                                  e.currentTarget.src = '/placeholder-thumbnail.png';
                                }}
                                onLoad={(e) => {
                                  const img = e.currentTarget;
                                  // Track dimensions for this specific image in the collection
                                  setMediaDimensions(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(dimensionKey, { width: img.naturalWidth, height: img.naturalHeight });
                                    return newMap;
                                  });
                                  console.log(`[FullScreenFeed] Thumbnail loaded successfully for collection ${fileId}, index ${idx}, dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
                                }}
                                loading="eager"
                                decoding="sync"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                } else {
                  // No thumbnails loaded yet - render empty/minimal placeholder
                  // Thumbnails should be loading in background, will render when ready
                  return null;
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
            {!isConnectionPlaceholder && !isImageFinal && !isVideoFinal && !isCollectionFile && (
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
                    saves: indexedFile.metadata.engagement?.saves || 0,
                    lastUpdated: indexedFile.metadata.engagement?.lastUpdated || new Date().toISOString()
                  }
                }
              }}
              isLiked={isLiked(fileId)}
              onLike={isMePageCover ? () => {} : () => {
                if (visibleFileId === fileId && showEngagementOverlay) {
                  setShowEngagementOverlay(false);
                }
                onLike(fileId);
              }}
              onComment={isMePageCover ? () => {} : () => {
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
              onShare={isMePageCover ? async () => {} : async () => {
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

