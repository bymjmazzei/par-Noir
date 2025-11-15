/**
 * Aggregator Browser
 * Licensed aggregator application for discovering and viewing public encrypted content
 * Deployed at browse.parnoir.com
 */

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Search, Filter, File, Globe, Tag, Calendar, User, Download, RefreshCw, Lock, Image as ImageIcon, X, MessageCircle } from 'lucide-react';
import { getMetadataIndexService } from './services/metadata/MetadataIndexService';
import { PublicMetadata, MetadataFilters, IndexedFile, Feed } from './types/aggregator';
import { decryptWithToken, ShareToken } from './utils/tokenDecryption';
import { useUserState } from './contexts/UserStateContext';
import { FeedRail, buildFeedRailItems } from './components/FeedRail';
import { EngagementActions } from './components/EngagementActions';
import { PNOAuthService } from './services/pnOAuthService';
import { FeedBrowser } from './components/FeedBrowser';
import { CreatorIndex } from './components/CreatorIndex';
import { FeedEngagementSidebar } from './components/FeedEngagementSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { ContentRatingBadge } from './components/ContentRatingBadge';
import { EmptyState } from './components/EmptyState';
import { WelcomeModal } from './components/WelcomeModal';
import { CommentModal } from './components/CommentModal';
import { BrandedFeedPage } from './components/BrandedFeedPage';
import { NotificationBell } from './components/NotificationBell';
import { ToastContainer } from './components/Toast';
import { Settings, Upload, Plus, Home, Grid, Lock, Unlock } from 'lucide-react';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useSwipeGesture } from './hooks/useSwipeGesture';
import { useEngagement } from './hooks/useEngagement';
import { useToast } from './hooks/useToast';
import { useURLParams } from './hooks/useURLParams';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useFileState } from './hooks/useFileState';
import { useUIState } from './hooks/useUIState';
import { useFeedState } from './hooks/useFeedState';
import { useSearchState } from './hooks/useSearchState';
import { loadFeedViewedTimestamps, markFeedAsViewed, hasNewContent } from './utils/feedUtils';
import { FeedService } from './services/feedService';
import { ErrorDisplay } from './components/ErrorDisplay';
import { notificationWebSocket } from './services/notificationWebSocket';
import { ModalOrchestrator } from './components/ModalOrchestrator';

// Shared types - importing from id-dashboard
// In production, these would come from a shared package

