/**
 * Full Screen Feed Component
 * TikTok-style full-screen vertical feed with swipe navigation
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(externalVideoBlobs || new Map());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(externalThumbnails || new Map());
  const [loadedThoughtContent, setLoadedThoughtContent] = useState<Map<string, any>>(new Map()); // fileId -> textPostData
  const accountIdCacheRef = useRef<string | null>(null); // Cache accountId to avoid repeated API calls
  const thoughtDetectionLogged = useRef<Set<string>>(new Set()); // Track which thoughts we've logged to reduce console spam
  const loadingThoughtsRef = useRef<Set<string>>(new Set()); // Track which thoughts are currently loading
  
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

  // Load thought content from Google Drive when metadata only has filename
  // FIX: Load thoughts for ALL files in feed, not just visible ones
  // This ensures thoughts render immediately when feed loads, not just when scrolled into view
  useEffect(() => {
    const loadThoughtContent = async () => {
      // Load current file and adjacent files (for smooth scrolling)
      const indicesToLoad = [
        currentIndex - 1,
        currentIndex,
        currentIndex + 1
      ].filter(idx => idx >= 0 && idx < files.length);
      
      // ALSO load thoughts for all files in the feed (not just visible ones)
      // This ensures thoughts render on initial page load
      const allThoughtIndices = files.map((_, idx) => idx).filter(idx => {
        const indexedFile = files[idx];
        const file = indexedFile.metadata;
        const thoughtFileName = file.name || file.title || '';
        const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(thoughtFileName);
        const isTextPost = file.fileType === 'text' || file.fileType === 'thought';
        return isThoughtFile || isTextPost;
      });
      
      // Combine visible indices with all thought indices, remove duplicates
      const allIndicesToLoad = Array.from(new Set([...indicesToLoad, ...allThoughtIndices]));

      await Promise.all(allIndicesToLoad.map(async (idx) => {
        const indexedFile = files[idx];
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        
        // Check if this is a thought that needs content loaded
        const textPostData = loadedThoughtContent.get(fileId) ||
                            (indexedFile.metadata as any)?.textPost || 
                            (indexedFile.metadata as any)?.thought ||
                            (file as any)?.textPost ||
                            (file as any)?.thought;
        
        const thoughtFileName = file.name || file.title || '';
        const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(thoughtFileName);
        const isTextPost = file.fileType === 'text' || file.fileType === 'thought';
        
        // If it's a thought but content is missing or just a filename, load it
        const currentContent = textPostData?.content || file.description || file.name || file.title || '';
        const isJustFilename = /^thought-\d+\.(thought|png)/i.test(currentContent);
        
        // ALWAYS log when we detect a thought that needs loading (even if already loading/loaded)
        if ((isThoughtFile || isTextPost) && (isJustFilename || !textPostData?.content)) {
          console.log(`[FullScreenFeed] 🔍 Thought detected but content missing:`, {
            fileId,
            isThoughtFile,
            isTextPost,
            hasTextPostData: !!textPostData,
            textPostDataContent: textPostData?.content,
            currentContent: currentContent.substring(0, 50),
            isJustFilename,
            alreadyLoaded: loadedThoughtContent.has(fileId),
            alreadyLoading: loadingThoughtsRef.current.has(fileId),
            fileType: file.fileType,
            fileName: file.name || file.title,
            metadataKeys: Object.keys(indexedFile.metadata || {}),
            metadataTextPost: (indexedFile.metadata as any)?.textPost ? 'EXISTS' : 'MISSING',
            metadataThought: (indexedFile.metadata as any)?.thought ? 'EXISTS' : 'MISSING',
            fullMetadata: indexedFile.metadata
          });
        }
        
        // FIX: Only try to load from Google Drive if authenticated AND content is actually missing
        // For public thoughts, content should already be in metadata - don't try to load
        const shouldLoadThought = (isThoughtFile || isTextPost) && 
                                  (isJustFilename || !textPostData?.content) && 
                                  !loadedThoughtContent.has(fileId) && 
                                  !loadingThoughtsRef.current.has(fileId);
        
        if (shouldLoadThought) {
          loadingThoughtsRef.current.add(fileId);
          console.log(`[FullScreenFeed] Loading thought content for ${fileId}...`);
          
          try {
            const { PNOAuthService } = await import('../services/pnOAuthService');
            const accessToken = await PNOAuthService.getValidAccessToken();
            if (!accessToken) {
              // FIX: Don't warn for public thoughts - this is expected
              // Only warn if we actually expected to load it
              if (isJustFilename) {
                console.warn(`[FullScreenFeed] No access token to load thought ${fileId} - thought content should be in metadata for public thoughts`);
              }
              return;
            }
            
            const session = PNOAuthService.loadSession();
            if (!session?.did) {
              console.warn(`[FullScreenFeed] No session to load thought ${fileId}`);
              return;
            }
            
            const pnId = session.did;
            let publicKey = session?.publicKey;
            if (!publicKey && session.did.startsWith('did:key:')) {
              publicKey = session.did.substring(8);
            }
            if (!publicKey) {
              console.warn(`[FullScreenFeed] No publicKey to load thought ${fileId}`);
              return;
            }
            
            // Get accountId
            const accountId = await getAccountId(indexedFile, accessToken);
            const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
            
            // Download the thought file
            const thoughtFileUrl = `${apiEndpoint}/api/drive/files/${fileId}?accountId=${accountId}&download=true`;
            const thoughtResponse = await fetch(thoughtFileUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (!thoughtResponse.ok) {
              console.warn(`[FullScreenFeed] Failed to download thought file ${fileId}:`, thoughtResponse.status);
              return;
            }
            
            const { EncryptionManager } = await import('../utils/encryptionManager');
            const encryptedText = await thoughtResponse.text();
            const encryptedPackage = JSON.parse(encryptedText);
            const encryptionManager = new EncryptionManager();
            const decryptedData = await encryptionManager.decrypt(
              encryptedPackage.encrypted,
              encryptedPackage.iv,
              encryptedPackage.salt,
              pnId,
              publicKey
            );
            
            // Parse the thought data
            const decryptedText = new TextDecoder().decode(decryptedData);
            const thoughtData = JSON.parse(decryptedText);
            const loadedTextPost = thoughtData.textPost;
            
            if (loadedTextPost) {
              console.log(`[FullScreenFeed] ✅ Loaded thought content for ${fileId}`);
              setLoadedThoughtContent(prev => {
                const next = new Map(prev);
                next.set(fileId, loadedTextPost);
                return next;
              });
            } else {
              console.warn(`[FullScreenFeed] Thought file ${fileId} missing textPost data:`, thoughtData);
            }
          } catch (error) {
            console.error(`[FullScreenFeed] Error loading thought ${fileId}:`, error);
          } finally {
            loadingThoughtsRef.current.delete(fileId);
          }
        }
      }));
    };
    
    loadThoughtContent();
  }, [currentIndex, files, loadedThoughtContent]);

  // Load video blobs and thumbnails for visible files (only if not provided externally)
  useEffect(() => {
    const loadMedia = async () => {
      // Load current file and adjacent files
      const indicesToLoad = [
        currentIndex - 1,
        currentIndex,
        currentIndex + 1
      ].filter(idx => idx >= 0 && idx < files.length);

      // Parallelize loading for better performance
      await Promise.all(indicesToLoad.map(async (idx) => {
        const indexedFile = files[idx];
        const file = indexedFile.metadata;
        const fileId = file.fileId;

        // Check if it's a text post/thought first (same logic as render section)
        // Check multiple locations for thought data (same as render logic)
        const textPostData = (indexedFile.metadata as any)?.textPost ||
                            (indexedFile.metadata as any)?.thought ||
                            (file as any)?.textPost ||
                            (file as any)?.thought ||
                            (indexedFile as any)?.textPost ||
                            (indexedFile as any)?.thought;
        
        // Check fileType in ALL possible locations (file.fileType, indexedFile.metadata.fileType, etc.)
        const fileTypeFromFile = file.fileType;
        const fileTypeFromMetadata = indexedFile.metadata?.fileType;
        const fileTypeFromIndexedFile = (indexedFile as any)?.fileType;
        const actualFileType = fileTypeFromFile || fileTypeFromMetadata || fileTypeFromIndexedFile;
        
        const hasTextFileType = actualFileType === 'text' || actualFileType === 'thought';
        
        // Check for thought filename pattern - check filename in multiple locations
        const thoughtFileName = file.name || 
                               file.title || 
                               (file as any).originalName ||
                               indexedFile.metadata?.originalName ||
                               indexedFile.metadata?.name ||
                               '';
        const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(thoughtFileName);
        
        // Check if file has media extension (image/video) - if so, prioritize media detection over thought
        const fileNameForMediaCheck = file.name || file.title || '';
        const hasImageExt = !!(fileNameForMediaCheck.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i));
        const hasVideoExt = !!(fileNameForMediaCheck.match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i));
        const hasMediaExt = hasImageExt || hasVideoExt;
        
        // If we have textPost/thought data OR fileType is 'text'/'thought', it's DEFINITELY a thought
        // BUT: If file has media extension and is NOT a thought file pattern, prioritize media over thought
        // This prevents images/videos from being incorrectly detected as thoughts
        const isTextPost = (!!textPostData || hasTextFileType || isThoughtFile) && (!hasMediaExt || isThoughtFile);
        
        const isVideo = !isTextPost && (
          file.fileType === 'video' || 
          !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i)
        );
        const fileNameForImageCheck = file.name || file.title || '';
        const hasImageExtension = !!(fileNameForImageCheck.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i));
        // Check mimeType in multiple locations and also check encodingFormat
        const mimeType = (file as any).mimeType || indexedFile.metadata?.mimeType || file.encodingFormat || indexedFile.metadata?.encodingFormat || '';
        const hasImageMimeType = mimeType.startsWith('image/');
        // Check @type field (JSON-LD semantic web field) for ImageObject
        const atType = file['@type'] || indexedFile.metadata?.['@type'];
        const isImageObject = Array.isArray(atType) 
          ? atType.some(t => String(t).toLowerCase().includes('image'))
          : String(atType || '').toLowerCase().includes('image');
        const isImage = !isTextPost && (
          file.fileType === 'image' || 
          isImageObject ||
          (file.fileType === 'other' && hasImageExtension) ||
          hasImageExtension ||
          hasImageMimeType
        );
        
        // Debug logging only in development mode
        if (process.env.NODE_ENV === 'development' && hasImageExtension && !isImage) {
          console.warn(`[FullScreenFeed] Image extension detected but not loading: ${fileId}`);
        }
        
        

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
              
              // PRIORITY 1: If this IS a thumbnail file, decrypt using publicToken from metadata
              if (isThumbnailFile) {
                // Use publicToken from metadata to decrypt (required for public feed)
                const publicToken = indexedFile.publicToken || file.publicToken;
                if (publicToken) {
                  try {
                    let token: ShareToken;
                    try {
                      token = typeof publicToken === 'string' ? JSON.parse(publicToken) : publicToken;
                    } catch (e) {
                      console.warn(`[FullScreenFeed] Failed to parse publicToken for thumbnail ${fileId}:`, e);
                      return;
                    }
                    
                    // Decrypt using publicToken (NO API CALLS!)
                    const decryptedBlob = await decryptWithToken(token);
                    const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
                    
                    setThumbnails(prev => {
                      const newMap = new Map(prev);
                      newMap.set(fileId, thumbnailUrlObj);
                      return newMap;
                    });
                    
                    return; // Success - thumbnail loaded!
                  } catch (decryptErr) {
                    console.error(`[FullScreenFeed] Failed to decrypt thumbnail with publicToken:`, decryptErr);
                    return;
                  }
                } else {
                  console.warn(`[FullScreenFeed] Thumbnail file ${fileId} has no publicToken - cannot decrypt`);
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
        
        // Check for text post FIRST before checking image/video
        // This prevents thoughts from being misclassified as images/videos
        // Check multiple possible locations for thought data
        // Also check loaded thought content (for thoughts loaded from Google Drive)
        let textPostData: any = loadedThoughtContent.get(fileId) ||
                            (indexedFile.metadata as any)?.textPost || 
                            (indexedFile.metadata as any)?.thought ||
                            (file as any)?.textPost ||
                            (file as any)?.thought ||
                            (indexedFile as any)?.textPost ||
                            (indexedFile as any)?.thought;
        
        // Also check nested metadata structure
        if (!textPostData && indexedFile.metadata) {
          const metadata = indexedFile.metadata as any;
          textPostData = metadata.data?.textPost || 
                        metadata.data?.thought ||
                        metadata.content?.textPost ||
                        metadata.content?.thought;
        }
        
        // FALLBACK: If fileType is 'text' or 'thought' but textPost/thought data is missing,
        // OR if filename suggests it's a thought (thought-*.thought or thought-*.png), try to reconstruct it from other metadata fields
        // This handles cases where the metadata was created before textPost/thought fields were added
        const isLikelyThought = !textPostData && (
          file.fileType === 'text' || 
          file.fileType === 'thought' || 
          indexedFile.metadata?.fileType === 'text' || 
          indexedFile.metadata?.fileType === 'thought' ||
          (file.name && /thought-\d+\.png/i.test(file.name)) ||
          (file.title && /thought-\d+\.png/i.test(file.title))
        );
        
        if (isLikelyThought) {
          const content = file.description || file.name || file.title || '';
          if (content && content.trim().length > 0) {
            // Skip if content looks like a filename (contains .png, .jpg, etc.)
            if (!/\.(png|jpg|jpeg|gif|webp|svg|mp4|mov|avi|webm)$/i.test(content)) {
              textPostData = {
                content: content,
                style: {
                  backgroundColor: '#000000',
                  textColor: '#FFFFFF',
                  fontSize: 48,
                  fontFamily: 'Arial',
                  textAlign: 'center',
                  padding: 40,
                  dropShadowColor: '#000000',
                  dropShadowBlur: 10,
                  dropShadowOffsetX: 2,
                  dropShadowOffsetY: 2
                }
              };
              console.warn('[FullScreenFeed] Reconstructed textPostData from metadata (fallback):', {
                fileId,
                fileType: file.fileType,
                metadataFileType: indexedFile.metadata?.fileType,
                fileName: file.name,
                content: content.substring(0, 50)
              });
            }
          }
        }
        
        // Parse textPost if it's a string (could be JSON string or plain string)
        if (textPostData && typeof textPostData === 'string') {
          try {
            // Try to parse as JSON first
            const parsed = JSON.parse(textPostData);
            if (parsed && typeof parsed === 'object') {
              textPostData = parsed;
            } else {
              // If parsing returns a primitive, treat original string as content
              textPostData = { content: textPostData };
            }
          } catch (e) {
            // Not JSON, treat as plain text content
            textPostData = { content: textPostData };
          }
        }
        
        // If textPostData is an object but doesn't have content, try to extract from it
        if (textPostData && typeof textPostData === 'object' && !textPostData.content) {
          // Check if it has HTML content or other fields
          if (textPostData.html) {
            textPostData.content = textPostData.html;
          } else if (textPostData.text) {
            textPostData.content = textPostData.text;
          } else if (textPostData.value) {
            textPostData.content = textPostData.value;
          }
        }
        
        const hasTextPostData = !!textPostData;
        
        // Check fileType in ALL possible locations (file.fileType, indexedFile.metadata.fileType, etc.)
        const fileTypeFromFile = file.fileType;
        const fileTypeFromMetadata = indexedFile.metadata?.fileType;
        const fileTypeFromIndexedFile = (indexedFile as any)?.fileType;
        const actualFileType = fileTypeFromFile || fileTypeFromMetadata || fileTypeFromIndexedFile;
        
        const hasTextFileType = actualFileType === 'text' || actualFileType === 'thought';
        
        // Check for thought filename pattern BEFORE determining isTextPost
        // This ensures thoughts are detected consistently and prevents flickering
        // Check filename in multiple locations (file.name might be content, not filename)
        const thoughtFileName = file.name || 
                               file.title || 
                               (file as any).originalName ||
                               indexedFile.metadata?.originalName ||
                               indexedFile.metadata?.name ||
                               '';
        const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(thoughtFileName);
        
        // Debug logging for thoughts (only in development, only log once per file)
        if (process.env.NODE_ENV === 'development' && (isThoughtFile || hasTextPostData || hasTextFileType) && !thoughtDetectionLogged.current.has(fileId)) {
          thoughtDetectionLogged.current.add(fileId);
          console.log(`[FullScreenFeed] Thought detected: ${fileId}`);
        }
        
        // Check if file has media extension (image/video) - if so, prioritize media detection over thought
        const fileNameForMediaCheck = file.name || file.title || '';
        const hasImageExt = !!(fileNameForMediaCheck.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i));
        const hasVideoExt = !!(fileNameForMediaCheck.match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i));
        const hasMediaExt = hasImageExt || hasVideoExt;
        
        // If we have textPost/thought data OR fileType is 'text'/'thought', it's DEFINITELY a thought
        // BUT: If file has media extension and is NOT a thought file pattern, prioritize media over thought
        // This prevents images/videos from being incorrectly detected as thoughts
        const isTextPost = (hasTextPostData || hasTextFileType || isThoughtFile) && (!hasMediaExt || isThoughtFile) ||
                          (!hasMediaExt && file.description && file.description.trim().length > 0 && 
                           !actualFileType && !thoughtFileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mov|avi|webm|mkv|flv|wmv)$/i));
        
        // CRITICAL FIX: If isTextPost is true but textPostData is missing, create it from available data
        // This ensures thoughts render even when textPostData isn't populated
        if (isTextPost && !textPostData) {
          // Use description, name, or title as content
          const content = file.description || file.name || file.title || '';
          if (content && content.trim().length > 0) {
            // Skip if content looks like a filename
            if (!/\.(png|jpg|jpeg|gif|webp|svg|mp4|mov|avi|webm)$/i.test(content)) {
              textPostData = {
                content: content,
                style: {
                  backgroundColor: '#000000',
                  textColor: '#FFFFFF',
                  fontSize: 48,
                  fontFamily: 'Arial',
                  textAlign: 'center',
                  padding: 40,
                  dropShadowColor: '#000000',
                  dropShadowBlur: 10,
                  dropShadowOffsetX: 2,
                  dropShadowOffsetY: 2
                }
              };
              if (process.env.NODE_ENV === 'development') {
                console.log(`[FullScreenFeed] Created textPostData for thought: ${fileId}`);
              }
            }
          }
        }
        
        // If it's a thought but fileType is wrong, log it for debugging
        if (hasTextPostData && !hasTextFileType) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[FullScreenFeed] Thought detected but fileType incorrect: ${fileId}`);
          }
        }
        
        // Only check for image/video if it's NOT a text post
        // This prevents thoughts with image-like filenames from being misclassified
        const isVideo = !isTextPost && (
          file.fileType === 'video' || 
          !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i)
        );
        
        // IMPORTANT: If it's a thought, it should NEVER be detected as an image, even if filename matches image pattern
        // This prevents flickering where thoughts are detected as both thoughts and images
        // isThoughtFile is already defined above (line 1356)
        // Use !! to convert match result (array or null) to boolean
        // CRITICAL FIX: Check for image fileType OR image extension OR mimeType, but only exclude if it's DEFINITELY a thought
        const fileNameForImageCheck = file.name || file.title || '';
        const hasImageExtension = !!(fileNameForImageCheck.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif)$/i));
        // Check mimeType in multiple locations and also check encodingFormat (which is the standard field in PublicMetadata)
        const mimeType = (file as any).mimeType || indexedFile.metadata?.mimeType || file.encodingFormat || indexedFile.metadata?.encodingFormat || '';
        const hasImageMimeType = mimeType.startsWith('image/');
        // Check @type field (JSON-LD semantic web field) for ImageObject
        const atType = file['@type'] || indexedFile.metadata?.['@type'];
        const isImageObject = Array.isArray(atType) 
          ? atType.some(t => String(t).toLowerCase().includes('image'))
          : String(atType || '').toLowerCase().includes('image');
        const isImage = !isTextPost && (
          file.fileType === 'image' || 
          isImageObject ||
          hasImageMimeType ||
          (file.fileType === 'other' && hasImageExtension) ||
          hasImageExtension
        );
        
        // Check for collection - ONLY check metadata, be very strict to avoid false positives
        // Don't check file.collection or (file as any).collection as those might be empty objects
        const collectionData = indexedFile.metadata?.collection;
        const isCollectionFile = actualFileType === 'collection' && 
                                collectionData && 
                                typeof collectionData === 'object' &&
                                collectionData.collectionFileIds && 
                                Array.isArray(collectionData.collectionFileIds) &&
                                collectionData.collectionFileIds.length > 0;
        
        // CRITICAL: Only block images/videos if it's ACTUALLY a collection
        // Don't block based on file.collection - that might be an empty object on non-collection files
        const isVideoFinal = (isTextPost || isCollectionFile) ? false : isVideo;
        const isImageFinal = (isTextPost || isCollectionFile) ? false : isImage;
        
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
            console.warn(`[FullScreenFeed] Image not rendering: ${fileId} (isTextPost: ${isTextPost})`);
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
            {/* Text Post / Thought - Render as its own tile, not an overlay */}
            {(isTextPost || textPostData) && (() => {
              // Check loaded thought content first (for thoughts loaded from Google Drive)
              const loadedContent = loadedThoughtContent.get(fileId);
              const effectiveTextPostData = loadedContent || textPostData;
              
              // Check if content is just a filename - if so, we need to load the actual thought file
              const currentContent = effectiveTextPostData?.content || file.description || file.name || file.title || '';
              const isJustFilename = /^thought-\d+\.(thought|png)/i.test(currentContent);
              
              // FIX: For public thoughts, content should already be in metadata.textPost.content
              // Only try to load from Google Drive if we're authenticated AND content is missing
              // If not authenticated (public feed), use what's in metadata or show fallback
              const hasAuth = userState.isUnlocked;
              const shouldLoadFromDrive = hasAuth && isJustFilename && !loadedContent;
              
              // If content is just a filename and we're loading, show loading state
              // Otherwise use the actual content
              const contentToRender = shouldLoadFromDrive ? 'Loading thought...' : (
                effectiveTextPostData?.content || 
                file.description || 
                file.name || 
                file.title || 
                (thoughtFileName ? thoughtFileName.replace(/\.(thought|png)$/i, '') : 'Thought')
              );
              
              // Debug logging removed - was causing performance issues
              // Only log in development mode and only once per file
              if (process.env.NODE_ENV === 'development' && !thoughtDetectionLogged.current.has(fileId)) {
                thoughtDetectionLogged.current.add(fileId);
                console.log(`[FullScreenFeed] Rendering thought/textPost for ${fileId}`);
              }
              
              // Only log warnings in development mode (performance optimization)
              if (isTextPost && !textPostData?.content && process.env.NODE_ENV === 'development') {
                console.warn(`[FullScreenFeed] Thought detected but missing content:`, {
                  fileId,
                  fileDisplayName: file.name || file.title
                });
              }
              
              // Reference dimensions from thought creator (1080x1920 canvas)
              const REFERENCE_WIDTH = 1080;
              const REFERENCE_HEIGHT = 1920;
              
              // Calculate scale factor based on current viewport dimensions
              // Use the smaller dimension to maintain aspect ratio
              const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : REFERENCE_WIDTH;
              const viewportHeight = typeof window !== 'undefined' ? (window.innerHeight - 64) : REFERENCE_HEIGHT; // Account for bottom nav
              const widthScale = viewportWidth / REFERENCE_WIDTH;
              const heightScale = viewportHeight / REFERENCE_HEIGHT;
              const scale = Math.min(widthScale, heightScale); // Use smaller to maintain aspect ratio
              
              // Use loaded content if available, otherwise use textPostData
              const styleData = effectiveTextPostData?.style || textPostData?.style;
              
              // Scale all style properties proportionally
              const baseFontSize = styleData?.fontSize || 48;
              const scaledFontSize = baseFontSize * scale;
              const basePadding = styleData?.padding || 40;
              const scaledPadding = basePadding * scale;
              const baseShadowOffsetX = styleData?.dropShadowOffsetX || 2;
              const baseShadowOffsetY = styleData?.dropShadowOffsetY || 2;
              const baseShadowBlur = styleData?.dropShadowBlur || 10;
              
              return (
                <div 
                  className="w-full h-full flex items-center justify-center relative"
                  style={{
                    backgroundColor: styleData?.backgroundColor || '#000000',
                    backgroundImage: styleData?.backgroundImage 
                      ? `url(${styleData.backgroundImage})` 
                      : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    position: 'relative', // Ensure it's in normal flow, not absolute
                    zIndex: 0, // Same z-index as other content types
                    width: '100%',
                    height: '100%'
                  }}
                >
                  <div
                    className="text-center"
                    style={{
                      fontFamily: styleData?.fontFamily || 'Arial',
                      fontSize: `${scaledFontSize}px`,
                      color: styleData?.textColor || '#FFFFFF',
                      fontWeight: styleData?.textStyle === 'bold' ? 'bold' : 'normal',
                      fontStyle: styleData?.textStyle === 'italic' ? 'italic' : 'normal',
                      textDecoration: styleData?.textStyle === 'strikethrough' ? 'line-through' : 'none',
                      textAlign: (styleData?.textAlign || 'center') as 'left' | 'center' | 'right' | 'justify',
                      textShadow: `
                        ${baseShadowOffsetX * scale}px 
                        ${baseShadowOffsetY * scale}px 
                        ${baseShadowBlur * scale}px 
                        ${styleData?.dropShadowColor || '#000000'}
                      `,
                      // Scale padding proportionally to maintain layout
                      padding: `${scaledPadding}px`,
                      // Constrain max dimensions to maintain aspect ratio
                      maxWidth: `${REFERENCE_WIDTH * scale}px`,
                      maxHeight: `${REFERENCE_HEIGHT * scale}px`,
                      width: '100%',
                      lineHeight: 1.2,
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale',
                      textRendering: 'optimizeLegibility',
                    }}
                  >
                  {(() => {
                    // Use effectiveTextPostData (loaded content or original)
                    const content = effectiveTextPostData?.content || contentToRender;
                    
                    // Handle different content formats
                    if (content && typeof content === 'string') {
                      // If content is HTML, sanitize it before rendering
                      if (content.includes('<')) {
                        // SECURITY: Sanitize HTML to prevent XSS attacks
                        const sanitizedContent = DOMPurify.sanitize(content, {
                          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
                          ALLOWED_ATTR: ['href', 'target', 'rel'],
                          ALLOW_DATA_ATTR: false
                        });
                        return <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />;
                      }
                      return content;
                    }
                    // Fallback to content we prepared above
                    // Log if we're using fallback content
                    if (!contentToRender || contentToRender === 'Thought' || contentToRender === 'Loading thought...') {
                      console.warn(`[FullScreenFeed] Using fallback content for thought ${fileId}:`, {
                        contentToRender,
                        hasLoadedContent: !!loadedContent,
                        fileDescription: file.description,
                        fileName: file.name,
                        fileTitle: file.title,
                        thoughtFileName
                      });
                    }
                    return contentToRender || 'No content available';
                  })()}
                </div>
              </div>
            );
          })()}

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
            {isImageFinal && !isTextPost && !textPostData && (() => {
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

            {/* Collection */}
            {(() => {
              // Only check metadata.collection, not file.collection - avoid false positives
              const collectionData = indexedFile.metadata?.collection;
              const isCollectionFile = actualFileType === 'collection' && 
                                      collectionData && 
                                      typeof collectionData === 'object' &&
                                      collectionData.collectionFileIds && 
                                      Array.isArray(collectionData.collectionFileIds) &&
                                      collectionData.collectionFileIds.length > 0;
              
              if (isCollectionFile && collectionData.collectionFileIds) {
                // Only log in development mode (performance optimization)
                if (process.env.NODE_ENV === 'development') {
                  console.log('[FullScreenFeed] Rendering collection:', {
                    fileId,
                    fileType: actualFileType,
                    collectionFileIds: collectionData.collectionFileIds.length
                  });
                }
                return (
                  <CollectionFeed
                    key={fileId}
                    collectionFileIds={collectionData.collectionFileIds}
                    accountId={undefined} // Will be fetched inside component
                  />
                );
              }
              return null;
            })()}

            {/* Non-image/video/text/slideshow/collection file */}
            {!isImageFinal && !isVideoFinal && !isTextPost && !textPostData && !isCollectionFile && (
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

