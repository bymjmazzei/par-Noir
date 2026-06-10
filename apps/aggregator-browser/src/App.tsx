/**
 * Aggregator Browser
 * Licensed aggregator application for discovering and viewing public encrypted content
 * Deployed at browse.parnoir.com; messaging variant at messaging.parnoir.com
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MetadataFilters, IndexedFile, Feed } from './types/aggregator';
import { useUserState } from './contexts/UserStateContext';
import { buildFeedRailItems } from './components/FeedRail';
import { FeedBrowser } from './components/FeedBrowser';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { CommentModal } from './components/CommentModal';
import { ReportCopyrightModal } from './components/ReportCopyrightModal';
import { BrandedFeedPage } from './components/BrandedFeedPage';
import { CreateFeedModal } from './components/CreateFeedModal';
import { AddToFeedModal } from './components/AddToFeedModal';
import { EditFileModal } from './components/EditFileModal';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useHorizontalSwipe } from './hooks/useHorizontalSwipe';
import { useViewportHeightCSS } from './hooks/useViewportHeight';
import { useFeedNavigation } from './hooks/useFeedNavigation';
import { useEngagement } from './hooks/useEngagement';
import { useToast } from './hooks/useToast';
import { useURLParams } from './hooks/useURLParams';
import { markFeedAsViewed, hasNewContent } from './utils/feedUtils';
import { isThirdPartyFileForViewer } from './utils/contentClass';
import { FeedService } from './services/feedService';
import { AppLayout } from './components/AppLayout';
import { useAppContext } from './hooks/useAppContext';
import { useModals } from './hooks/useModals';
import { useFeedState } from './hooks/useFeedState';
import { useDiscoverFiles } from './hooks/useDiscoverFiles';
import { useDiscovery } from './hooks/useDiscovery';
import { API_ENDPOINT } from './config/api';
import './services/uploadProcessor'; // Initialize upload processor event listeners
import './services/backgroundTaskProcessor'; // Initialize background task processor event listeners
import { SearchPage } from './pages/SearchPage';
import { MessagesPage } from './pages/MessagesPage';
import { UploadPage } from './pages/UploadPage';
import { SettingsPage } from './pages/SettingsPage';
import { MePage, type MePageTab } from './pages/MePage';
import { HomePage } from './pages/HomePage';
import { HomePageContext, type HomePageContextValue } from './contexts/HomePageContext';
import { uploadQueueService } from './services/uploadQueueService';
import type { MediaDimensions } from './utils/mediaScaling';
import { getCreatorIdentifier } from './utils/contentClass';
import { useFeedFiltering } from './hooks/useFeedFiltering';
import { useThumbnailsAndMedia } from './hooks/useThumbnailsAndMedia';
import { useAuthAndSession } from './hooks/useAuthAndSession';
import { useMePageData } from './hooks/useMePageData';
import { usePushNotifications } from './hooks/usePushNotifications';
import { reportCopyright } from './services/reportCopyrightService';
import { PNOAuthService } from './services/pnOAuthService';
import { MESSAGING_ONLY } from './config/buildFlags';
import { SplashScreen } from '@capacitor/splash-screen';

// Shared types - importing from id-dashboard
// In production, these would come from a shared package

// Stable empty array reference to prevent unnecessary re-renders
const EMPTY_ARRAY: IndexedFile[] = [];

function App() {
  useEffect(() => {
    SplashScreen.hide().catch(() => {});
  }, []);

  const { userState, setLocked, setUnlocked, updateDisplayName, getDisplayName } = useUserState();
  const { activeContext, setActiveContext, availableContexts } = useAppContext(userState.pnIdentifier);
  const discover = useDiscoverFiles();
  const {
    mediaFiles,
    setMediaFiles,
    thoughtsFiles,
    setThoughtsFiles,
    collectionsFiles,
    setCollectionsFiles,
    indexedFiles,
    isLoading,
    error,
    setError,
    currentPage,
    setCurrentPage,
    hasMore,
    setHasMore,
    isLoadingMore,
    setIsLoadingMore,
    filters,
    setFilters,
  } = discover;
  const hasMoreRef = useRef(true); // Ref to track hasMore for infinite scroll observer
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    viewMode,
    setViewMode,
    activeFeedId,
    setActiveFeedId,
    currentFeedIndex,
    setCurrentFeedIndex,
    activeBottomTab,
    setActiveBottomTab,
    feeds,
    setFeeds,
    visibleFileId,
    setVisibleFileId,
    feedViewedTimestamps,
    setFeedViewedTimestamps,
  } = useFeedState();

  const {
    showSearch,
    setShowSearch,
    showInbox,
    setShowInbox,
    initialThread,
    setInitialThread,
    showFeedBrowser,
    setShowFeedBrowser,
    showSettings,
    setShowSettings,
    showShortcuts,
    setShowShortcuts,
    commentingFile,
    setCommentingFile,
    viewingBrandedFeed,
    setViewingBrandedFeed,
    showUploadModal,
    setShowUploadModal,
    showCreateFeedModal,
    setShowCreateFeedModal,
    addingToFeedFile,
    setAddingToFeedFile,
    showUploadQueueOverlay,
    setShowUploadQueueOverlay,
  } = useModals();
  const [viewingCreatorId, setViewingCreatorId] = useState<string | null>(null);

  const mePageData = useMePageData({
    viewingCreatorId,
    userState,
    mediaFiles,
    thoughtsFiles,
    collectionsFiles,
    indexedFiles,
    visibleFileId,
    currentFeedIndex,
    setCurrentFeedIndex,
    setVisibleFileId,
  });

  const feedScrollRef = React.useRef<HTMLDivElement>(null);
  const videoRefs = React.useRef<Map<string, HTMLVideoElement>>(new Map());
  const loadBulkEngagementStatsRef = useRef<((fileIds: string[]) => Promise<void>) | null>(null); // Ref for loadBulkEngagementStats function
  const loadedEngagementFileIdsRef = useRef<Set<string>>(new Set()); // Track which fileIds have had engagement stats loaded

  const { toggleLike, toggleDislike, share, getLikeCount, isLiked, isDisliked, getComments, loadComments, getShareCount, loadBulkEngagementStats } = useEngagement();
  const { toasts, removeToast, success, error: showErrorToast } = useToast();
  const { getParam, setParam } = useURLParams();

  // (handleMeClick lives in useAuthAndSession)

  // MOBILE FIX: Use actual viewport height instead of 100vh to account for mobile browser UI
  const viewportHeightCSS = useViewportHeightCSS(true); // true = exclude bottom nav

  // Push notifications (native only): register token when authenticated, handle tap → open thread
  usePushNotifications({
    getAccessToken: () => PNOAuthService.getValidAccessToken(),
    onNotificationAction: (data) => {
      const participantPnIdentifier = data.from_pn_identifier || data.participant_pn_identifier;
      if (participantPnIdentifier) {
        setInitialThread({ participantPnIdentifier });
        setShowInbox(true);
        setActiveBottomTab('messages');
      }
    },
  });

  // Feed navigation hook
  const { getNextFeed, getPreviousFeed } = useFeedNavigation(
    feeds,
    userState.preferences.subscribedFeedIds
  );

  // (loadUserDisplayName and OAuth validate effect live in useAuthAndSession)

  // Set default feed based on user state (only when unlock state changes, not on manual feed switches)
  const prevUnlockedRef = useRef<boolean>(userState.isUnlocked);
  const isManualFeedChangeRef = useRef<boolean>(false); // Track manual feed changes
  useEffect(() => {
    prevUnlockedRef.current = userState.isUnlocked;

    // Don't auto-switch if user manually changed the feed
    if (isManualFeedChangeRef.current) {
      isManualFeedChangeRef.current = false;
      return;
    }
    
    // Removed auto-switch from public to curated - curated feed has been consolidated into public feed
  }, [userState.isUnlocked]); // Only depend on isUnlocked, not activeFeedId (to avoid interference with manual clicks)

  // Fetch feeds from API - only once on mount
  const hasLoadedFeedsRef = useRef<boolean>(false);
  useEffect(() => {
    if (!hasLoadedFeedsRef.current) {
      hasLoadedFeedsRef.current = true;
    const loadFeeds = async () => {
      try {
        const result = await FeedService.listFeeds({ limit: 100 });
        setFeeds(result.feeds);
      } catch (error: any) {
        // Don't log 429 errors as errors - they're handled gracefully
        if (import.meta.env.DEV) {
          if (error?.message?.includes('429') || error?.status === 429) {
            console.warn('Rate limited when loading feeds, using empty list');
          } else {
            console.error('Failed to load feeds:', error);
          }
        }
        // Continue with empty feeds - UI will show default feeds
        setFeeds([]);
      }
    };

    loadFeeds();
    }
  }, []);

  // Reload feeds when a new feed is created
  const handleFeedCreated = async (feed: Feed) => {
    try {
      const result = await FeedService.listFeeds({ limit: 100 });
      setFeeds(result.feeds);
      // Optionally switch to the new feed
      setActiveFeedId(feed.feedId);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to reload feeds:', error);
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
              // This will be handled by UserStateContext
            }
          });
        } catch (error) {
          if (import.meta.env.DEV) console.error('Failed to load subscriptions:', error);
        }
      }
    };

    loadSubscriptions();
  }, [userState.isUnlocked, userState.pnIdentifier]);

  // Load bulk engagement stats when files are loaded
  // Store loadBulkEngagementStats in ref to avoid dependency issues
  useEffect(() => {
    loadBulkEngagementStatsRef.current = loadBulkEngagementStats;
  }, [loadBulkEngagementStats]);

  useEffect(() => {
    if (indexedFiles.length > 0 && loadBulkEngagementStatsRef.current) {
      const fileIds = indexedFiles.map(file => file.metadata.fileId);
      // Only load engagement stats for files we haven't loaded yet
      const newFileIds = fileIds.filter(id => !loadedEngagementFileIdsRef.current.has(id));
      
      if (newFileIds.length > 0) {
        // Mark all new files as being loaded
        newFileIds.forEach(id => loadedEngagementFileIdsRef.current.add(id));
        
      // Load engagement stats in batches to avoid overwhelming the API
      const batchSize = 50;
        for (let i = 0; i < newFileIds.length; i += batchSize) {
          const batch = newFileIds.slice(i, i + batchSize);
          loadBulkEngagementStatsRef.current(batch).catch(error => {
            if (import.meta.env.DEV) console.warn('Failed to load engagement stats, will retry:', error);
            batch.forEach(id => loadedEngagementFileIdsRef.current.delete(id));
          });
        }
      }
    }
  }, [indexedFiles.length]); // Only reload when count changes

  // Initialize from URL params - only on mount and when file param changes
  const hasInitializedFromURLRef = useRef<boolean>(false);
  useEffect(() => {
    const fileParam = getParam('file');
    const feedParam = getParam('feed');
    const creatorParam = getParam('creator');
    const viewParam = getParam('view') as 'grid' | 'feed' | null;

    // Only read feed/creator/view params on initial mount
    if (!hasInitializedFromURLRef.current) {
      hasInitializedFromURLRef.current = true;

    if (viewParam && (viewParam === 'grid' || viewParam === 'feed')) {
      setViewMode(viewParam);
    }

    if (feedParam) {
      setActiveFeedId(feedParam);
    }

    if (creatorParam) {
      setViewingCreatorId(creatorParam);
      }
    }

    // Handle file param separately - can change dynamically
    if (fileParam && indexedFiles.length > 0) {
      const file = indexedFiles.find(f => f.metadata.fileId === fileParam);
      if (file) {
        setViewMode('feed');
        setActiveBottomTab('home');
        // Determine which feed the file belongs to
        const fileFeedIds = file.metadata.feedIds || [];
        let targetFeedId = feedParam || 'public';
        if (!feedParam && fileFeedIds.length > 0) {
          // If file has feed IDs and no feed param, use the first feed
          targetFeedId = fileFeedIds[0];
        }
        if (targetFeedId !== activeFeedId) {
          isManualFeedChangeRef.current = true; // Mark as manual change
          setActiveFeedId(targetFeedId);
        }
        // Wait for feed to be set and files to be filtered, then find the file index
        setTimeout(() => {
          // Find file in filteredFilesByFeed (which depends on activeFeedId)
          // Recalculate filtered files based on current activeFeedId
          let filesToSearch = indexedFiles;
          if (targetFeedId === 'public') {
            filesToSearch = indexedFiles;
          } else if (targetFeedId === 'curated') {
            const subscribedFeedIds = userState.preferences.subscribedFeedIds;
            filesToSearch = indexedFiles.filter(f => 
              f.metadata.feedIds?.some(feedId => subscribedFeedIds.includes(feedId))
            );
          } else {
            filesToSearch = indexedFiles.filter(f => 
              f.metadata.feedIds?.includes(targetFeedId)
            );
          }
          
          const fileIndex = filesToSearch.findIndex(f => f.metadata.fileId === fileParam);
          if (fileIndex !== -1) {
            setCurrentFeedIndex(fileIndex);
            setVisibleFileId(fileParam);
          }
          // Also try to scroll to it after a short delay
        setTimeout(() => {
          const element = document.querySelector(`[data-file-id="${fileParam}"]`);
            if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          }, 300);
        }, 500);
      }
    }
  }, [getParam, indexedFiles.length, userState.preferences.subscribedFeedIds]); // Removed activeFeedId to prevent interference

  // Reset feed index and pagination when feed changes (unless navigating to a specific file)
  useEffect(() => {
    if (visibleFileId || mePageData.isNavigatingToFileRef.current || mePageData.lastNavigatedFileIdRef.current) return;
    setCurrentFeedIndex(0);
    // SCALABILITY: Reset pagination when feed changes
    setCurrentPage(0);
    setHasMore(true);
    hasMoreRef.current = true;
  }, [activeFeedId, visibleFileId]);

  // Reset feed index and tab when opening own profile (unless navigating to a specific file)
  useEffect(() => {
    if (visibleFileId || mePageData.isNavigatingToFileRef.current || mePageData.lastNavigatedFileIdRef.current) return;
    const isProfileOpening = mePageData.prevViewingCreatorIdRef.current !== viewingCreatorId && viewingCreatorId;
    if (isProfileOpening) {
      if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked) {
        setCurrentFeedIndex(0);
        mePageData.mePageData.setMePageTab('all');
      } else if (viewingCreatorId && viewingCreatorId !== userState.pnIdentifier) {
        mePageData.mePageData.setMePageTab('all');
        setCurrentFeedIndex(0);
      }
    }
    mePageData.prevViewingCreatorIdRef.current = viewingCreatorId;
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked, visibleFileId]);

  // Mark feed as viewed when switching to it
  useEffect(() => {
    if (activeFeedId && activeFeedId !== 'new') {
      setFeedViewedTimestamps(prev => markFeedAsViewed(activeFeedId, prev));
    }
  }, [activeFeedId]);

  // Third-party aggregate: clear "new" when user opens discovery or public (mixed-creator feeds).
  useEffect(() => {
    if (
      userState.isUnlocked &&
      (activeFeedId === 'discovery' || activeFeedId === 'public')
    ) {
      setFeedViewedTimestamps(prev => markFeedAsViewed('thirdParty', prev));
    }
  }, [activeFeedId, userState.isUnlocked]);

  const hasNewThirdPartyContent = useMemo(() => {
    const viewerPn = userState.pnIdentifier;
    if (!userState.isUnlocked || !viewerPn) return false;
    const thirdParty = indexedFiles.filter(f => isThirdPartyFileForViewer(f, viewerPn));
    return hasNewContent('thirdParty', thirdParty, feedViewedTimestamps);
  }, [indexedFiles, feedViewedTimestamps, userState.isUnlocked, userState.pnIdentifier]);

  // Build feed rail items - Always show DISCOVER, PUBLIC, ARTS, SPORTS, MUSIC (TikTok style)
  // Only show subscribed feeds and CURATED feed when user is unlocked
  // MUST be before early returns to satisfy Rules of Hooks
  const feedRailItems = useMemo(() => {
    return buildFeedRailItems(
      feeds,
      userState.isUnlocked ? userState.preferences.subscribedFeedIds : [],
      activeFeedId,
      userState.isUnlocked,
      hasNewThirdPartyContent
    );
  }, [feeds, userState.isUnlocked, userState.preferences.subscribedFeedIds, activeFeedId, hasNewThirdPartyContent]);

  const { filteredFilesByFeed, isThought, isCollection, isMedia } = useFeedFiltering({
    mediaFiles,
    thoughtsFiles,
    collectionsFiles,
    activeFeedId,
    userState,
    connectionsList: mePageData.connectionsList,
    feeds,
    viewMode,
  });

  const {
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
  } = useThumbnailsAndMedia({ mediaFiles, thoughtsFiles, collectionsFiles, viewMode });

  const {
    discoverFiles,
    discoverFilesRef,
    isDiscoveringRef,
    handleSearch,
    handleFilterChange,
  } = useDiscovery({
    discoverState: discover,
    cleanupThumbnailsForFiles,
    hasMoreRef,
    activeFeedId,
    userState,
  });

  const { handleLockUnlock, handleMeClick } = useAuthAndSession({
    setViewingCreatorId,
    setActiveBottomTab,
    setShowInbox,
    setShowSearch,
    setShowUploadModal,
    setViewingBrandedFeed,
    showErrorToast,
    discoverFilesRef,
  });

  // Update URL when state changes — MUST run after useAuthAndSession registers oauth_resume handling.
  // Otherwise setParam pushState runs first on OAuth return and can strip oauth_resume/code before the resume effect runs.
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

  // Public feed now uses the same thumbnails state as Me page
  // generateThumbnailsForImages already populates thumbnails for all discovered files

  // Navigation handlers (memoized)

  const handleNextFeed = useCallback(() => {
    const nextFeedId = getNextFeed(activeFeedId);
    if (nextFeedId) {
      setActiveFeedId(nextFeedId);
      setCurrentFeedIndex(0); // Reset to first item in new feed
    }
  }, [getNextFeed, activeFeedId]);

  const handlePreviousFeed = useCallback(() => {
    const prevFeedId = getPreviousFeed(activeFeedId);
    if (prevFeedId) {
      setActiveFeedId(prevFeedId);
      setCurrentFeedIndex(0); // Reset to first item in new feed
    }
  }, [getPreviousFeed, activeFeedId]);
  
  // Feed post navigation (for keyboard shortcuts)
  const handleNextPost = useCallback(() => {
    if (currentFeedIndex < filteredFilesByFeed.length - 1) {
      setCurrentFeedIndex(currentFeedIndex + 1);
    }
  }, [currentFeedIndex, filteredFilesByFeed.length]);

  const handlePreviousPost = useCallback(() => {
    if (currentFeedIndex > 0) {
      setCurrentFeedIndex(currentFeedIndex - 1);
    }
  }, [currentFeedIndex]);

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

  // Horizontal swipe for feed switching (only in feed mode)
  // Swipe right = previous feed (discover), Swipe left = next feed (arts)
  const horizontalSwipeRef = useHorizontalSwipe({
    onSwipeLeft: viewMode === 'feed' ? handleNextFeed : undefined, // Swipe left = next feed (arts)
    onSwipeRight: viewMode === 'feed' ? handlePreviousFeed : undefined, // Swipe right = previous feed (discover)
    enabled: viewMode === 'feed' && !showFeedBrowser && !showSettings && !showShortcuts && !viewingCreatorId,
    threshold: 40, // Slightly lower threshold for easier detection
    snapThreshold: 0.2 // 20% of screen width to trigger
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
                         !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            // Item is in view - play video if it's a video
            setVisibleFileId(fileId);
            
            if (isVideo && videoElement && videoBlobs.has(fileId)) {
              videoElement.play().catch(err => {
                if (import.meta.env.DEV) console.warn('Failed to auto-play video:', err);
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

  // SCALABILITY: Infinite scroll - load more files when user scrolls near bottom
  useEffect(() => {
    // Don't set up observer if conditions aren't met
    if (viewMode !== 'feed' || !hasMoreRef.current || isLoadingMore || isDiscoveringRef.current) {
      return;
    }
    if (!discoverFilesRef.current) return; // Wait for discoverFiles to be initialized
    
    let observer: IntersectionObserver | null = null;
    let sentinel: HTMLElement | null = null;
    let isReconnecting = false; // Prevent multiple reconnections
    
    const setupObserver = () => {
      // Double-check conditions before creating observer (use ref to get current value)
      if (!hasMoreRef.current || isLoadingMore || isDiscoveringRef.current || !discoverFilesRef.current || isReconnecting) {
        return;
      }
      
      // Don't create if observer already exists
      if (observer) {
        return;
      }
      
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            // Triple-check conditions in callback to prevent race conditions (use ref for hasMore)
            if (entry.isIntersecting && hasMoreRef.current && !isLoadingMore && !isDiscoveringRef.current && discoverFilesRef.current && !isReconnecting) {
              // Disconnect observer immediately to prevent multiple triggers
              if (observer) {
                observer.disconnect();
                observer = null;
              }
              setIsLoadingMore(true);
              isReconnecting = true; // Prevent reconnection until done
              
              // Get current page value at time of trigger
              const pageToLoad = currentPage + 1;
              
              discoverFilesRef.current(undefined, false, pageToLoad, true).finally(() => {
                setIsLoadingMore(false);
                isReconnecting = false;
                // Only reconnect observer if there's more content AND we're still in feed mode
                // Use ref to check current hasMore value (avoids stale closure)
                setTimeout(() => {
                  if (viewMode === 'feed' && hasMoreRef.current && sentinel && !observer && !isReconnecting) {
                    setupObserver();
                  }
                }, 500); // Increased delay to prevent rapid reconnections
              });
            }
          });
        },
        {
          rootMargin: '200px', // Start loading 200px before reaching bottom
          threshold: 0.1
        }
      );
      
      // Create or find sentinel element at bottom of feed
      sentinel = document.getElementById('feed-infinite-scroll-sentinel');
      if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'feed-infinite-scroll-sentinel';
        sentinel.style.height = '1px';
        sentinel.style.width = '100%';
        // Try to append to feed container
        const feedContainer = document.querySelector('[data-feed-container]') || document.body;
        feedContainer.appendChild(sentinel);
      }
      
      if (sentinel && observer) {
        observer.observe(sentinel);
      }
    };
    
    setupObserver();
    
    return () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      isReconnecting = false;
    };
  }, [viewMode, hasMore, isLoadingMore]); // Removed currentPage from dependencies

  // (Token-driven refresh, loadContentTypeIndices, discoverFiles, init, handleSearch, handleFilterChange live in useDiscovery)

  // (Me-page state/effects live in useMePageData)



  // State for editing file metadata
  const [editingFile, setEditingFile] = useState<IndexedFile | null>(null);
  const [reportingCopyrightFile, setReportingCopyrightFile] = useState<IndexedFile | null>(null);
  
  // Memoize callbacks for FeedEngagementSidebar to prevent re-renders
  const handleLike = useCallback((fileId: string) => {
    const wasLiked = isLiked(fileId);
    toggleLike(fileId);
    if (!wasLiked) {
      success('Liked!');
    }
  }, [isLiked, toggleLike, success]);

  const handleComment = useCallback((indexedFile: IndexedFile) => {
    setCommentingFile(indexedFile);
  }, []);
  
  // Debug logging removed for cleaner console
  
  // CommentModal render logic (logging removed - was too verbose)

  const handleShare = useCallback(async (fileId: string) => {
    share(fileId);
    const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
    const { shareContent } = await import('./utils/nativeShare');
    const ok = await shareContent({ url: shareUrl });
    if (ok) {
      success('Link copied to clipboard!');
      setParam('file', fileId);
    } else {
      showErrorToast('Failed to copy link. Please try again.');
    }
  }, [share, success, setParam, showErrorToast]);

  const handleReportCopyright = useCallback((file: IndexedFile) => {
    setReportingCopyrightFile(file);
  }, []);

  const handleCreatorClick = useCallback((creatorId: string) => {
    setViewingCreatorId(creatorId);
    setViewMode('feed');
    mePageData.setMePageTab('all');
  }, []);

  // Memoize file props per fileId to prevent re-renders
  const filePropsMapRef = useRef<Map<string, { file: IndexedFile; isLiked: boolean; isOwner: boolean }>>(new Map());
  const getFileProps = useCallback((indexedFile: IndexedFile) => {
    const fileId = indexedFile.metadata.fileId;
    const cached = filePropsMapRef.current.get(fileId);
    
    // Check if we need to update cached props
    const currentIsLiked = isLiked(fileId);
    const currentIsOwner = userState.isUnlocked && userState.pnIdentifier === (indexedFile.metadata.creator?.identifier?.value || indexedFile.metadata.creator?.["@id"] || indexedFile.metadata.author?.did);
    const currentLikeCount = getLikeCount(fileId, indexedFile.metadata.engagement?.likes || 0);
    const currentCommentCount = getComments(fileId).length + (indexedFile.metadata.engagement?.comments || 0);
    const currentShareCount = getShareCount(fileId, indexedFile.metadata.engagement?.shares || 0);
    
    // Check if engagement data changed
    const engagementChanged = cached ? (
      cached.isLiked !== currentIsLiked ||
      cached.isOwner !== currentIsOwner ||
      cached.file.metadata.engagement?.likes !== currentLikeCount ||
      cached.file.metadata.engagement?.comments !== currentCommentCount ||
      cached.file.metadata.engagement?.shares !== currentShareCount
    ) : true;
    
    if (!cached || engagementChanged) {
      const fileWithEngagement: IndexedFile = {
        ...indexedFile,
        metadata: {
          ...indexedFile.metadata,
          engagement: {
            ...indexedFile.metadata.engagement,
            views: indexedFile.metadata.engagement?.views ?? 0,
            likes: currentLikeCount,
            comments: currentCommentCount,
            shares: currentShareCount,
            saves: indexedFile.metadata.engagement?.saves ?? 0,
            lastUpdated: indexedFile.metadata.engagement?.lastUpdated ?? new Date().toISOString()
          }
        }
      };
      
      const props = {
        file: fileWithEngagement,
        isLiked: currentIsLiked,
        isOwner: currentIsOwner
      };
      
      filePropsMapRef.current.set(fileId, props);
      return props;
    }
    
    return cached;
  }, [isLiked, getLikeCount, getComments, getShareCount, userState.isUnlocked, userState.pnIdentifier]);

  // Stable key for indexedFiles (fileIds) to avoid unnecessary stableIndexedFiles updates
  const indexedFilesKey = useMemo(() => indexedFiles.map(f => f.metadata.fileId).sort().join(','), [indexedFiles]);
  // Memoize indexedFiles array reference to prevent FeedEngagementSidebar re-renders
  const stableIndexedFiles = useMemo(() => indexedFiles, [indexedFilesKey]);

  // (handleLockUnlock lives in useAuthAndSession)

  const homeContextValue = {
    viewMode,
    setViewMode,
    viewportHeightCSS,
    activeFeedId,
    setActiveFeedId,
    feedRailItems,
    currentFeedIndex,
    setCurrentFeedIndex,
    filteredFilesByFeed,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    setCurrentPage,
    setHasMore,
    hasMoreRef,
    discoverFiles,
    error,
    isLoading,
    hasMore,
    indexedFiles,
    thumbnails,
    setThumbnails,
    videoBlobs,
    setVideoBlobs,
    mediaDimensions,
    setMediaDimensions,
    videoPlaying,
    setVideoPlaying,
    generatingThumbnails,
    setGeneratingThumbnails,
    userState,
    feeds,
    stableIndexedFiles,
    feedScrollRef,
    horizontalSwipeRef,
    isManualFeedChangeRef,
    discoverFilesRef,
    handleSearch,
    handleFilterChange,
    isLiked,
    toggleLike,
    isDisliked,
    toggleDislike,
    getLikeCount,
    getComments,
    loadComments,
    getShareCount,
    share,
    getFileProps,
    isThought,
    getCreatorIdentifier,
    handleComment,
    handleLike,
    handleShare,
    handleReportCopyright,
    handleCreatorClick,
    handleNextFeed,
    handlePreviousFeed,
    handleFeedCreated,
    setViewingCreatorId,
    setViewingBrandedFeed,
    setMePageTab: (t: string) => mePageData.setMePageTab(t as MePageTab),
    setVisibleFileId,
    setShowCreateFeedModal,
    setShowUploadModal,
    setShowSettings,
    setAddingToFeedFile,
    setShowFeedBrowser,
    setCommentingFile,
    setEditingFile,
    setInitialThread,
    setShowInbox,
    setActiveBottomTab,
    isLoadingMore,
    success,
    showErrorToast: (msg: string) => { showErrorToast(msg); },
  };

  return (
    <>
      {/* Comment Modal - Render OUTSIDE all conditional views to ensure it works on all pages */}
      {reportingCopyrightFile && (
        <ReportCopyrightModal
          isOpen={!!reportingCopyrightFile}
          onClose={() => setReportingCopyrightFile(null)}
          fileName={reportingCopyrightFile.metadata.name || reportingCopyrightFile.metadata.title}
          onSubmit={async () => {
            const token = await PNOAuthService.getValidAccessToken();
            if (!token) throw new Error('Please sign in to report');
            await reportCopyright(reportingCopyrightFile.metadata.fileId, token);
            success('Report submitted. Content will be reviewed by Prism Rays.');
          }}
        />
      )}
      {commentingFile && (
        <CommentModal
          key={commentingFile.metadata.fileId} // Force remount on file change
          file={commentingFile}
          onClose={() => {
            setCommentingFile(null);
          }}
        />
      )}
      <HomePageContext.Provider value={homeContextValue as HomePageContextValue}>
      <AppLayout
        messagingOnly={MESSAGING_ONLY}
        viewMode={viewMode}
        activeBottomTab={activeBottomTab}
        setActiveBottomTab={setActiveBottomTab}
        showUploadQueueOverlay={showUploadQueueOverlay}
        setShowUploadQueueOverlay={setShowUploadQueueOverlay}
        onLockUnlock={handleLockUnlock}
        userState={userState}
        activeContext={activeContext}
        availableContexts={availableContexts}
        setActiveContext={setActiveContext}
        toasts={toasts}
        removeToast={removeToast}
        setViewMode={setViewMode}
        setShowInbox={setShowInbox}
        setShowSearch={setShowSearch}
        setShowUploadModal={setShowUploadModal}
        setViewingCreatorId={setViewingCreatorId}
        setViewingBrandedFeed={setViewingBrandedFeed}
        onMeClick={handleMeClick}
      >
      {/* Conditional rendering for different views */}
      {viewingBrandedFeed ? (
        <BrandedFeedPage
          feed={viewingBrandedFeed}
          files={indexedFiles.filter(file => 
            file.metadata.feedIds?.includes(viewingBrandedFeed.feedId)
          )}
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
      ) : showInbox ? (
        <MessagesPage
          initialThread={initialThread}
          onCreatorClick={handleCreatorClick}
          onNotificationClick={(notification) => {
            if (MESSAGING_ONLY) {
              setShowInbox(true);
              setActiveBottomTab('messages');
              return;
            }
            setShowInbox(false);
            setActiveBottomTab('home');
            if (notification.data?.file_id) {
              setViewMode('feed');
              setTimeout(() => {
                const fileId = notification.data?.file_id;
                if (fileId) {
                  const el = document.querySelector(`[data-file-id="${fileId}"]`);
                  if (el && feedScrollRef.current) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            } else if (notification.data?.feed_id) {
              const feedId = notification.data.feed_id;
              if (feedId) { const f = feeds.find(x => x.feedId === feedId); if (f) setViewingBrandedFeed(f); }
            }
          }}
        />
      ) : showSearch ? (
        <SearchPage
          initialQuery={searchQuery}
          indexedFiles={stableIndexedFiles}
          thumbnails={thumbnails}
          onFileClick={(file) => {
            setShowSearch(false);
            const creatorIdRaw = getCreatorIdentifier(file);
            if (!creatorIdRaw) { console.error('No creator ID found for file:', file.metadata.fileId); return; }
            const creatorId = creatorIdRaw.trim();
            isNavigatingToFileRef.current = true;
            setVisibleFileId(file.metadata.fileId);
            setViewingCreatorId(creatorId);
            setViewMode('feed');
            mePageData.setMePageTab('all');
          }}
        />
      ) : viewingCreatorId ? (
        <MePage
          commentingFile={commentingFile}
          viewingCreatorId={viewingCreatorId}
          mePageTab={mePageData.mePageTab}
          onTabSelect={(tab) => { mePageData.setMePageTab(tab); setCurrentFeedIndex(0); }}
          isOwnIndex={mePageData.isOwnIndex}
          filteredMeFiles={mePageData.filteredMeFiles}
          currentFeedIndex={currentFeedIndex}
          setCurrentFeedIndex={setCurrentFeedIndex}
          viewportHeightCSS={viewportHeightCSS}
          thumbnails={thumbnails}
          videoBlobs={videoBlobs}
          userState={userState}
          isLiked={isLiked}
          toggleLike={toggleLike}
          getLikeCount={getLikeCount}
          getComments={getComments}
          loadComments={loadComments}
          getShareCount={getShareCount}
          getDisplayName={getDisplayName}
          onComment={handleComment}
          onShare={share}
          setViewingCreatorId={setViewingCreatorId}
          setInitialThread={setInitialThread}
          setShowInbox={setShowInbox}
          setActiveBottomTab={setActiveBottomTab}
          setEditingFile={setEditingFile}
          onReportCopyright={handleReportCopyright}
          onSave={userState.isUnlocked && userState.pnIdentifier ? (file) => {
            const fileId = file.metadata.fileId;
            mePageData.setSavedFeedFileIds(prev => (prev.includes(fileId) ? prev : [...prev, fileId]));
            success('Saved to your private collection!');
            uploadQueueService.addTask({
              type: 'saveToFeed',
              accountId: '',
              metadata: { fileId, userPnIdentifier: userState.pnIdentifier!, isSaved: false },
              onComplete: () => { mePageData.refreshSavedFeed(); },
              onError: () => { showErrorToast('Failed to save. Please try again.'); mePageData.setSavedFeedFileIds(prev => prev.filter(id => id !== fileId)); },
            });
          } : undefined}
          success={success}
        />
      ) : showUploadModal ? (
        <UploadPage
          feeds={feeds}
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={() => { setCurrentPage(0); setHasMore(true); hasMoreRef.current = true; discoverFiles(undefined, true, 0, false); }}
        />
      ) : showSettings ? (
        <SettingsPage onClose={() => setShowSettings(false)} />
      ) : (
      <HomePage />
      )}
      {showFeedBrowser && (
        <FeedBrowser
          feeds={feeds}
          onClose={() => setShowFeedBrowser(false)}
          onFeedClick={(feed) => { setShowFeedBrowser(false); setViewingBrandedFeed(feed); }}
          onCreateFeed={() => { setShowFeedBrowser(false); setShowCreateFeedModal(true); }}
        />
      )}
      {showCreateFeedModal && (
        <CreateFeedModal onClose={() => setShowCreateFeedModal(false)} onFeedCreated={(feed) => { handleFeedCreated(feed); setShowCreateFeedModal(false); }} />
      )}
      {addingToFeedFile && (
        <AddToFeedModal file={addingToFeedFile} feeds={feeds} onClose={() => setAddingToFeedFile(null)} onAdded={() => { setCurrentPage(0); setHasMore(true); hasMoreRef.current = true; discoverFiles(undefined, true, 0, false); setAddingToFeedFile(null); }} />
      )}
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}
      {editingFile && (
        <EditFileModal
          file={editingFile}
          onClose={() => setEditingFile(null)}
          onSave={async (updatedFile) => {
            setMediaFiles(prev => prev.map(f => f.metadata.fileId === updatedFile.metadata.fileId ? updatedFile : f));
            setThoughtsFiles(prev => prev.map(f => f.metadata.fileId === updatedFile.metadata.fileId ? updatedFile : f));
            setCollectionsFiles(prev => prev.map(f => f.metadata.fileId === updatedFile.metadata.fileId ? updatedFile : f));
            setEditingFile(null);
            success('File updated successfully!');
            try { const { CentralMetadataAggregator } = await import('./services/storage/CentralMetadataAggregator'); CentralMetadataAggregator.clearCache(); } catch (_) {}
            if (discoverFilesRef.current) await discoverFilesRef.current(undefined, true, 0, false);
          }}
        />
      )}
      </AppLayout>
      </HomePageContext.Provider>
    </>
  );
}

export default App;