function App() {
  const { userState, setLocked, setUnlocked } = useUserState();
  
  // State management hooks
  const fileState = useFileState();
  const uiState = useUIState();
  const feedState = useFeedState();
  const searchState = useSearchState();
  
  // Destructure for easier access
  const {
    indexedFiles, setIndexedFiles,
    isLoading, setIsLoading,
    error, setError,
    viewingFile, setViewingFile,
    thumbnails, setThumbnails,
    generatingThumbnails, setGeneratingThumbnails,
    videoPlaying, setVideoPlaying,
    videoBlobs, setVideoBlobs,
    imageBlobs, setImageBlobs,
    visibleFileId, setVisibleFileId,
    commentingFile, setCommentingFile,
    addingToFeedFile, setAddingToFeedFile,
    videoRefs
  } = fileState;
  
  const {
    viewMode, setViewMode,
    showFeedBrowser, setShowFeedBrowser,
    showSettings, setShowSettings,
    showShortcuts, setShowShortcuts,
    showUploadModal, setShowUploadModal,
    showCreateFeedModal, setShowCreateFeedModal,
    showWelcome, setShowWelcome,
    viewingCreatorId, setViewingCreatorId,
    viewingBrandedFeed, setViewingBrandedFeed
  } = uiState;
  
  const {
    activeFeedId, setActiveFeedId,
    feeds, setFeeds,
    feedViewedTimestamps, setFeedViewedTimestamps,
    hasMore, setHasMore,
    isRefreshing, setIsRefreshing
  } = feedState;
  
  const {
    searchQuery, setSearchQuery,
    filters, setFilters
  } = searchState;
  
  const feedScrollRef = React.useRef<HTMLDivElement>(null); // Ref for feed scroll container
  
  const metadataIndexService = getMetadataIndexService();
  const { toggleLike, share, getLikeCount, isLiked, getComments, getShareCount, loadBulkEngagementStats } = useEngagement();
  const { toasts, removeToast, success, error: showErrorToast } = useToast();
  const { getParam, setParam } = useURLParams();

  // Use refs to avoid circular dependencies in useEffects
  const discoverFilesRef = React.useRef<((searchFilters?: MetadataFilters, forceRefresh?: boolean, append?: boolean) => Promise<void>) | null>(null);
  const generateThumbnailsRef = React.useRef<((files: IndexedFile[]) => Promise<void>) | null>(null);

  // Create a thumbnail from a blob (resize image to max dimensions) - MUST be defined first
  const createThumbnailFromBlob = useCallback((blob: Blob, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        // Calculate dimensions to maintain aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to data URL
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        resolve(thumbnailDataUrl);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  }, []);

  // Create a thumbnail from a video blob (extract a frame) - MUST be defined second
  const createVideoThumbnailFromBlob = useCallback((blob: Blob, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      
      video.onloadedmetadata = () => {
        // Seek to 1 second (or 10% of duration, whichever is smaller) to get a good frame
        video.currentTime = Math.min(1, video.duration * 0.1);
      };
      
      video.onseeked = () => {
        // Calculate dimensions to maintain aspect ratio
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        // Create canvas and draw video frame
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(video, 0, 0, width, height);
        
        // Convert to data URL
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        resolve(thumbnailDataUrl);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video'));
      };
      
      video.preload = 'metadata';
      video.src = url;
    });
  }, []);

  // Generate thumbnails for image and video files - MUST be defined third (depends on above)
  const generateThumbnailsForImages = useCallback(async (files: IndexedFile[]) => {
    for (const indexedFile of files) {
      const file = indexedFile.metadata;
      const isImage = file.fileType === 'image' || 
                     (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
      const isVideo = file.fileType === 'video' || 
                     (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
      
      // Skip if not an image/video, no publicToken, or already has thumbnail/generating
      if ((!isImage && !isVideo) || !file.publicToken || thumbnails.has(file.fileId) || generatingThumbnails.has(file.fileId)) {
        continue;
      }

      generatingThumbnails.add(file.fileId);
      setGeneratingThumbnails(new Set(generatingThumbnails));

      try {
        // Parse token
        let token: ShareToken;
        try {
          token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
        } catch (e) {
          console.warn(`Failed to parse token for ${file.fileId}:`, e);
          generatingThumbnails.delete(file.fileId);
          setGeneratingThumbnails(new Set(generatingThumbnails));
          continue;
        }

        // Decrypt file
        const decryptedBlob = await decryptWithToken(token);
        
        // Create thumbnail from decrypted blob
        let thumbnailUrl: string;
        if (isVideo) {
          // For videos, extract a frame as thumbnail
          thumbnailUrl = await createVideoThumbnailFromBlob(decryptedBlob, 300, 300);
        } else {
          // For images, resize
          thumbnailUrl = await createThumbnailFromBlob(decryptedBlob, 300, 300);
        }
        
        // Store thumbnail URL
        setThumbnails(prev => {
          const newMap = new Map(prev);
          newMap.set(file.fileId, thumbnailUrl);
          return newMap;
        });
      } catch (err) {
        console.warn(`Failed to generate thumbnail for ${file.fileId}:`, err);
      } finally {
        generatingThumbnails.delete(file.fileId);
        setGeneratingThumbnails(new Set(generatingThumbnails));
      }
    }
  }, [thumbnails, generatingThumbnails, createThumbnailFromBlob, createVideoThumbnailFromBlob]);

  // Set ref synchronously after function is defined (not in effect to avoid timing issues)
  generateThumbnailsRef.current = generateThumbnailsForImages;

  // Fetch feeds from API
  useEffect(() => {
    const loadFeeds = async () => {
      try {
        const result = await FeedService.listFeeds({ limit: 100 });
        setFeeds(result.feeds);
      } catch (error) {
        console.error('Failed to load feeds:', error);
        // Continue with empty feeds - UI will show default feeds
      }
    };

    loadFeeds();
  }, []);

  // Reload feeds when a new feed is created
  const handleFeedCreated = async (feed: Feed) => {
    try {
      const result = await FeedService.listFeeds({ limit: 100 });
      setFeeds(result.feeds);
      // Optionally switch to the new feed
      setActiveFeedId(feed.feedId);
    } catch (error) {
      console.error('Failed to reload feeds:', error);
    }
  };

  // Load user subscriptions when user connects
  useEffect(() => {
    const loadSubscriptions = async () => {
      if (userState.isUnlocked && userState.pnIdentifier) {
        try {
          const subscribedFeeds = await FeedService.getUserSubscriptions(userState.pnIdentifier);
          // Update user state with subscriptions
          subscribedFeeds.forEach(feed => {
            if (!userState.preferences.subscribedFeedIds.includes(feed.feedId)) {
              // This will be handled by UserStateContext - for now just log
              console.log('User subscribed to:', feed.feedId);
            }
          });
        } catch (error) {
          console.error('Failed to load subscriptions:', error);
        }
      }
    };

    loadSubscriptions();
  }, [userState.isUnlocked, userState.pnIdentifier]);

  // Connect to WebSocket notifications when user is unlocked
  useEffect(() => {
    if (userState.isUnlocked && userState.pnIdentifier) {
      notificationWebSocket.connect(userState.pnIdentifier);
      
      // Subscribe to notifications
      const unsubscribe = notificationWebSocket.onNotification((notification) => {
        success(`New notification: ${notification.title || notification.type}`);
      });

      return () => {
        unsubscribe();
        notificationWebSocket.disconnect();
      };
    }
  }, [userState.isUnlocked, userState.pnIdentifier, success]);

  // Load bulk engagement stats when files are loaded
  useEffect(() => {
    if (indexedFiles.length > 0) {
      const fileIds = indexedFiles.map(file => file.metadata.fileId);
      // Load engagement stats in batches to avoid overwhelming the API
      const batchSize = 50;
      for (let i = 0; i < fileIds.length; i += batchSize) {
        const batch = fileIds.slice(i, i + batchSize);
        loadBulkEngagementStats(batch);
      }
    }
  }, [indexedFiles.length, loadBulkEngagementStats]); // Only reload when count changes

  // Handle OAuth consent flow - show auth modal when redirected from consent page
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthConsent = urlParams.get('oauth_consent');
    
    if (oauthConsent === 'true') {
      // Show the auth modal for OAuth consent
      setShowAuthModal(true);
      // Clean up URL but keep params for the modal
      const newParams = new URLSearchParams(window.location.search);
      newParams.delete('oauth_consent');
      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
    }
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (code && state) {
      // Verify state matches stored state
      const storedState = sessionStorage.getItem('pn_oauth_state');
      if (state !== storedState) {
        console.error('OAuth state mismatch');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      // Exchange code for tokens
      (async () => {
        try {
          const tokenResponse = await PNOAuthService.exchangeCodeForToken(code);
          const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);
          
          // Create session
          const session = {
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
            did: userInfo.did,
            pnName: userInfo.pn_name
          };
          
          PNOAuthService.saveSession(session);
          setUnlocked(userInfo.did);
          
          // Clean up URL
          window.history.replaceState({}, '', window.location.pathname);
        } catch (err) {
          console.error('OAuth callback error:', err);
        }
      })();
    }
  }, []);

  // Initialize from URL params
  useEffect(() => {
    const fileParam = getParam('file');
    const feedParam = getParam('feed');
    const creatorParam = getParam('creator');
    const viewParam = getParam('view') as 'feed' | 'index' | null;

    // Always default to feed mode (wireframe requirement - feed is the main view)
    setViewMode('feed');
    // Remove view param from URL if it exists
    if (viewParam) {
      setParam('view', null);
    }

    // Set feed - default to 'public' if no feed param
    setActiveFeedId(feedParam || 'public');

    if (creatorParam) {
      setViewingCreatorId(creatorParam);
    }

    if (fileParam && indexedFiles.length > 0) {
      const file = indexedFiles.find(f => f.metadata.fileId === fileParam);
      if (file) {
        setViewMode('feed');
        setTimeout(() => {
          const element = document.querySelector(`[data-file-id="${fileParam}"]`);
          if (element && feedScrollRef.current) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      }
    }
  }, [getParam, indexedFiles.length]); // Only run when files are loaded

  // Update URL when state changes
  useEffect(() => {
    if (viewingCreatorId) {
      setParam('creator', viewingCreatorId);
    } else {
      setParam('creator', null);
    }
  }, [viewingCreatorId, setParam]);

  useEffect(() => {
    if (viewingBrandedFeed) {
      setParam('feed', viewingBrandedFeed.feedId);
    } else if (activeFeedId !== 'public') {
      setParam('feed', activeFeedId);
    } else {
      setParam('feed', null);
    }
  }, [viewingBrandedFeed, activeFeedId, setParam]);

  useEffect(() => {
    setParam('view', viewMode);
  }, [viewMode, setParam]);

  // Mark feed as viewed when switching to it
  useEffect(() => {
    if (activeFeedId && activeFeedId !== 'new') {
      setFeedViewedTimestamps(prev => markFeedAsViewed(activeFeedId, prev));
    }
  }, [activeFeedId]);

  // Check for new third-party content
  const hasNewThirdPartyContent = useMemo(() => {
    // TODO: Filter for third-party content and check if it's new
    // For now, return false - will be implemented when third-party API is ready
    return false;
  }, [indexedFiles, feedViewedTimestamps]);

  // Memoize filtered files by active feed
  const filteredFilesByFeed = useMemo(() => {
    // For 'public' and 'discover', show all files
    if (activeFeedId === 'public' || activeFeedId === 'discover') {
      console.log('🔍 Filtering for public/discover feed:', {
        activeFeedId,
        indexedFilesCount: indexedFiles.length,
        filteredCount: indexedFiles.length
      });
      return indexedFiles;
    }
    // For niche feeds (arts, sports, music), filter by tags/keywords or show all if no matches
    if (['arts', 'sports', 'music'].includes(activeFeedId.toLowerCase())) {
      const tag = activeFeedId.toLowerCase();
      const filtered = indexedFiles.filter(file => {
        const tags = file.metadata.tags || file.metadata.keywords || [];
        return tags.some(t => t.toLowerCase().includes(tag));
      });
      // If no matches, show all files (feed is empty/new)
      return filtered.length > 0 ? filtered : indexedFiles;
    }
    // For specific feeds, filter by feedId
    return indexedFiles.filter(file => 
      file.metadata.feedId === activeFeedId || 
      file.metadata.feeds?.some(feed => feed.feedId === activeFeedId) ||
      file.metadata.feedIds?.includes(activeFeedId)
    );
  }, [indexedFiles, activeFeedId]);

  // Navigation handlers (memoized)
  const handleNextPost = useCallback(() => {
    if (!feedScrollRef.current) return;
    const currentScroll = feedScrollRef.current.scrollTop;
    const viewportHeight = feedScrollRef.current.clientHeight;
    feedScrollRef.current.scrollTo({
      top: currentScroll + viewportHeight,
      behavior: 'smooth'
    });
  }, []);

  const handlePreviousPost = useCallback(() => {
    if (!feedScrollRef.current) return;
    const currentScroll = feedScrollRef.current.scrollTop;
    const viewportHeight = feedScrollRef.current.clientHeight;
    feedScrollRef.current.scrollTo({
      top: currentScroll - viewportHeight,
      behavior: 'smooth'
    });
  }, []);

  const handleNextFeed = useCallback(() => {
    const feedRailItems = buildFeedRailItems(
      feeds,
      userState.preferences.subscribedFeedIds,
      activeFeedId,
      false
    );
    const currentIndex = feedRailItems.findIndex(item => item.feedId === activeFeedId);
    if (currentIndex < feedRailItems.length - 1) {
      setActiveFeedId(feedRailItems[currentIndex + 1].feedId);
    }
  }, [feeds, userState.preferences.subscribedFeedIds, activeFeedId]);

  const handlePreviousFeed = useCallback(() => {
    const feedRailItems = buildFeedRailItems(
      feeds,
      userState.preferences.subscribedFeedIds,
      activeFeedId,
      false
    );
    const currentIndex = feedRailItems.findIndex(item => item.feedId === activeFeedId);
    if (currentIndex > 0) {
      setActiveFeedId(feedRailItems[currentIndex - 1].feedId);
    }
  }, [feeds, userState.preferences.subscribedFeedIds, activeFeedId]);

  const handleTogglePlayPause = useCallback(() => {
    if (!visibleFileId) return;
    const videoElement = videoRefs.current.get(visibleFileId);
    if (videoElement) {
      if (videoElement.paused) {
        videoElement.play();
      } else {
        videoElement.pause();
      }
    }
  }, [visibleFileId]);

  // Keyboard navigation
  useKeyboardNavigation({
    onNextFeed: viewMode === 'feed' ? handleNextFeed : undefined,
    onPreviousFeed: viewMode === 'feed' ? handlePreviousFeed : undefined,
    onNextPost: viewMode === 'feed' ? handleNextPost : undefined,
    onPreviousPost: viewMode === 'feed' ? handlePreviousPost : undefined,
    onTogglePlayPause: viewMode === 'feed' ? handleTogglePlayPause : undefined,
    onOpenSettings: () => setShowSettings(true),
    onOpenFeedBrowser: () => setShowFeedBrowser(true),
    enabled: !showFeedBrowser && !showSettings && !showShortcuts && !viewingCreatorId
  });

  // Show shortcuts on ? key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !showFeedBrowser && !showSettings && !viewingCreatorId) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          setShowShortcuts(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFeedBrowser, showSettings, viewingCreatorId]);

  // Swipe gestures for mobile
  const swipeRef = useSwipeGesture({
    onSwipeUp: viewMode === 'feed' ? handleNextPost : undefined,
    onSwipeDown: viewMode === 'feed' ? handlePreviousPost : undefined,
    onSwipeLeft: viewMode === 'feed' ? handleNextFeed : undefined,
    onSwipeRight: viewMode === 'feed' ? handlePreviousFeed : undefined,
    enabled: viewMode === 'feed' && !showFeedBrowser && !showSettings && !showShortcuts && !viewingCreatorId
  });

  // Load more files for infinite scroll - MUST be defined before useInfiniteScroll
  const handleLoadMore = useCallback(async () => {
    if (!isLoading && hasMore && discoverFilesRef.current) {
      await discoverFilesRef.current(undefined, false, true);
    }
  }, [isLoading, hasMore]);

  // Pull to refresh handler - MUST be defined before usePullToRefresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (discoverFilesRef.current) {
      await discoverFilesRef.current(undefined, true, false);
    }
  }, []);

  // Infinite scroll for feed mode
  const infiniteScrollRef = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    enabled: viewMode === 'feed' && hasMore && !isLoading,
    hasMore,
    loading: isLoading
  });

  // Pull to refresh for feed mode
  const pullToRefreshRef = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: viewMode === 'feed' && !isRefreshing
  });

  // Intersection Observer for auto-playing videos in feed mode
  useEffect(() => {
    if (viewMode !== 'feed') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const fileId = entry.target.getAttribute('data-file-id');
          if (!fileId) return;

          const videoElement = videoRefs.current.get(fileId);
          const indexedFile = indexedFiles.find(f => f.metadata.fileId === fileId);
          if (!indexedFile) return;

          const file = indexedFile.metadata;
          const isVideo = file.fileType === 'video' || 
                         (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            // Item is in view - play video if it's a video
            setVisibleFileId(fileId);
            
            if (isVideo && videoElement && videoBlobs.has(fileId)) {
              videoElement.play().catch(err => {
                console.warn('Failed to auto-play video:', err);
              });
              setVideoPlaying(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, true);
                return newMap;
              });
            }
          } else {
            // Item is out of view - pause video
            if (visibleFileId === fileId) {
              setVisibleFileId(null);
            }
            if (videoElement) {
              videoElement.pause();
              setVideoPlaying(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, false);
                return newMap;
              });
            }
          }
        });
      },
      {
        threshold: [0, 0.5, 1], // Trigger at 0%, 50%, and 100% visibility
        rootMargin: '0px' // Use viewport as root
      }
    );

    // Observe all file items in feed mode
    const fileElements = document.querySelectorAll('[data-file-id]');
    fileElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [viewMode, indexedFiles, videoBlobs, visibleFileId]);

  const discoverFiles = useCallback(async (searchFilters?: MetadataFilters, forceRefresh: boolean = false, append: boolean = false) => {
    try {
      if (!append) {
        setIsLoading(true);
      }
      setError(null);
      
      // No Google Drive connection needed - just query central aggregator API
      await metadataIndexService.initialize();
      
      // Build filters with rating preferences and feed filtering
      const finalFilters: MetadataFilters = {
        ...filters,
        ...searchFilters,
        ...(searchQuery ? { tags: searchQuery.split(',').map(t => t.trim()).filter(Boolean) } : {}),
        // Apply user's rating preferences
        maxRating: userState.preferences.maxRating,
        // Filter by active feed
        ...(activeFeedId === 'public' ? {} : { feedId: activeFeedId }),
        // Pagination
        ...(append && indexedFiles.length > 0 ? { offset: indexedFiles.length } : {})
      };
      
      // Discover public files from all users (with optional force refresh)
      const discoveredFiles = await metadataIndexService.discoverFiles(finalFilters, forceRefresh);
      
      console.log(`🔍 API returned ${discoveredFiles.length} files, filters:`, finalFilters);
      console.log(`🔍 Active feed ID: ${activeFeedId}`);
      
      if (append) {
        setIndexedFiles(prev => [...prev, ...discoveredFiles]);
      } else {
        setIndexedFiles(discoveredFiles);
      }
      
      // Check if there are more files to load
      setHasMore(discoveredFiles.length >= 50); // Assuming 50 is page size
      
      console.log(`✅ Discovered ${discoveredFiles.length} public files${append ? ' (appended)' : ''}`);
      
      // Thumbnail generation will be handled by a separate useEffect to avoid circular dependencies
      
      // Pre-load video and image blobs for feed mode (if in feed mode) - full resolution
      const currentViewMode = viewMode || 'feed';
      if (currentViewMode === 'feed') {
        for (const indexedFile of discoveredFiles) {
          const file = indexedFile.metadata;
          const isVideo = file.fileType === 'video' || 
                         (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
          const isImage = file.fileType === 'image' || 
                         (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
          
          // Pre-load videos
          if (isVideo && file.publicToken && !videoBlobs.has(file.fileId)) {
            (async () => {
              try {
                let token: ShareToken;
                try {
                  token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
                } catch (e) {
                  return;
                }
                const decryptedBlob = await decryptWithToken(token);
                const videoUrl = URL.createObjectURL(decryptedBlob);
                setVideoBlobs(prev => {
                  const newMap = new Map(prev);
                  newMap.set(file.fileId, videoUrl);
                  return newMap;
                });
              } catch (err) {
                console.warn('Failed to pre-load video for feed:', err);
              }
            })();
          }
          
          // Pre-load full-resolution images
          if (isImage && file.publicToken && !imageBlobs.has(file.fileId)) {
            (async () => {
              try {
                let token: ShareToken;
                try {
                  token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
                } catch (e) {
                  return;
                }
                const decryptedBlob = await decryptWithToken(token);
                const imageUrl = URL.createObjectURL(decryptedBlob);
                setImageBlobs(prev => {
                  const newMap = new Map(prev);
                  newMap.set(file.fileId, imageUrl);
                  return newMap;
                });
              } catch (err) {
                console.warn('Failed to pre-load image for feed:', err);
              }
            })();
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to discover files';
      setError(errorMessage);
      console.error('Failed to discover files:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filters, searchQuery, activeFeedId, userState.preferences.maxRating, indexedFiles.length, viewMode, videoBlobs, imageBlobs]);

  // Set ref using useLayoutEffect to ensure it's set before any effects run
  useLayoutEffect(() => {
    discoverFilesRef.current = discoverFiles;
  }, [discoverFiles]);

  // Generate thumbnails when files are loaded (separate from discoverFiles to avoid circular deps)
  useEffect(() => {
    if (indexedFiles.length > 0 && generateThumbnailsRef.current) {
      generateThumbnailsRef.current(indexedFiles);
    }
  }, [indexedFiles.length]); // Only regenerate when count changes - use ref to avoid dependency

  // Initial file discovery - must be after discoverFiles is defined
  useEffect(() => {
    if (discoverFilesRef.current) {
      discoverFilesRef.current();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh metadata when Google Drive token becomes available
  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem('google_drive_token');
      if (token && discoverFilesRef.current) {
        console.log('✅ Google Drive token found - will scan pN folders');
        discoverFilesRef.current();
      }
    };

    // Check after a delay to ensure ref is set
    const timer = setTimeout(() => {
      checkToken();
    }, 100);

    // Also listen for storage events (in case token is set in another tab/window)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'google_drive_token' && e.newValue && discoverFilesRef.current) {
        console.log('✅ Google Drive token updated - refreshing metadata');
        discoverFilesRef.current();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-discover files when active feed or rating preferences change
  useEffect(() => {
    if (discoverFilesRef.current) {
      discoverFilesRef.current();
    }
  }, [activeFeedId, userState.preferences.maxRating]); // eslint-disable-line react-hooks/exhaustive-deps


  const handleSearch = useCallback(() => {
    if (discoverFilesRef.current) {
      discoverFilesRef.current();
    }
  }, []);

  const handleFilterChange = useCallback((key: keyof MetadataFilters, value: any) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined
    };
    setFilters(newFilters);
    if (discoverFilesRef.current) {
      discoverFilesRef.current(newFilters);
    }
  }, [filters, setFilters]);

  // Show branded feed page if viewing a paid-tier feed
  if (viewingBrandedFeed) {
    const feedFiles = indexedFiles.filter(file => 
      file.metadata.feedIds?.includes(viewingBrandedFeed.feedId)
    );
    
    return (
      <BrandedFeedPage
        feed={viewingBrandedFeed}
        files={feedFiles}
        onBack={() => setViewingBrandedFeed(null)}
        onFileClick={(file) => {
          // Switch to feed mode and scroll to file
          setViewMode('feed');
          setViewingBrandedFeed(null);
          setTimeout(() => {
            const element = document.querySelector(`[data-file-id="${file.metadata.fileId}"]`);
            if (element && feedScrollRef.current) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
        }}
      />
    );
  }

  // Show creator index if viewing a creator
  if (viewingCreatorId) {
    const creatorFiles = indexedFiles.filter(f => {
      const did = f.metadata.creator?.identifier?.value || 
                 f.metadata.creator?.["@id"] || 
                 f.metadata.author?.did;
      return did === viewingCreatorId;
    });
    
    return (
      <CreatorIndex
        creatorId={viewingCreatorId}
        creatorName={
          creatorFiles[0]?.metadata.creator?.identifier?.value || 
          viewingCreatorId
        }
        files={creatorFiles}
        onFileClick={(file) => {
          // TODO: Open file viewer
        }}
        onBack={() => setViewingCreatorId(null)}
      />
    );
  }

  // Build feed rail items - Always show DISCOVER, PUBLIC, ARTS, SPORTS, MUSIC (TikTok style)
  const feedRailItems = buildFeedRailItems(
    feeds,
    userState.isUnlocked ? userState.preferences.subscribedFeedIds : [],
    activeFeedId,
    hasNewThirdPartyContent
  );
  
  // Debug: Log feed rail items
  console.log('Feed rail items:', feedRailItems.map(f => f.name));

  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleLockUnlock = async () => {
    if (userState.isUnlocked) {
      // Lock the user
      setLocked();
      // Clear OAuth session
      PNOAuthService.clearSession();
    } else {
      // Unlock - redirect to OAuth authorization page (external HTML page)
      try {
        let authUrl = await PNOAuthService.getAuthorizationUrlAsync();
        console.log('Opening OAuth popup, original URL:', authUrl);
        
        // Add popup parameter to URL so oauth-authorize.html knows it's in a popup
        // Need to add it to the API endpoint URL before it redirects
        try {
          const url = new URL(authUrl);
          url.searchParams.set('popup', 'true');
          authUrl = url.toString();
          console.log('Opening OAuth popup, URL with popup param:', authUrl);
        } catch (e) {
          console.error('Failed to add popup parameter:', e);
        }
        
        // Open in popup window (like Google OAuth)
        const popup = window.open(
          authUrl,
          'pn-oauth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );
        
        if (!popup) {
          console.error('Popup blocked!');
          showErrorToast('Popup blocked. Please allow popups for this site.');
          return;
        }
        
        // Handle OAuth callback - listen for both postMessage and localStorage events
        const handleOAuthCallback = (data: { code?: string; state?: string; error?: string; error_description?: string }) => {
          console.log('OAuth callback received:', data);
          
          if (data.code) {
            // Handle OAuth callback
            (async () => {
              try {
                const tokenResponse = await PNOAuthService.exchangeCodeForToken(data.code!);
                const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);
                
                const session = {
                  accessToken: tokenResponse.access_token,
                  refreshToken: tokenResponse.refresh_token,
                  expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                  did: userInfo.did,
                  pnName: userInfo.pn_name
                };
                
                PNOAuthService.saveSession(session);
                setUnlocked(userInfo.did);
                
                // Refresh feed if needed
                if (discoverFilesRef.current) {
                  discoverFilesRef.current(undefined, true);
                }
                
                console.log('OAuth success! User unlocked.');
              } catch (err) {
                console.error('OAuth callback error:', err);
                showErrorToast('Authentication failed. Please try again.');
              }
            })();
          } else if (data.error) {
            console.error('OAuth error:', data.error);
            showErrorToast(data.error_description || 'Authentication denied');
          }
          
          // FORCE CLOSE POPUP - main window must close it (popup can't close itself after navigation)
          if (popup && !popup.closed) {
            console.log('Main window FORCING popup close...');
            try {
              // Multiple aggressive close attempts
              popup.close();
              setTimeout(() => { if (popup && !popup.closed) { popup.close(); } }, 10);
              setTimeout(() => { if (popup && !popup.closed) { popup.close(); } }, 50);
              setTimeout(() => { if (popup && !popup.closed) { popup.close(); } }, 100);
              setTimeout(() => { if (popup && !popup.closed) { popup.close(); } }, 200);
              setTimeout(() => { if (popup && !popup.closed) { 
                console.error('Popup still open after all attempts - browser may be blocking close');
                // Last resort: try to focus main window
                window.focus();
              }}, 500);
            } catch (e) {
              console.error('Failed to close popup:', e);
            }
          }
          
          // Clean up listeners
          window.removeEventListener('message', messageListener);
          window.removeEventListener('storage', storageListener);
        };
        
        // Listen for postMessage
        const messageListener = (event: MessageEvent) => {
          console.log('Message received:', event.origin, event.data);
          
          if (event.origin !== window.location.origin) {
            console.log('Origin mismatch:', event.origin, 'vs', window.location.origin);
            return;
          }
          
          if (event.data && event.data.type === 'oauth_callback') {
            handleOAuthCallback(event.data);
          }
        };
        
        // Listen for localStorage events (works even if window.opener is lost)
        const storageListener = (event: StorageEvent) => {
          if (event.key === 'pn_oauth_callback' && event.newValue) {
            try {
              const data = JSON.parse(event.newValue);
              if (data.type === 'oauth_callback') {
                console.log('OAuth callback received via localStorage:', data);
                handleOAuthCallback(data);
                // Clear the storage item
                localStorage.removeItem('pn_oauth_callback');
              }
            } catch (e) {
              console.error('Failed to parse OAuth callback from localStorage:', e);
            }
          }
        };
        
        window.addEventListener('message', messageListener);
        window.addEventListener('storage', storageListener);
        
        // Clean up polling when popup closes
        const checkPopupInterval = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopupInterval);
            clearInterval(pollInterval);
            window.removeEventListener('message', messageListener);
            window.removeEventListener('storage', storageListener);
            console.log('Popup closed by user');
          }
        }, 500);
        
        // Poll localStorage aggressively - check for pending flag and latest key
        const pollInterval = setInterval(() => {
          const pending = localStorage.getItem('pn_oauth_pending');
          if (pending === 'true') {
            const latestKey = localStorage.getItem('pn_oauth_latest_key');
            if (latestKey) {
              const stored = localStorage.getItem(latestKey);
              if (stored) {
                try {
                  const data = JSON.parse(stored);
                  // Only process if recent (within last 10 seconds)
                  if (data.timestamp && Date.now() - data.timestamp < 10000) {
                    console.log('OAuth callback found via polling:', data);
                    clearInterval(pollInterval);
                    clearInterval(checkPopupInterval);
                    
                    // Clear the flags
                    localStorage.removeItem('pn_oauth_pending');
                    localStorage.removeItem('pn_oauth_latest_key');
                    localStorage.removeItem(latestKey);
                    
                    handleOAuthCallback(data);
                    
                    // FORCE CLOSE POPUP - try multiple times
                    if (popup && !popup.closed) {
                      console.log('FORCING POPUP CLOSE NOW');
                      for (let i = 0; i < 10; i++) {
                        setTimeout(() => {
                          if (popup && !popup.closed) {
                            try {
                              popup.close();
                            } catch (e) {
                              console.error('Close attempt failed:', e);
                            }
                          }
                        }, i * 50);
                      }
                    }
                  }
                } catch (e) {
                  console.error('Failed to parse OAuth callback:', e);
                }
              }
            }
          }
        }, 50); // Poll every 50ms for fastest detection
      } catch (err) {
        console.error('OAuth redirect error:', err);
        showErrorToast('Failed to open authentication window');
      }
    }
  };

  return (
    <div className="min-h-screen bg-black h-screen overflow-hidden">
      {/* Lock/Unlock Button - Top right corner, always visible */}
      <button
        onClick={handleLockUnlock}
        className="fixed top-3 right-3 z-[110] w-10 h-10 flex items-center justify-center text-white/85 hover:text-white transition-colors pointer-events-auto"
        title={userState.isUnlocked ? 'Lock pN' : 'Unlock pN'}
      >
        {userState.isUnlocked ? (
          <Unlock className="h-5 w-5" />
        ) : (
          <Lock className="h-5 w-5" />
        )}
      </button>

      {/* Top Navigation Bar - TikTok Style: Text-only overlay, ONLY on home/feed screen */}
      {viewMode === 'feed' && (
        <div 
          className="fixed top-0 left-0 right-0 h-12 flex items-center justify-center z-[100] pointer-events-none bg-transparent"
          style={{ background: 'transparent' }}
        >
          {/* Feed Rail - Scrollable horizontally, centers active feed (TikTok style) */}
          <FeedRail
            feeds={feedRailItems}
            activeFeedId={activeFeedId}
            onFeedSelect={setActiveFeedId}
            onBrowseFeeds={undefined}
          />
        </div>
      )}

      {/* Main Content Area - Full screen feed, edge-to-edge (bars overlay) */}
      <div className={`h-full flex flex-col ${viewMode === 'feed' ? 'pb-16' : 'pb-16'}`}>
        {/* Feed Content - Full screen vertical scroll */}
        {/* Error Display */}
        {error && (
          <ErrorDisplay
            error={error}
            onRetry={() => {
              if (discoverFilesRef.current) {
                discoverFilesRef.current(undefined, true);
              }
            }}
            onDismiss={() => setError(null)}
            className="mb-6"
          />
        )}

        {/* Stats and Actions - Search-results style (Phase 3 requirement) */}
        {viewMode === 'index' && (
        <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-sm">Public Files Discovered</p>
              <p className="text-white text-2xl font-bold">{indexedFiles.length}</p>
            </div>
            <div className="flex items-center space-x-4">
              {(
                <>
                  <button
                    onClick={() => {
                      if (discoverFilesRef.current) {
                        discoverFilesRef.current(undefined, true);
                      }
                    }}
                    disabled={isLoading}
                    className="px-4 py-2 bg-neutral-700 text-white text-sm font-medium rounded-lg hover:bg-neutral-600 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  {userState.isUnlocked && userState.pnIdentifier && (
                    <>
                      <NotificationBell
                        onNotificationClick={(notification) => {
                          if (notification.data?.file_id) {
                            setViewMode('feed');
                            setTimeout(() => {
                              const element = document.querySelector(`[data-file-id="${notification.data.file_id}"]`);
                              if (element && feedScrollRef.current) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }, 100);
                          } else if (notification.data?.feed_id) {
                            const feed = feeds.find(f => f.feedId === notification.data.feed_id);
                            if (feed) {
                              setViewingBrandedFeed(feed);
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => setShowCreateFeedModal(true)}
                        className="p-2 text-text-secondary hover:text-white transition-colors"
                        title="Create Feed"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="p-2 text-text-secondary hover:text-white transition-colors"
                        title="Upload File"
                      >
                        <Upload className="h-5 w-5" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowSettings(true)}
                    className="p-2 text-text-secondary hover:text-white transition-colors"
                    title="Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        )}

        
        {isLoading ? (
          <LoadingSkeleton type="feed" count={3} />
        ) : indexedFiles.length === 0 ? (
          <EmptyState
            type="no-content"
            message={
              typeof window !== 'undefined' && localStorage.getItem('google_drive_token')
                ? 'No files have been marked as public yet. Mark files as public in the dashboard to see them here.'
                : 'Connect Google Drive in the dashboard to scan for public files'
            }
          />
        ) : (
          // Full-screen TikTok-style feed view
          <div 
            ref={(el) => {
              feedScrollRef.current = el;
              if (swipeRef && 'current' in swipeRef) {
                (swipeRef as React.MutableRefObject<HTMLElement | null>).current = el;
              }
              if (infiniteScrollRef) {
                (infiniteScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }
              if (pullToRefreshRef) {
                (pullToRefreshRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }
            }}
            className="flex-1 overflow-y-scroll snap-y snap-mandatory h-screen"
          >
            {filteredFilesByFeed.map((indexedFile) => {
              const file = indexedFile.metadata;
              const isVideo = file.fileType === 'video' || 
                             (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
              const isImage = file.fileType === 'image' || 
                             (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
              const fileName = file.name || file.title || 'Untitled';

              return (
                <div
                  key={file.fileId}
                  data-file-id={file.fileId}
                  className="h-screen w-full snap-start relative bg-black feed-item overflow-hidden"
                >
                  {/* Full-screen video - Edge-to-edge, fill entire viewport (Wireframe) */}
                  {isVideo && videoBlobs.get(file.fileId) && (
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current.set(file.fileId, el);
                      }}
                      src={videoBlobs.get(file.fileId)!}
                      className="absolute top-0 left-0 w-full h-full object-cover"
                      controls
                      muted
                      loop
                      playsInline
                    />
                  )}
                  
                  {/* Full-screen image - Edge-to-edge, fill entire viewport (Wireframe) - Full resolution */}
                  {isImage && imageBlobs.get(file.fileId) && (
                    <img
                      src={imageBlobs.get(file.fileId)!}
                      alt={fileName}
                      className="absolute top-0 left-0 w-full h-full object-cover"
                    />
                  )}

                  {/* Loading state for images/videos */}
                  {((isImage || isVideo) && !imageBlobs.get(file.fileId) && !videoBlobs.get(file.fileId)) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 bg-black">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2"></div>
                      <span className="text-xs">Loading...</span>
                    </div>
                  )}

                  {/* Non-image/video file */}
                  {!isImage && !isVideo && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 bg-black">
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
                          likes: getLikeCount(file.fileId, indexedFile.metadata.engagement?.likes || 0),
                          comments: getComments(file.fileId).length + (indexedFile.metadata.engagement?.comments || 0),
                          shares: getShareCount(file.fileId, indexedFile.metadata.engagement?.shares || 0)
                        }
                      }
                    }}
                    isLiked={isLiked(file.fileId)}
                    onLike={() => {
                      // Phase 3: Call-to-connect overlay for non-connected users
                      if (!userState.isUnlocked) {
                        showErrorToast('Connect your par Noir identity to like content');
                        return;
                      }
                      const wasLiked = isLiked(file.fileId);
                      toggleLike(file.fileId);
                      if (!wasLiked) {
                        success('Liked!');
                      }
                    }}
                    onComment={() => {
                      // Phase 3: Call-to-connect overlay for non-connected users
                      if (!userState.isUnlocked) {
                        showErrorToast('Connect your par Noir identity to comment');
                        return;
                      }
                      setCommentingFile(indexedFile);
                    }}
                    onShare={async () => {
                      share(file.fileId);
                      // Copy share link to clipboard with deep link
                      const shareUrl = `${window.location.origin}${window.location.pathname}?file=${file.fileId}&view=feed`;
                      try {
                        await navigator.clipboard.writeText(shareUrl);
                        success('Link copied to clipboard!');
                        setParam('file', file.fileId);
                      } catch (err) {
                        showErrorToast('Failed to copy link. Please try again.');
                      }
                    }}
                    onAddToFeed={() => {
                      // Check if user owns this file
                      const creatorId = file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did;
                      if (userState.isUnlocked && userState.pnIdentifier === creatorId) {
                        setAddingToFeedFile(indexedFile);
                      }
                    }}
                    isOwner={userState.isUnlocked && userState.pnIdentifier === (file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did)}
                  />

                  {/* User Info & Caption - Bottom Left (Wireframe) */}
                  <div className="absolute bottom-20 left-0 right-20 z-20 p-4">
                    <div className="flex items-start space-x-3 mb-2">
                      {/* User Icon */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const creatorId = file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did;
                          if (creatorId) {
                            setViewingCreatorId(creatorId);
                          }
                        }}
                        className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity"
                      >
                        <User className="h-5 w-5 text-blue-400" />
                      </button>
                      
                      {/* User Name & Follow */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const creatorId = file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did;
                              if (creatorId) {
                                setViewingCreatorId(creatorId);
                              }
                            }}
                            className="text-white font-semibold text-sm hover:text-blue-400 transition-colors"
                          >
                            {file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did || 'Unknown'}
                          </button>
                          {userState.isUnlocked && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Implement follow functionality
                                success('Follow feature coming soon');
                              }}
                              className="px-3 py-1 bg-white text-black text-xs font-semibold rounded hover:bg-gray-200 transition-colors"
                            >
                              FOLLOW
                            </button>
                          )}
                        </div>
                        
                        {/* Caption */}
                        {file.description && (
                          <p className="text-white text-sm font-medium line-clamp-2">{file.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Navigation Bar - Static on ALL screens: HOME, SEARCH, UPLOAD, INDEX, INBOX (5 buttons evenly spaced) */}
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 h-16 flex items-center justify-around z-[100]">
          <button
            onClick={() => {
              setViewMode('feed');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              viewMode === 'feed' ? 'text-blue-400' : 'text-white'
            }`}
            title="Home"
          >
            <Home className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">HOME</span>
          </button>
          <button
            onClick={() => setViewMode('index')}
            className={`flex flex-col items-center justify-center h-full transition-colors ${
              viewMode === 'index' ? 'text-blue-400' : 'text-white'
            }`}
            title="Search"
          >
            <Search className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">SEARCH</span>
          </button>
          <button
            onClick={() => {
              if (userState.isUnlocked && userState.pnIdentifier) {
                setShowUploadModal(true);
              } else {
                showErrorToast('Connect your par Noir identity to upload');
              }
            }}
            className="flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors"
            title="Upload"
          >
            <Upload className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">UPLOAD</span>
          </button>
          <button
            onClick={() => {
              // TODO: Implement index/browse view
              showErrorToast('Index feature coming soon');
            }}
            className="flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors"
            title="Index"
          >
            <Grid className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">INDEX</span>
          </button>
          <button
            onClick={() => {
              // TODO: Implement inbox/messages view
              showErrorToast('Inbox feature coming soon');
            }}
            className="flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors"
            title="Inbox"
          >
            <MessageCircle className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">INBOX</span>
          </button>
        </div>

        {/* Search/Index View - Only show when viewMode is 'index' */}
        {viewMode === 'index' && (
          // Search-results style index page (Phase 3 requirement: Replace grid view with search-results style)
          <div className="space-y-4">
            {filteredFilesByFeed.map((indexedFile) => {
              const file = indexedFile.metadata;
              const isImage = file.fileType === 'image' || 
                             (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
              const isVideo = file.fileType === 'video' || 
                             (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
              const fileName = file.name || file.title || 'Untitled';
              
              return (
                <div
                  key={file.fileId}
                  className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 hover:bg-neutral-800 transition-colors cursor-pointer"
                  onClick={() => {
                    // Switch to feed mode and scroll to this post
                    setViewMode('feed');
                    setTimeout(() => {
                      const element = document.querySelector(`[data-file-id="${file.fileId}"]`);
                      if (element && feedScrollRef.current) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 100);
                  }}
                >
                  <div className="flex items-start space-x-4">
                    {/* Thumbnail */}
                    {(isImage || isVideo) && (
                      <div className="w-32 h-32 bg-neutral-800 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {thumbnails.get(file.fileId) ? (
                          <img 
                            src={thumbnails.get(file.fileId)!} 
                            alt={fileName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-neutral-500" />
                        )}
                      </div>
                    )}
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header with rating */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium text-lg hover:text-blue-400 transition-colors">
                            {fileName}
                          </h3>
                          <p className="text-text-secondary text-xs mt-1">
                            {isVideo ? 'Video' : file.fileType === 'image' ? 'Image' : file.fileType || 'File'} • {new Date(file.uploadDate).toLocaleDateString()}
                          </p>
                        </div>
                        {file.contentRating && (
                          <ContentRatingBadge rating={file.contentRating} size="sm" className="ml-2 flex-shrink-0" />
                        )}
                      </div>

                      {file.description && (
                        <p className="text-text-secondary text-sm mb-2 line-clamp-2">{file.description}</p>
                      )}

                      {/* Creator */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const creatorId = file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did;
                          if (creatorId) {
                            setViewingCreatorId(creatorId);
                          }
                        }}
                        className="flex items-center space-x-2 text-xs text-text-secondary mb-2 hover:text-blue-400 transition-colors w-full text-left"
                      >
                        <User className="h-3 w-3" />
                        <span className="truncate">
                          {file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did || 'Unknown'}
                        </span>
                      </button>

                      {/* Tags */}
                      {(file.keywords || file.tags) && (file.keywords || file.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(file.keywords || file.tags || []).slice(0, 5).map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                    {/* Engagement Actions */}
                    <div 
                      className="pt-3 border-t border-neutral-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EngagementActions
                        file={{
                          ...indexedFile,
                          metadata: {
                            ...indexedFile.metadata,
                            engagement: {
                              ...indexedFile.metadata.engagement,
                              likes: getLikeCount(file.fileId, indexedFile.metadata.engagement?.likes || 0),
                              comments: getComments(file.fileId).length + (indexedFile.metadata.engagement?.comments || 0),
                              shares: getShareCount(file.fileId, indexedFile.metadata.engagement?.shares || 0)
                            }
                          }
                        }}
                        compact
                        onLike={() => {
                          // Phase 3: Call-to-connect overlay for non-connected users
                          if (!userState.isUnlocked) {
                            showErrorToast('Connect your par Noir identity to like content');
                            return;
                          }
                          const wasLiked = isLiked(file.fileId);
                          toggleLike(file.fileId);
                          if (!wasLiked) {
                            success('Liked!');
                          }
                        }}
                        onComment={() => {
                          // Phase 3: Call-to-connect overlay for non-connected users
                          if (!userState.isUnlocked) {
                            showErrorToast('Connect your par Noir identity to comment');
                            return;
                          }
                          setCommentingFile(indexedFile);
                        }}
                        onShare={async () => {
                          share(file.fileId);
                          const shareUrl = `${window.location.origin}${window.location.pathname}?file=${file.fileId}&view=feed`;
                          try {
                            await navigator.clipboard.writeText(shareUrl);
                            success('Link copied to clipboard!');
                            setParam('file', file.fileId);
                          } catch (err) {
                            error('Failed to copy link. Please try again.');
                          }
                        }}
                        onAddToFeed={() => {
                          const creatorId = file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did;
                          if (userState.isUnlocked && userState.pnIdentifier === creatorId) {
                            setAddingToFeedFile(indexedFile);
                          }
                        }}
                        isOwner={userState.isUnlocked && userState.pnIdentifier === (file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did)}
                      />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}



        {/* Modal Orchestrator */}
        <ModalOrchestrator
          viewingFile={viewingFile}
          showFeedBrowser={false}
          showCreateFeedModal={showCreateFeedModal}
          addingToFeedFile={addingToFeedFile}
          showSettings={showSettings}
          showShortcuts={showShortcuts}
          showWelcome={showWelcome}
          commentingFile={commentingFile}
          showUploadModal={showUploadModal}
          feeds={feeds}
          onCloseViewingFile={() => {
            if (viewingFile?.url) URL.revokeObjectURL(viewingFile.url);
            setViewingFile(null);
          }}
          onCloseFeedBrowser={() => {}}
          onFeedClick={(feed) => {
            setShowFeedBrowser(false);
            setViewingBrandedFeed(feed);
          }}
          onCreateFeedClick={() => {
            setShowFeedBrowser(false);
            setShowCreateFeedModal(true);
          }}
          onFeedCreated={(feed) => {
            handleFeedCreated(feed);
            setShowCreateFeedModal(false);
          }}
          onCloseCreateFeedModal={() => setShowCreateFeedModal(false)}
          onCloseAddToFeed={() => setAddingToFeedFile(null)}
          onAddedToFeed={(feedId) => {
            if (discoverFilesRef.current) {
              discoverFilesRef.current(undefined, true);
            }
            setAddingToFeedFile(null);
          }}
          onCloseSettings={() => setShowSettings(false)}
          onCloseShortcuts={() => setShowShortcuts(false)}
          onCloseWelcome={() => {
            setShowWelcome(false);
            try {
              localStorage.setItem('pn_welcome_completed', 'true');
            } catch (e) {
              console.warn('Failed to save welcome completion:', e);
            }
          }}
          onCompleteWelcome={() => {
            try {
              localStorage.setItem('pn_welcome_completed', 'true');
            } catch (e) {
              console.warn('Failed to save welcome completion:', e);
            }
          }}
          onCloseComment={() => setCommentingFile(null)}
          onCloseUpload={() => setShowUploadModal(false)}
          onUploadComplete={() => {
            if (discoverFilesRef.current) {
              discoverFilesRef.current(undefined, true);
            }
          }}
        />

        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onClose={removeToast} />

      </div>
    </div>
  );
}

export default App;

