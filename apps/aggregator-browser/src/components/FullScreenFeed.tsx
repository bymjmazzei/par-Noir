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
import { formatTimestamp } from '../utils/formatTimestamp';
import { decryptWithToken, ShareToken } from '../utils/tokenDecryption';
// ImageSlideshow removed - PDF handling integrated directly into FullScreenFeed

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
  onShare,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(externalVideoBlobs || new Map());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(externalThumbnails || new Map());
  const [pdfPageThumbnails, setPdfPageThumbnails] = useState<Map<string, Map<number, string>>>(new Map()); // fileId -> pageIndex -> thumbnailUrl
  const [pdfCurrentPage, setPdfCurrentPage] = useState<Map<string, number>>(new Map()); // fileId -> current page index (0-based)
  const accountIdCacheRef = useRef<string | null>(null); // Cache accountId to avoid repeated API calls
  
  // Sync external thumbnails/videoBlobs when they change
  useEffect(() => {
    if (externalThumbnails) {
      setThumbnails(externalThumbnails);
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

  // Handle horizontal swipe for feed switching (disabled when viewing PDF - PDF uses its own swipe)
  const horizontalSwipeRef = useHorizontalSwipe({
    onSwipeLeft,
    onSwipeRight,
    enabled: !!(onSwipeLeft || onSwipeRight),
    threshold: 40,
    snapThreshold: 0.2
  });

  // Handle horizontal swipe for PDF pages (only active when viewing PDF)
  const pdfHorizontalSwipeRef = useHorizontalSwipe({
    onSwipeLeft: () => {
      const currentFile = files[currentIndex];
      if (!currentFile) return;
      const fileId = currentFile.metadata.fileId;
      const pdfPageThumbnailIds = currentFile.metadata?.pdfPageThumbnailIds;
      const currentPage = pdfCurrentPage.get(fileId) || 0;
      
      if (pdfPageThumbnailIds && currentPage < pdfPageThumbnailIds.length - 1) {
        const nextPageIndex = currentPage + 1;
        const pageThumbnails = pdfPageThumbnails.get(fileId);
        
        // Update page index immediately
        setPdfCurrentPage(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, nextPageIndex);
          return newMap;
        });
        
        // Update thumbnail immediately if already loaded, otherwise load it
        if (pageThumbnails?.has(nextPageIndex)) {
          setThumbnails(prev => {
            const newMap = new Map(prev);
            newMap.set(fileId, pageThumbnails.get(nextPageIndex)!);
            return newMap;
          });
        } else {
          // Load next page thumbnail
          const nextThumbnailId = pdfPageThumbnailIds[nextPageIndex];
          loadPdfPageThumbnail(fileId, nextThumbnailId, nextPageIndex, currentFile).then(() => {
            // Update thumbnail once loaded
            const updatedPageThumbnails = pdfPageThumbnails.get(fileId);
            if (updatedPageThumbnails?.has(nextPageIndex)) {
              setThumbnails(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, updatedPageThumbnails.get(nextPageIndex)!);
                return newMap;
              });
            }
          }).catch(() => {});
        }
      }
    },
    onSwipeRight: () => {
      const currentFile = files[currentIndex];
      if (!currentFile) return;
      const fileId = currentFile.metadata.fileId;
      const pdfPageThumbnailIds = currentFile.metadata?.pdfPageThumbnailIds;
      const currentPage = pdfCurrentPage.get(fileId) || 0;
      
      if (pdfPageThumbnailIds && currentPage > 0) {
        const prevPageIndex = currentPage - 1;
        const pageThumbnails = pdfPageThumbnails.get(fileId);
        
        // Update page index immediately
        setPdfCurrentPage(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, prevPageIndex);
          return newMap;
        });
        
        // Update thumbnail immediately if already loaded, otherwise load it
        if (pageThumbnails?.has(prevPageIndex)) {
          setThumbnails(prev => {
            const newMap = new Map(prev);
            newMap.set(fileId, pageThumbnails.get(prevPageIndex)!);
            return newMap;
          });
        } else {
          // Load previous page thumbnail
          const prevThumbnailId = pdfPageThumbnailIds[prevPageIndex];
          loadPdfPageThumbnail(fileId, prevThumbnailId, prevPageIndex, currentFile).then(() => {
            // Update thumbnail once loaded
            const updatedPageThumbnails = pdfPageThumbnails.get(fileId);
            if (updatedPageThumbnails?.has(prevPageIndex)) {
              setThumbnails(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, updatedPageThumbnails.get(prevPageIndex)!);
                return newMap;
              });
            }
          }).catch(() => {});
        }
      }
    },
    enabled: false, // Will be enabled dynamically based on PDF detection
    threshold: 50,
    snapThreshold: 0.2
  });

  // Helper function to get accountId with caching
  const getAccountId = async (indexedFile: IndexedFile, accessToken: string | null): Promise<string | null> => {
    // Return cached accountId if available
    if (accountIdCacheRef.current) {
      return accountIdCacheRef.current;
    }
    
    // Try to get from indexedFile first
    let accountId = indexedFile.accountId || indexedFile.backendFileId;
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

  // Load PDF page thumbnail on-demand
  // SECURITY FIX: Allow loading public thumbnails even when locked (no auth required for public files)
  const loadPdfPageThumbnail = async (
    fileId: string,
    thumbnailId: string,
    pageIndex: number,
    indexedFile: IndexedFile
  ) => {
    try {
      const { PNOAuthService } = await import('../services/pnOAuthService');
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const accessToken = await PNOAuthService.getValidAccessToken();
      const file = indexedFile.metadata;
      const isPublic = file?.isPublic !== false || !!file?.publicToken; // Public if explicitly public or has publicToken
      
      // Get accountId with caching
      const accountId = await getAccountId(indexedFile, accessToken);
      
      // Load thumbnail (try with auth if available, fallback to public access)
      let thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailId}?thumbnail=true`;
      if (accountId && accountId.includes('::')) {
        thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
      }
      
      let response: Response;
      if (accessToken) {
        response = await fetch(thumbnailUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.status === 401) {
          const refreshedToken = await PNOAuthService.getValidAccessToken(true);
          if (refreshedToken) {
            response = await fetch(thumbnailUrl, {
              headers: { 'Authorization': `Bearer ${refreshedToken}` }
            });
          } else {
            // If refresh failed and file is public, try without auth
            if (isPublic) {
              response = await fetch(thumbnailUrl);
            } else {
              return; // Can't access private file without auth
            }
          }
        }
      } else {
        // No auth token - try public access
        if (isPublic) {
          response = await fetch(thumbnailUrl);
        } else {
          return; // Can't access private file without auth
        }
      }
      
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const blob = await response.blob();
        
        // Decrypt if encrypted (only if authenticated)
        let thumbnailBlob: Blob;
        if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
          if (accessToken) {
            // Only decrypt if we have auth (encrypted files require auth)
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
                thumbnailBlob = new Blob([decryptedData], {
                  type: encryptedPackage.metadata?.originalMimeType || 'image/jpeg'
                });
              } else {
                console.warn(`[FullScreenFeed] Cannot decrypt PDF page thumbnail - no public key`);
                return; // Skip if can't decrypt
              }
            } else {
              console.warn(`[FullScreenFeed] Cannot decrypt PDF page thumbnail - no session`);
              return; // Skip if no session
            }
          } else {
            // Encrypted file but no auth - skip (can't decrypt)
            console.warn(`[FullScreenFeed] PDF page thumbnail is encrypted but user is locked - skipping`);
            return;
          }
        } else {
          // Not encrypted - use blob directly
          thumbnailBlob = blob;
        }
        
        const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
        setPdfPageThumbnails(prev => {
          const newMap = new Map(prev);
          if (!newMap.has(fileId)) {
            newMap.set(fileId, new Map());
          }
          const pageMap = newMap.get(fileId)!;
          pageMap.set(pageIndex, thumbnailUrlObj);
          return newMap;
        });
      }
    } catch (err) {
      console.error(`[FullScreenFeed] Failed to load PDF page thumbnail:`, err);
    }
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

  // Load video blobs and thumbnails for visible files (only if not provided externally)
  useEffect(() => {
    const loadMedia = async () => {
      console.log(`[FullScreenFeed] loadMedia: ${files.length} total files, currentIndex: ${currentIndex}`);
      // Load current file and adjacent files
      const indicesToLoad = [
        currentIndex - 1,
        currentIndex,
        currentIndex + 1
      ].filter(idx => idx >= 0 && idx < files.length);
      
      console.log(`[FullScreenFeed] loadMedia: Processing indices:`, indicesToLoad);

      // Parallelize loading for better performance
      await Promise.all(indicesToLoad.map(async (idx) => {
        const indexedFile = files[idx];
        const file = indexedFile.metadata;
        const fileId = file.fileId;

        // Check if it's a text post/thought first (same logic as render section)
        const isTextPost = !!(file.textPost || file.thought);
        
        const isVideo = !isTextPost && (
          file.fileType === 'video' || 
          (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i)
        );
        const isImage = !isTextPost && (
          file.fileType === 'image' || 
          (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i) ||
          (file as any).mimeType?.startsWith('image/') // Check mimeType if available
        );
        
        // Check for PDF document with page thumbnails
        const pdfPageThumbnailIds = indexedFile.metadata?.pdfPageThumbnailIds;
        const isPdfDocument = !isTextPost && file.fileType === 'document' && pdfPageThumbnailIds && pdfPageThumbnailIds.length > 0;
        
        console.log(`[FullScreenFeed] loadMedia for file ${fileId}:`, {
          fileName: file.name || file.title,
          fileType: file.fileType,
          mimeType: (file as any).mimeType,
          isTextPost,
          isImage,
          isVideo,
          isPdfDocument,
          pdfPageCount: pdfPageThumbnailIds?.length || 0,
          hasPublicToken: !!file.publicToken,
          thumbnailExists: thumbnails.has(fileId),
          videoBlobExists: videoBlobs.has(fileId)
        });

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
                continue;
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
                // Skip if thumbnailFileId exists (we'll load thumbnail instead)
                if (isImage && !thumbnails.has(fileId) && !file.thumbnailFileId) {
          console.log(`[FullScreenFeed] Attempting to load image ${fileId}...`);
          // Check if external thumbnails has this file
          const hasExternalThumbnail = externalThumbnails && externalThumbnails.has(fileId);
          if (!hasExternalThumbnail) {
            try {
              // PRIORITY 1: Check for thumbnailFileId in metadata (fast thumbnail ~200ms)
              const thumbnailFileId = file.thumbnailFileId;
              if (thumbnailFileId) {
                console.log(`[FullScreenFeed] Loading thumbnail for ${fileId} from thumbnailFileId: ${thumbnailFileId}`);
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
                          thumbnailBlob = new Blob([decryptedData], {
                            type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                          });
                        } else {
                          continue; // Skip if can't decrypt
                        }
                      } else {
                        continue; // Skip if no session
                      }
                    } else {
                      thumbnailBlob = blob;
                    }
                    
                    const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
                    console.log(`✅ [FullScreenFeed] Loaded thumbnail for ${fileId} (fast)`);
                    setThumbnails(prev => {
                      const newMap = new Map(prev);
                      newMap.set(fileId, thumbnailUrlObj);
                      return newMap;
                    });
                    
                    // Load full image in background (optional - user can tap to load full quality)
                    // This is handled by the existing logic below if needed
                    continue; // Skip to next file, thumbnail is loaded
                  }
                }
              }
              
              // PRIORITY 2: If image has publicToken, use decryptWithToken (for shared/public images)
              if (file.publicToken) {
                let token: ShareToken;
                try {
                  token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
                } catch (e) {
                  console.warn(`[FullScreenFeed] Failed to parse token for ${fileId}:`, e);
                  continue;
                }
                
                // Try to decrypt with retry on failure
                let decryptedBlob: Blob;
                try {
                  decryptedBlob = await decryptWithToken(token);
                } catch (decryptErr: any) {
                  // If decryption fails, try refreshing token and retrying once
                  console.warn(`[FullScreenFeed] Decryption failed for ${fileId}, refreshing token and retrying...`, decryptErr);
                  const { PNOAuthService } = await import('../services/pnOAuthService');
                  await PNOAuthService.getValidAccessToken(true); // Force refresh
                  // Retry decryption
                  decryptedBlob = await decryptWithToken(token);
                }
                
                const thumbnailUrl = URL.createObjectURL(decryptedBlob);
                console.log(`[FullScreenFeed] Set thumbnail URL for ${fileId}:`, thumbnailUrl, `Blob size: ${decryptedBlob.size} bytes, type: ${decryptedBlob.type}`);
                setThumbnails(prev => {
                  const newMap = new Map(prev);
                  newMap.set(fileId, thumbnailUrl);
                  return newMap;
                });
              } else {
                // No publicToken - use API endpoint directly (like upload page does)
                // This works for images the user owns but hasn't made public
                const { PNOAuthService } = await import('../services/pnOAuthService');
                const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
                const accessToken = await PNOAuthService.getValidAccessToken();
                
                if (!accessToken) {
                  console.warn(`[FullScreenFeed] No access token for image ${fileId}`);
                  continue;
                }

                // Get accountId with caching
                const accountId = await getAccountId(indexedFile, accessToken);

                // Use thumbnail endpoint - for encrypted files, API will return the full encrypted file
                let thumbnailUrl = `${apiEndpoint}/api/drive/files/${fileId}?thumbnail=true`;
                if (accountId && accountId.includes('::')) {
                  thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
                }

                let response = await fetch(thumbnailUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`
                  }
                });

                // If we get 401, refresh token and retry once
                if (response.status === 401) {
                  const refreshedToken = await PNOAuthService.getValidAccessToken(true);
                  if (refreshedToken) {
                    response = await fetch(thumbnailUrl, {
                      headers: {
                        'Authorization': `Bearer ${refreshedToken}`
                      }
                    });
                  }
                }

                if (!response.ok) {
                  console.warn(`[FullScreenFeed] Failed to load image ${fileId} from API: ${response.status}`);
                  continue;
                }

                const contentType = response.headers.get('content-type') || '';
                const blob = await response.blob();

                // Check if this is an encrypted file (JSON) or a direct image
                let imageBlob: Blob;
                
                if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                  // This is an encrypted file - decrypt it
                  const { EncryptionManager } = await import('../utils/encryptionManager');
                  
                  interface EncryptedFilePackage {
                    encrypted: string;
                    iv: string;
                    salt: string;
                    metadata: {
                      originalName: string;
                      originalSize: number;
                      originalMimeType: string;
                    };
                  }
                  
                  const session = PNOAuthService.loadSession();
                  if (!session?.did) {
                    throw new Error('No session for decryption');
                  }
                  
                  const pnId = session.did;
                  let publicKey = session?.publicKey;
                  
                  if (!publicKey && session.did.startsWith('did:key:')) {
                    publicKey = session.did.substring(8);
                  }
                  
                  if (!publicKey) {
                    throw new Error('No public key for decryption');
                  }
                  
                  // Parse encrypted package
                  const encryptedText = await blob.text();
                  const encryptedPackage: EncryptedFilePackage = JSON.parse(encryptedText);
                  
                  // Decrypt
                  const encryptionManager = new EncryptionManager();
                  const decryptedData = await encryptionManager.decrypt(
                    encryptedPackage.encrypted,
                    encryptedPackage.iv,
                    encryptedPackage.salt,
                    pnId,
                    publicKey
                  );
                  
                  // Create image blob from decrypted data
                  imageBlob = new Blob([decryptedData], {
                    type: encryptedPackage.metadata.originalMimeType || 'image/png'
                  });
                } else {
                  // Direct image (non-encrypted or already decrypted by API)
                  imageBlob = blob;
                }

                const thumbnailUrlObj = URL.createObjectURL(imageBlob);
                console.log(`[FullScreenFeed] Set thumbnail URL (API fallback) for ${fileId}:`, thumbnailUrlObj, `Blob size: ${imageBlob.size} bytes, type: ${imageBlob.type}`);
                setThumbnails(prev => {
                  const newMap = new Map(prev);
                  newMap.set(fileId, thumbnailUrlObj);
                  return newMap;
                });
              }
            } catch (err) {
              console.error(`[FullScreenFeed] Failed to load thumbnail for ${fileId}:`, err);
            }
          }
        }

        // Load PDF document FIRST thumbnail (EXACT same pattern as images - loads immediately)
        // SECURITY FIX: Allow loading public thumbnails even when locked (no auth required for public files)
        if (isPdfDocument && pdfPageThumbnailIds && pdfPageThumbnailIds.length > 0 && !thumbnails.has(fileId)) {
          const firstThumbnailId = pdfPageThumbnailIds[0];
          console.log(`[FullScreenFeed] Loading FIRST PDF thumbnail for ${fileId} from page thumbnail: ${firstThumbnailId}`);
          
          try {
            const { PNOAuthService } = await import('../services/pnOAuthService');
            const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
            const accessToken = await PNOAuthService.getValidAccessToken();
            const isPublic = file.isPublic !== false || !!file.publicToken; // Public if explicitly public or has publicToken
            
            // Get accountId with caching
            const accountId = await getAccountId(indexedFile, accessToken);
            
            // Load FIRST thumbnail (try with auth if available, fallback to public access)
            let thumbnailUrl = `${apiEndpoint}/api/drive/files/${firstThumbnailId}?thumbnail=true`;
            if (accountId && accountId.includes('::')) {
              thumbnailUrl += `&accountId=${encodeURIComponent(accountId)}`;
            }
            
            // Try with auth token if available, otherwise try without (for public files)
            let response: Response;
            if (accessToken) {
              response = await fetch(thumbnailUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              
              if (response.status === 401) {
                const refreshedToken = await PNOAuthService.getValidAccessToken(true);
                if (refreshedToken) {
                  response = await fetch(thumbnailUrl, {
                    headers: { 'Authorization': `Bearer ${refreshedToken}` }
                  });
                } else {
                  // If refresh failed and file is public, try without auth
                  if (isPublic) {
                    response = await fetch(thumbnailUrl);
                  }
                }
              }
            } else {
              // No auth token - try public access
              response = await fetch(thumbnailUrl);
            }
              
            if (response.ok) {
              const contentType = response.headers.get('content-type') || '';
              const blob = await response.blob();
              
              // Decrypt thumbnail if encrypted (only if authenticated)
              let thumbnailBlob: Blob;
              if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                if (accessToken) {
                  // Only decrypt if we have auth (encrypted files require auth)
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
                      thumbnailBlob = new Blob([decryptedData], {
                        type: encryptedPackage.metadata?.originalMimeType || 'image/jpeg'
                      });
                    } else {
                      console.warn(`[FullScreenFeed] Cannot decrypt PDF thumbnail - no public key`);
                      return; // Skip if can't decrypt
                    }
                  } else {
                    console.warn(`[FullScreenFeed] Cannot decrypt PDF thumbnail - no session`);
                    return; // Skip if no session
                  }
                } else {
                  // Encrypted file but no auth - skip (can't decrypt)
                  console.warn(`[FullScreenFeed] PDF thumbnail is encrypted but user is locked - skipping`);
                  return;
                }
              } else {
                // Not encrypted - use blob directly
                thumbnailBlob = blob;
              }
              
              // Store FIRST thumbnail in thumbnails Map (so it displays immediately like any image)
              const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
              console.log(`✅ [FullScreenFeed] Loaded FIRST PDF thumbnail for ${fileId} (page 1 of ${pdfPageThumbnailIds.length})`);
              setThumbnails(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, thumbnailUrlObj);
                return newMap;
              });
              
              // Initialize PDF page state
              setPdfCurrentPage(prev => {
                const newMap = new Map(prev);
                if (!newMap.has(fileId)) {
                  newMap.set(fileId, 0); // Start at page 0 (first page)
                }
                return newMap;
              });
              
              // Store first thumbnail in PDF pages map too
              setPdfPageThumbnails(prev => {
                const newMap = new Map(prev);
                if (!newMap.has(fileId)) {
                  newMap.set(fileId, new Map());
                }
                const pageMap = newMap.get(fileId)!;
                pageMap.set(0, thumbnailUrlObj);
                return newMap;
              });
            }
          } catch (err) {
            console.error(`[FullScreenFeed] Failed to load PDF thumbnail for ${fileId}:`, err);
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
                   (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

    if (isVideo && videoElement && videoBlobs.has(visibleFileId)) {
      videoElement.play().catch(err => {
        console.warn('Failed to auto-play video:', err);
      });
    }
  }, [visibleFileId, files, videoBlobs]);

  // Enable PDF horizontal swipe when viewing PDF
  useEffect(() => {
    const currentFile = files[currentIndex];
    if (!currentFile) {
      if (pdfHorizontalSwipeRef.current) {
        (pdfHorizontalSwipeRef as any).current.enabled = false;
      }
      return;
    }
    
    const fileId = currentFile.metadata.fileId;
    const file = currentFile.metadata;
    const pdfPageThumbnailIds = currentFile.metadata?.pdfPageThumbnailIds;
    const isPdfDoc = file.fileType === 'document' && pdfPageThumbnailIds && pdfPageThumbnailIds.length > 0;
    
    if (visibleFileId === fileId && isPdfDoc && pdfHorizontalSwipeRef.current) {
      (pdfHorizontalSwipeRef as any).current.enabled = true;
      (pdfHorizontalSwipeRef as any).current.element = scrollContainerRef.current;
    } else if (pdfHorizontalSwipeRef.current) {
      (pdfHorizontalSwipeRef as any).current.enabled = false;
    }
  }, [visibleFileId, currentIndex, files]);

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
                         (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

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
        // Height excludes bottom nav bar (64px) and safe area
        height: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
        maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
        // Start at top of window
        marginTop: '0',
        paddingTop: '0',
        boxSizing: 'border-box'
      }}
    >
      {/* Only render visible files (currentIndex ± 1) for better performance */}
      {files
        .slice(
          Math.max(0, currentIndex - 1),
          Math.min(files.length, currentIndex + 2)
        )
        .map((indexedFile, relativeIdx) => {
        const idx = Math.max(0, currentIndex - 1) + relativeIdx;
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        
        // Check for text post FIRST before checking image/video
        // This prevents thoughts from being misclassified as images/videos
        // Check multiple possible locations for thought data
        let textPostData: any = (indexedFile.metadata as any)?.textPost || 
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
        // OR if filename suggests it's a thought (thought-*.png), try to reconstruct it from other metadata fields
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
        const hasTextFileType = file.fileType === 'text' || 
                               file.fileType === 'thought' ||
                               indexedFile.metadata?.fileType === 'text' || 
                               indexedFile.metadata?.fileType === 'thought';
        
        // If we have textPost/thought data, it's definitely a thought, regardless of fileType
        // This handles cases where fileType might be 'other' due to API defaults
        const isTextPost = hasTextPostData || hasTextFileType;
        
        // If it's a thought but fileType is wrong, log it for debugging
        if (hasTextPostData && !hasTextFileType) {
          console.warn('[FullScreenFeed] Thought detected by data but fileType is incorrect:', {
            fileId,
            fileType: file.fileType,
            metadataFileType: indexedFile.metadata?.fileType,
            hasTextPostData: true
          });
        }
        
        // Only check for image/video if it's NOT a text post
        // This prevents thoughts with image-like filenames from being misclassified
        const isVideo = !isTextPost && (
          file.fileType === 'video' || 
          (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i)
        );
        const isImage = !isTextPost && (
          file.fileType === 'image' || 
          (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i)
        );
        // Check if this is an image slideshow folder (folder ending with "-pages")
        // PDF slideshow detection: check for pdfPageThumbnailIds array (thumbnails loaded directly, no folder listing)
        // Check metadata immediately - don't wait for async operations
        const pdfFileId = indexedFile.metadata?.pdfFileId;
        const pdfPageThumbnailIds = indexedFile.metadata?.pdfPageThumbnailIds;
        // Detect slideshow EARLY - if fileType is 'document', assume it's a PDF slideshow
        // This prevents loading screen delay - ImageSlideshow will handle empty thumbnailIds gracefully
        const isImageSlideshowFolder = !isTextPost && (
          (pdfPageThumbnailIds && pdfPageThumbnailIds.length > 0) ||
          file.fileType === 'document' // PDF document - always treat as slideshow (even if thumbnails not loaded yet)
        );
        
        // Check if this is a PDF document (reuse pdfPageThumbnailIds from above)
        const isPdfDoc = !isTextPost && file.fileType === 'document' && pdfPageThumbnailIds && pdfPageThumbnailIds.length > 0;
        
        // No PDF support - only image slideshows from folders
        
        // Debug logging for ALL files to see what's happening
        // Debug logging removed for cleaner console - uncomment if needed for debugging
        // const fullMetadata = indexedFile.metadata ? JSON.stringify(indexedFile.metadata, null, 2) : 'no metadata';
        // const fullFile = JSON.stringify(file, null, 2);
        // const fullIndexedFile = JSON.stringify(indexedFile, null, 2);
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
              // Height excludes bottom nav bar (64px) and safe area
              height: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
              minHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
              maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
              // Start at top of window
              marginTop: '0',
              paddingTop: '0',
              boxSizing: 'border-box',
              overflow: 'hidden', // Ensure background doesn't overflow
              position: 'relative' // Ensure proper stacking context
            }}
          >
            {/* Text Post / Thought - Render FIRST to prevent being overridden by image/video */}
            {(isTextPost || textPostData) && (
              <div 
                className="w-full h-full flex items-center justify-center relative z-30"
                style={{
                  backgroundColor: textPostData?.style?.backgroundColor || '#000000',
                  backgroundImage: textPostData?.style?.backgroundImage 
                    ? `url(${textPostData.style.backgroundImage})` 
                    : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <div
                  className="w-full text-center"
                  style={{
                    fontFamily: textPostData?.style?.fontFamily || 'Arial',
                    fontSize: `${textPostData?.style?.fontSize || 48}px`,
                    color: textPostData?.style?.textColor || '#FFFFFF',
                    fontWeight: textPostData?.style?.textStyle === 'bold' ? 'bold' : 'normal',
                    fontStyle: textPostData?.style?.textStyle === 'italic' ? 'italic' : 'normal',
                    textDecoration: textPostData?.style?.textStyle === 'strikethrough' ? 'line-through' : 'none',
                    textAlign: (textPostData?.style?.textAlign || 'center') as 'left' | 'center' | 'right' | 'justify',
                    textShadow: `
                      ${textPostData?.style?.dropShadowOffsetX || 2}px 
                      ${textPostData?.style?.dropShadowOffsetY || 2}px 
                      ${textPostData?.style?.dropShadowBlur || 10}px 
                      ${textPostData?.style?.dropShadowColor || '#000000'}
                    `,
                    // Use responsive padding that maintains layout as screen size changes
                    padding: (() => {
                      const basePadding = textPostData?.style?.padding || 40;
                      // Scale padding proportionally with viewport width to maintain layout
                      const viewportWidth = window.innerWidth;
                      const baseViewportWidth = 375; // iPhone base width
                      const paddingScale = viewportWidth / baseViewportWidth;
                      return `${basePadding * paddingScale}px`;
                    })(),
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
                    // Handle different content formats
                    if (textPostData?.content) {
                      // If content is HTML, sanitize it before rendering
                      if (typeof textPostData.content === 'string' && textPostData.content.includes('<')) {
                        // SECURITY: Sanitize HTML to prevent XSS attacks
                        const sanitizedContent = DOMPurify.sanitize(textPostData.content, {
                          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
                          ALLOWED_ATTR: ['href', 'target', 'rel'],
                          ALLOW_DATA_ATTR: false
                        });
                        return <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />;
                      }
                      return textPostData.content;
                    }
                    // Fallback to description, name, or title
                    return file.description || file.name || file.title || 'Thought';
                  })()}
                </div>
              </div>
            )}

            {/* Full-screen video */}
            {isVideo && videoBlobs.get(fileId) && (() => {
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
                      // Height excludes bottom nav bar (64px) and safe area
                      maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
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
            
            {/* PDF Document - Display like image but with horizontal swipe for pages */}
            {isPdfDoc && !isTextPost && !textPostData && thumbnails.get(fileId) && (() => {
              const currentPage = pdfCurrentPage.get(fileId) || 0;
              const totalPages = pdfPageThumbnailIds.length;
              const pageThumbnailUrl = pdfPageThumbnails.get(fileId)?.get(currentPage) || thumbnails.get(fileId)!;
              
              return (
                <>
                  {/* Page indicator */}
                  {totalPages > 1 && (
                    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/60 px-4 py-2 rounded-full">
                      <span className="text-white text-sm">
                        Page {currentPage + 1} / {totalPages}
                      </span>
                    </div>
                  )}

                  {/* Previous Page Button */}
                  {currentPage > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const prevPageIndex = currentPage - 1;
                        setPdfCurrentPage(prev => {
                          const newMap = new Map(prev);
                          newMap.set(fileId, prevPageIndex);
                          return newMap;
                        });
                        // Load previous page thumbnail if not loaded
                        const pageThumbnails = pdfPageThumbnails.get(fileId);
                        if (!pageThumbnails?.has(prevPageIndex)) {
                          const prevThumbnailId = pdfPageThumbnailIds[prevPageIndex];
                          loadPdfPageThumbnail(fileId, prevThumbnailId, prevPageIndex, indexedFile).catch(() => {});
                        } else {
                          // Update thumbnail immediately if already loaded
                          setThumbnails(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, pageThumbnails.get(prevPageIndex)!);
                            return newMap;
                          });
                        }
                      }}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
                      aria-label="Previous PDF page"
                    >
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}

                  {/* Next Page Button */}
                  {currentPage < totalPages - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextPageIndex = currentPage + 1;
                        setPdfCurrentPage(prev => {
                          const newMap = new Map(prev);
                          newMap.set(fileId, nextPageIndex);
                          return newMap;
                        });
                        // Load next page thumbnail if not loaded
                        const pageThumbnails = pdfPageThumbnails.get(fileId);
                        if (!pageThumbnails?.has(nextPageIndex)) {
                          const nextThumbnailId = pdfPageThumbnailIds[nextPageIndex];
                          loadPdfPageThumbnail(fileId, nextThumbnailId, nextPageIndex, indexedFile).catch(() => {});
                        } else {
                          // Update thumbnail immediately if already loaded
                          setThumbnails(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, pageThumbnails.get(nextPageIndex)!);
                            return newMap;
                          });
                        }
                      }}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
                      aria-label="Next PDF page"
                    >
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}

                  {/* Main PDF Page Thumbnail */}
                  <div className="w-full h-full flex items-center justify-center relative z-10">
                    <img
                      src={pageThumbnailUrl}
                      alt={`Page ${currentPage + 1}${fileName ? ` of ${fileName}` : ''}`}
                      className="max-w-full max-h-full object-contain"
                      style={{
                        maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
                        height: 'auto',
                        width: 'auto',
                        objectFit: 'contain',
                        imageRendering: 'smooth',
                        WebkitImageRendering: 'smooth',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'translateZ(0)'
                      }}
                      loading="eager"
                      decoding="sync"
                      onError={(e) => {
                        console.error(`[FullScreenFeed] PDF page image failed to load for ${fileId} page ${currentPage + 1}:`, e);
                      }}
                    />
                  </div>
                </>
              );
            })()}
            
            {/* Full-screen image (single image, not PDF) - Only render if NOT a text post and NOT PDF */}
            {isImage && !isPdfDoc && !isTextPost && !textPostData && thumbnails.get(fileId) && (() => {
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
                left: 0,
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
                    src={thumbnails.get(fileId)!}
                    alt=""
                    className="absolute"
                    style={backgroundStyle}
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      console.error(`[FullScreenFeed] Background image failed to load for ${fileId}:`, e);
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
                          console.log(`[FullScreenFeed] Image loaded successfully for ${fileId}, dimensions: ${el.naturalWidth}x${el.naturalHeight}`);
                          setMediaDimensions(prev => {
                            const newMap = new Map(prev);
                            newMap.set(fileId, { width: el.naturalWidth, height: el.naturalHeight });
                            return newMap;
                          });
                        });
                        el.addEventListener('error', (err) => {
                          console.error(`[FullScreenFeed] Image failed to load for ${fileId}:`, err);
                          console.error(`[FullScreenFeed] Image src:`, el.src);
                          console.error(`[FullScreenFeed] Thumbnail URL:`, thumbnails.get(fileId));
                        });
                      }
                    }}
                    src={thumbnails.get(fileId)!}
                    alt={fileName}
                    style={{ 
                        // Display at natural size, scaled to fit container while maintaining aspect ratio
                        maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))',
                        maxWidth: '100%',
                      height: 'auto',
                        width: 'auto',
                        objectFit: 'contain',
                        imageRendering: 'smooth',
                        WebkitImageRendering: 'smooth',
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

            {/* Loading state - Only show if NOT a text post AND NOT PDF document AND NOT single image */}
            {/* PDF documents are rendered above with integrated page navigation */}
            {/* Single images show loading until thumbnail is loaded */}
            {!isTextPost && !textPostData && !isPdfDoc && ((isImage || isVideo) && !thumbnails.get(fileId) && !videoBlobs.get(fileId)) && (
              <div className="flex flex-col items-center justify-center text-neutral-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2"></div>
                <span className="text-xs">Loading...</span>
              </div>
            )}

            {/* Non-image/video/text/slideshow file */}
            {!isImage && !isVideo && !isPdfDoc && !isTextPost && !textPostData && (
              <div className="flex flex-col items-center justify-center text-neutral-500">
                <File className="h-24 w-24 mb-4" />
                <h3 className="text-white text-xl font-medium mb-2">{fileName}</h3>
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
                    likes: getLikeCount(fileId, indexedFile.metadata.engagement?.likes || 0),
                    comments: getComments(fileId).length + (indexedFile.metadata.engagement?.comments || 0),
                    shares: getShareCount(fileId, indexedFile.metadata.engagement?.shares || 0)
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
              isOwner={userState.isUnlocked && userState.pnIdentifier && (
                creatorId === userState.pnIdentifier
              )}
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
                bottom: '0', // Content info is within the media container, which already excludes bottom nav
                zIndex: 30 // Ensure it's above media (z-10) and background (z-0)
              }}
            >
              <div className="flex gap-4">
                {/* Left Half - Title & Caption */}
                <div className="flex-1">
                  {/* Title */}
                  <h3 className="text-white text-base md:text-lg font-semibold mb-1 line-clamp-1">
                    {file.title || file.name || 'Untitled'}
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
                        comment.authorId === userState.pnIdentifier.replace(/^pn-/, '')
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
          </div>
        );
      })}
    </div>
  );
}

