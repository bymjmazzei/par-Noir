/**
 * Aggregator Browser
 * Licensed aggregator application for discovering and viewing public encrypted content
 * Deployed at browse.parnoir.com
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Filter, File, Globe, Tag, Calendar, User, Download, RefreshCw, Lock, Unlock, Image as ImageIcon, X, Grid } from 'lucide-react';
import { getMetadataIndexService } from './services/metadata/MetadataIndexService';
import { PublicMetadata, MetadataFilters, IndexedFile, Feed } from './types/aggregator';
import { decryptWithToken, ShareToken } from './utils/tokenDecryption';
import { useUserState } from './contexts/UserStateContext';
import { FeedRail, buildFeedRailItems } from './components/FeedRail';
import { PNConnect } from './components/PNConnect';
import { FeedBrowser } from './components/FeedBrowser';
import { CreatorIndex } from './components/CreatorIndex';
import { FeedEngagementSidebar } from './components/FeedEngagementSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { ContentRatingBadge } from './components/ContentRatingBadge';
import { EmptyState } from './components/EmptyState';
import { CommentModal } from './components/CommentModal';
import { BrandedFeedPage } from './components/BrandedFeedPage';
import { MediaViewer } from './components/MediaViewer';
import { UploadModal } from './components/UploadModal';
import { CreateFeedModal } from './components/CreateFeedModal';
import { AddToFeedModal } from './components/AddToFeedModal';
import { NotificationBell } from './components/NotificationBell';
import { ToastContainer } from './components/Toast';
import { EditFileModal } from './components/EditFileModal';
import { MePageTabsRail } from './components/MePageTabsRail';
import { Settings, Upload, Plus, Home, MessageSquare, Grid } from 'lucide-react';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useSwipeGesture } from './hooks/useSwipeGesture';
import { useVerticalSwipe } from './hooks/useVerticalSwipe';
import { useHorizontalSwipe } from './hooks/useHorizontalSwipe';
import { useFeedNavigation } from './hooks/useFeedNavigation';
import { useEngagement } from './hooks/useEngagement';
import { useToast } from './hooks/useToast';
import { useURLParams } from './hooks/useURLParams';
import { loadFeedViewedTimestamps, markFeedAsViewed, hasNewContent } from './utils/feedUtils';
import { FeedService } from './services/feedService';
import { PNOAuthService } from './services/pnOAuthService';
import { FullScreenFeed } from './components/FullScreenFeed';
import { FeedNavBar } from './components/FeedNavBar';
import { BottomNav } from './components/BottomNav';
import { DiscoveryPage } from './components/DiscoveryPage';
import { SearchResults } from './components/SearchResults';
import { CreatorFeedPage } from './components/CreatorFeedPage';
import { Inbox } from './components/Inbox';
import { saveToFeed, getSavedFeed } from './services/savedFeedService';

// Shared types - importing from id-dashboard
// In production, these would come from a shared package

// Stable empty array reference to prevent unnecessary re-renders
const EMPTY_ARRAY: IndexedFile[] = [];

function App() {
  const { userState, setLocked, setUnlocked, updateDisplayName } = useUserState();
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<MetadataFilters>({});
  const [viewingFile, setViewingFile] = useState<{ file: IndexedFile; blob: Blob; url: string } | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map()); // fileId -> thumbnail URL
  const [generatingThumbnails, setGeneratingThumbnails] = useState<Set<string>>(new Set()); // Track which thumbnails are being generated
  const [videoPlaying, setVideoPlaying] = useState<Map<string, boolean>>(new Map()); // Track which videos are playing
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(new Map()); // Store video URLs for playback
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('feed'); // Default to feed mode
  const [activeFeedId, setActiveFeedId] = useState<string>('public');
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0); // Current file index in feed
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'search' | 'upload' | 'index' | 'messages'>('home');
  const [showSearch, setShowSearch] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [initialThread, setInitialThread] = useState<{
    participantDid: string;
    participantName?: string;
  } | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]); // Available feeds
  const [visibleFileId, setVisibleFileId] = useState<string | null>(null); // Currently visible file in feed mode
  const [showFeedBrowser, setShowFeedBrowser] = useState(false); // Show feed browser modal
  const [showSettings, setShowSettings] = useState(false); // Show settings panel
  const [showShortcuts, setShowShortcuts] = useState(false); // Show keyboard shortcuts
  const [commentingFile, setCommentingFile] = useState<IndexedFile | null>(null); // File being commented on
  const [viewingBrandedFeed, setViewingBrandedFeed] = useState<Feed | null>(null); // Branded feed being viewed
  const [showUploadModal, setShowUploadModal] = useState(false); // Show upload modal
  const [showCreateFeedModal, setShowCreateFeedModal] = useState(false); // Show create feed modal
  const [addingToFeedFile, setAddingToFeedFile] = useState<IndexedFile | null>(null); // File being added to feed
  const [viewingCreatorId, setViewingCreatorId] = useState<string | null>(null); // Creator ID for index view
  const [feedViewedTimestamps, setFeedViewedTimestamps] = useState<Map<string, string>>(
    () => loadFeedViewedTimestamps()
  ); // Track when feeds were last viewed
  const feedScrollRef = React.useRef<HTMLDivElement>(null); // Ref for feed scroll container
  const videoRefs = React.useRef<Map<string, HTMLVideoElement>>(new Map()); // Store video element refs
  const discoverFilesRef = useRef<((filters?: MetadataFilters, forceRefresh?: boolean) => Promise<void>) | null>(null); // Ref for discoverFiles function
  const generateThumbnailsForImagesRef = useRef<((files: IndexedFile[]) => Promise<void>) | null>(null); // Ref for generateThumbnailsForImages function
  const isDiscoveringRef = useRef<boolean>(false); // Track if discoverFiles is currently running
  const discoverFilesTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track debounce timeout
  const isNavigatingToFileRef = useRef<boolean>(false); // Track if we're navigating to a specific file
  const lastNavigatedFileIdRef = useRef<string | null>(null); // Track the last file we navigated to
  const lastNavigatedFileIndexRef = useRef<number | null>(null); // Track the index we navigated to
  
  const metadataIndexService = getMetadataIndexService();
  const { toggleLike, share, getLikeCount, isLiked, getComments, loadComments, getShareCount, loadBulkEngagementStats } = useEngagement();
  const { toasts, removeToast, success, error: showErrorToast } = useToast();
  const { getParam, setParam } = useURLParams();

  // Helper function for "Me" button click
  const handleMeClick = async () => {
    // Clear other page states
    setShowInbox(false);
    setShowSearch(false);
    setShowUploadModal(false);
    setViewingBrandedFeed(null);
    if (userState.isUnlocked) {
      const session = PNOAuthService.loadSession();
      let pnIdentifier = session?.pnIdentifier || userState.pnIdentifier;
      
      if (pnIdentifier && pnIdentifier.startsWith('did:key:')) {
        try {
          if (session?.accessToken) {
            const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
            if (userInfo.pn_identifier) {
              pnIdentifier = userInfo.pn_identifier;
              const updatedSession = { ...session, pnIdentifier };
              PNOAuthService.saveSession(updatedSession);
              setUnlocked(pnIdentifier);
              
              // Set display name to nickname if not already set
              if (userInfo.nickname && !userState.preferences.displayName) {
                updateDisplayName(userInfo.nickname);
              }
            }
          }
        } catch (error) {
          console.warn('Failed to fetch pN identifier from userinfo:', error);
        }
      }
      
      if (pnIdentifier && !pnIdentifier.startsWith('did:key:')) {
        setViewingCreatorId(pnIdentifier);
        setActiveBottomTab('index');
      } else {
        // Try one more time to get it from the API
        console.warn('⚠️ Still have DID instead of pN identifier, fetching from API...');
        try {
          const session = PNOAuthService.loadSession();
          if (session?.accessToken) {
            const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
            if (userInfo.pn_identifier && !userInfo.pn_identifier.startsWith('did:key:')) {
              const updatedSession = { ...session, pnIdentifier: userInfo.pn_identifier };
              PNOAuthService.saveSession(updatedSession);
              setUnlocked(userInfo.pn_identifier);
              setViewingCreatorId(userInfo.pn_identifier);
              setActiveBottomTab('index');
              
              // Set display name to nickname if not already set
              if (userInfo.nickname && !userState.preferences.displayName) {
                updateDisplayName(userInfo.nickname);
              }
            } else {
              showErrorToast('Unable to load your pN identifier from API');
            }
          } else {
            showErrorToast('No active session found');
          }
        } catch (error) {
          console.error('Failed to fetch pN identifier:', error);
          showErrorToast('Unable to load your pN identifier');
        }
      }
    } else {
      showErrorToast('Unlock your pN to view your profile');
    }
  };

  // Feed navigation hook
  const { feedHierarchy, getNextFeed, getPreviousFeed, getFeedIndex } = useFeedNavigation(
    feeds,
    userState.preferences.subscribedFeedIds
  );

  // Validate OAuth session on mount and sync with user state
  useEffect(() => {
    const session = PNOAuthService.loadSession();
    if (userState.isUnlocked) {
      // If UI says unlocked but no valid session, lock the user
      if (!session || !PNOAuthService.isSessionValid(session)) {
        console.log('🔐 No valid OAuth session found, locking user');
        setLocked();
        PNOAuthService.clearSession();
      } else if (session.did && session.did !== userState.pnIdentifier) {
        // Session exists but DID doesn't match, sync it
        console.log('🔐 Syncing user state with OAuth session');
        // Use pN identifier from session if available, otherwise use DID
        setUnlocked(session.pnIdentifier || session.did);
      }
    } else if (session && PNOAuthService.isSessionValid(session) && session.did) {
      // If UI says locked but valid session exists, unlock the user
      console.log('🔐 Valid OAuth session found, unlocking user');
      // Use pN identifier from session if available, otherwise use DID
      setUnlocked(session.pnIdentifier || session.did);
    }
  }, []); // Only run on mount

  // Set default feed based on user state (only when unlock state changes, not on manual feed switches)
  const prevUnlockedRef = useRef<boolean>(userState.isUnlocked);
  const isManualFeedChangeRef = useRef<boolean>(false); // Track manual feed changes
  useEffect(() => {
    // Only switch feeds if unlock state actually changed (not just activeFeedId)
    const unlockStateChanged = prevUnlockedRef.current !== userState.isUnlocked;
    prevUnlockedRef.current = userState.isUnlocked;
    
    // Don't auto-switch if user manually changed the feed
    if (isManualFeedChangeRef.current) {
      isManualFeedChangeRef.current = false;
      return;
    }
    
    if (unlockStateChanged) {
      if (userState.isUnlocked && activeFeedId === 'public') {
        // User just unlocked - switch to curated
        setActiveFeedId('curated');
      } else if (!userState.isUnlocked && activeFeedId === 'curated') {
        // User just locked - switch to public
        setActiveFeedId('public');
      }
    }
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
      } catch (error) {
        console.error('Failed to load feeds:', error);
        // Continue with empty feeds - UI will show default feeds
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

  // Re-discover files when active feed or rating preferences change
  // Debounce to prevent rapid-fire calls when switching feeds quickly
  // NOTE: Don't call discoverFiles for virtual feeds (discovery, curated) - they use all files
  useEffect(() => {
    // Skip discovery feed - it's a virtual feed that uses all indexedFiles
    if (activeFeedId === 'discovery') {
      return;
    }
    
    // Clear any pending timeout
    if (discoverFilesTimeoutRef.current) {
      clearTimeout(discoverFilesTimeoutRef.current);
    }
    
    // Debounce with longer delay to prevent rate limiting
    discoverFilesTimeoutRef.current = setTimeout(() => {
      if (discoverFilesRef.current && !isDiscoveringRef.current) {
        discoverFilesRef.current();
      }
    }, 500); // Increased delay to 500ms to reduce API calls
    
    return () => {
      if (discoverFilesTimeoutRef.current) {
        clearTimeout(discoverFilesTimeoutRef.current);
      }
    };
  }, [activeFeedId, userState.preferences.maxRating]);

  // Reset feed index when feed changes (unless navigating to a specific file)
  useEffect(() => {
    // Don't reset if we're navigating to a specific file or if we just navigated to a file
    if (visibleFileId || isNavigatingToFileRef.current || lastNavigatedFileIdRef.current) return;
    setCurrentFeedIndex(0);
  }, [activeFeedId, visibleFileId]);

  // Track previous viewingCreatorId to detect when profile is first opened
  const prevViewingCreatorIdRef = useRef<string | null>(null);
  
  // Reset feed index and tab when opening own profile (unless navigating to a specific file)
  useEffect(() => {
    // Don't reset if we're navigating to a specific file or if we just navigated to a file
    if (visibleFileId || isNavigatingToFileRef.current || lastNavigatedFileIdRef.current) return;
    
    // Only reset tab when profile is first opened (viewingCreatorId changes from null/other to this creator)
    const isProfileOpening = prevViewingCreatorIdRef.current !== viewingCreatorId && viewingCreatorId;
    
    if (isProfileOpening) {
      if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked) {
        setCurrentFeedIndex(0);
        setMePageTab('all');
      } else if (viewingCreatorId && viewingCreatorId !== userState.pnIdentifier) {
        // When viewing another user's profile, set to all tab
        setMePageTab('all');
        setCurrentFeedIndex(0);
      }
    }
    
    // Update ref for next comparison
    prevViewingCreatorIdRef.current = viewingCreatorId;
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked, visibleFileId]);

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

  // Auth modal state - MUST be before early returns to satisfy Rules of Hooks
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Creator files state for INDEX view - MUST be before early returns to satisfy Rules of Hooks
  const [creatorFilesState, setCreatorFilesState] = useState<IndexedFile[]>([]);
  
  // Create a stable key for indexedFilesMap based on fileIds (not array reference)
  // MUST be declared before any useEffect that uses it
  const indexedFilesKey = useMemo(() => {
    return indexedFiles.map(f => f.metadata.fileId).sort().join(',');
  }, [indexedFiles]);

  // Memoize filtered files by active feed
  const filteredFilesByFeed = useMemo(() => {
    if (activeFeedId === 'public') {
      return indexedFiles;
    }
    if (activeFeedId === 'curated') {
      // Curated feed = all files from subscribed feeds
      const subscribedFeedIds = userState.preferences.subscribedFeedIds;
      if (subscribedFeedIds.length === 0) {
        return []; // Empty curated feed if no subscriptions
      }
      return indexedFiles.filter(file => 
        file.metadata.feedIds?.some(feedId => subscribedFeedIds.includes(feedId))
      );
    }
    if (activeFeedId === 'discovery') {
      // Discovery page - return empty for now (will be implemented in Phase 3)
      return [];
    }
    return indexedFiles.filter(file => 
      file.metadata.feedIds?.includes(activeFeedId)
    );
  }, [indexedFiles, activeFeedId, userState.preferences.subscribedFeedIds]);

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

  // Auto-refresh metadata when Google Drive token becomes available
  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem('google_drive_token');
      if (token) {
        console.log('✅ Google Drive token found - will scan pN folders');
        if (discoverFilesRef.current) {
          discoverFilesRef.current();
        }
      }
    };

    // Check immediately
    checkToken();

    // Also listen for storage events (in case token is set in another tab/window)
    window.addEventListener('storage', (e) => {
      if (e.key === 'google_drive_token' && e.newValue) {
        console.log('✅ Google Drive token updated - refreshing metadata');
        if (discoverFilesRef.current) {
          discoverFilesRef.current();
        }
      }
    });

    return () => {
      window.removeEventListener('storage', checkToken);
    };
  }, []);

  const discoverFiles = useCallback(async (searchFilters?: MetadataFilters, forceRefresh: boolean = false) => {
    // Prevent duplicate simultaneous calls
    if (isDiscoveringRef.current && !forceRefresh) {
      console.log('⏸️ Discover files already in progress, skipping duplicate call');
      return;
    }
    
    try {
      isDiscoveringRef.current = true;
      setIsLoading(true);
      setError(null);
      
      // No Google Drive connection needed - just query central aggregator API
      await metadataIndexService.initialize();
      
      // Build filters with rating preferences and feed filtering
      // NOTE: 'curated' and 'discovery' are virtual feeds - don't filter by feedId for these
      // They are filtered client-side in filteredFilesByFeed
      const finalFilters: MetadataFilters = {
        ...filters,
        ...searchFilters,
        ...(searchQuery ? { tags: searchQuery.split(',').map(t => t.trim()).filter(Boolean) } : {}),
        // DON'T apply rating filter to public feed - public feed shows all public files
        // Only apply rating filter to non-public feeds (but not virtual feeds like 'curated' or 'discovery')
        ...(activeFeedId === 'public' || activeFeedId === 'curated' || activeFeedId === 'discovery' 
          ? {} 
          : { maxRating: userState.preferences.maxRating }),
        // Filter by active feed (but not for virtual feeds)
        ...(activeFeedId === 'public' || activeFeedId === 'curated' || activeFeedId === 'discovery' 
          ? {} 
          : { feedId: activeFeedId })
      };
      
      // Discover public files from all users (with optional force refresh)
      const discoveredFiles = await metadataIndexService.discoverFiles(finalFilters, forceRefresh);
      
      // Only update state if content actually changed (compare fileIds to avoid unnecessary re-renders)
      setIndexedFiles(prev => {
        const prevFileIds = new Set(prev.map(f => f.metadata.fileId));
        const newFileIds = new Set(discoveredFiles.map(f => f.metadata.fileId));
        
        // Check if sets are equal (same fileIds)
        if (prevFileIds.size === newFileIds.size && 
            [...prevFileIds].every(id => newFileIds.has(id)) &&
            [...newFileIds].every(id => prevFileIds.has(id))) {
          // Same fileIds - check if any file content changed
          const filesChanged = discoveredFiles.some(newFile => {
            const prevFile = prev.find(f => f.metadata.fileId === newFile.metadata.fileId);
            if (!prevFile) return true; // New file
            // Compare key properties that might change
            return JSON.stringify(prevFile.metadata.engagement) !== JSON.stringify(newFile.metadata.engagement) ||
                   prevFile.metadata.isTopPost !== newFile.metadata.isTopPost;
          });
          
          if (!filesChanged) {
            // No changes - return previous array to prevent re-render
            return prev;
          }
        }
        
        // Content changed - update state
        return discoveredFiles;
      });
      
      console.log(`✅ Discovered ${discoveredFiles.length} public files`);
      
      // Generate thumbnails for image files (called separately to avoid TDZ)
      if (generateThumbnailsForImagesRef.current) {
        generateThumbnailsForImagesRef.current(discoveredFiles);
      }
      
      // Pre-load video blobs for feed mode (if in feed mode)
      const currentViewMode = viewMode || 'grid';
      if (currentViewMode === 'feed') {
        for (const indexedFile of discoveredFiles) {
          const file = indexedFile.metadata;
          const isVideo = file.fileType === 'video' || 
                         (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
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
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to discover files';
      setError(errorMessage);
      console.error('Failed to discover files:', err);
    } finally {
      setIsLoading(false);
      isDiscoveringRef.current = false;
    }
  }, [filters, searchQuery, userState.preferences.maxRating, activeFeedId, viewMode, videoBlobs]);
  
  // Store discoverFiles in ref so it can be called from OAuth callback
  useEffect(() => {
    discoverFilesRef.current = discoverFiles;
  }, [discoverFiles]);
  
  // Initial file discovery on mount (after discoverFiles is defined)
  // Only call once on initial mount, not on every render
  const hasInitializedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!hasInitializedRef.current && discoverFilesRef.current) {
      hasInitializedRef.current = true;
      discoverFilesRef.current();
    }
  }, []);


  const handleSearch = () => {
    discoverFiles();
  };

  const handleFilterChange = (key: keyof MetadataFilters, value: any) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined
    };
    setFilters(newFilters);
    discoverFiles(newFilters);
  };

  // Generate thumbnails for image and video files by decrypting and resizing/extracting frames
  const generateThumbnailsForImages = async (files: IndexedFile[]) => {
    for (const indexedFile of files) {
      const file = indexedFile.metadata;
      const isImage = file.fileType === 'image' || 
                     (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
      const isVideo = file.fileType === 'video' || 
                     (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
      
      // Skip if not an image/video, no publicToken, or already has thumbnail/generating
      // Validate publicToken exists and is not empty
      const hasValidToken = file.publicToken && 
                            typeof file.publicToken === 'string' && 
                            file.publicToken.trim().length > 0;
      
      if ((!isImage && !isVideo) || !hasValidToken || thumbnails.has(file.fileId) || generatingThumbnails.has(file.fileId)) {
        if (hasValidToken === false && (isImage || isVideo)) {
          console.warn(`⚠️ [Feed] Skipping ${file.fileId} - missing or invalid publicToken:`, {
            fileId: file.fileId,
            hasPublicToken: !!file.publicToken,
            publicTokenType: typeof file.publicToken,
            publicTokenLength: file.publicToken ? String(file.publicToken).length : 0
          });
        }
        continue;
      }

      generatingThumbnails.add(file.fileId);
      setGeneratingThumbnails(new Set(generatingThumbnails));

      try {
        // Parse token
        let token: ShareToken;
        try {
          token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
          
          // Validate token structure
          if (!token || !token.shareKey || !token.shareEncrypted) {
            throw new Error('Invalid token structure - missing shareKey or shareEncrypted');
          }
        } catch (e) {
          console.error(`❌ [Feed] Failed to parse/validate token for ${file.fileId}:`, e);
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
  };
  
  // Store generateThumbnailsForImages in ref so it can be called from discoverFiles
  useEffect(() => {
    generateThumbnailsForImagesRef.current = generateThumbnailsForImages;
  }, []);

  // Create a thumbnail from a blob (resize image to max dimensions)
  const createThumbnailFromBlob = (blob: Blob, maxWidth: number, maxHeight: number): Promise<string> => {
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
  };

  // Create a thumbnail from a video blob (extract a frame)
  const createVideoThumbnailFromBlob = (blob: Blob, maxWidth: number, maxHeight: number): Promise<string> => {
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
  };

  // Load creator files when viewing a creator (especially own index)
  useEffect(() => {
    if (!viewingCreatorId) {
      setCreatorFilesState([]);
      return;
    }
    
    // If viewing own profile and unlocked, load directly from Google Drive
    if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked) {
      const loadUserFiles = async () => {
        try {
          // Query API for ALL files, then filter client-side by pnIdentifier
          // This ensures we get files from all Google Drive accounts
          const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
          const response = await fetch(
            `${apiEndpoint}/api/aggregator/metadata-index`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );

          let apiFiles: IndexedFile[] = [];
          if (response.ok) {
            const data = await response.json();
            if (data.files && Array.isArray(data.files)) {
              // Filter by pnIdentifier (which is the same as the user's identifier)
              // Note: Dashboard stores pnIdentifier as "pn-{hash}" but browser uses just "{hash}"
              // So we need to normalize both formats for comparison
              const normalizeIdentifier = (id: string | undefined | null): string => {
                if (!id) return '';
                // Remove "pn-" prefix if present, then normalize
                const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
                return cleaned.trim().toLowerCase();
              };
              
              const userIdentifier = normalizeIdentifier(viewingCreatorId);
              console.log(`🔍 Filtering files for user: ${viewingCreatorId} (normalized: ${userIdentifier})`);
              console.log(`🔍 Total files from API: ${data.files.length}`);
              
              // Log first few files to debug
              data.files.slice(0, 3).forEach((entry: any, idx: number) => {
                const metadata = entry.metadata || {};
                console.log(`📄 File ${idx + 1}:`, {
                  fileId: entry.fileId,
                  pnIdentifier: entry.pnIdentifier,
                  normalizedPnId: normalizeIdentifier(entry.pnIdentifier),
                  creator: metadata.creator,
                  author: metadata.author,
                  creatorId: metadata.creatorId
                });
              });
              
              const userFiles = data.files.filter((entry: any) => {
                // Check pnIdentifier field (top-level in entry) - normalize it
                const entryPnId = normalizeIdentifier(entry.pnIdentifier);
                // Also check metadata creator/author fields - normalize them too
                const metadata = entry.metadata || {};
                const creatorIdRaw = metadata.creator?.identifier?.value ||
                                    metadata.creator?.["@id"] ||
                                    metadata.author?.did ||
                                    metadata.creatorId;
                const creatorId = normalizeIdentifier(creatorIdRaw);
                
                const matches = entryPnId === userIdentifier || creatorId === userIdentifier;
                if (matches) {
                  console.log(`✅ Found owned file: ${entry.fileId}, pnIdentifier: ${entry.pnIdentifier} (normalized: ${entryPnId}), creatorId: ${creatorIdRaw} (normalized: ${creatorId})`);
                } else {
                  console.log(`❌ File ${entry.fileId} doesn't match: entryPnId="${entry.pnIdentifier}" (normalized: "${entryPnId}"), creatorId="${creatorIdRaw}" (normalized: "${creatorId}"), user="${viewingCreatorId}" (normalized: "${userIdentifier}")`);
                }
                return matches;
              });

              // Convert filtered entries to IndexedFile format
              apiFiles = userFiles.map((entry: any) => {
                const metadata = entry.metadata || {};
                return {
                  metadata: {
                    ...metadata,
                    fileId: entry.fileId || metadata.fileId,
                    // Ensure owner info is preserved
                    creator: metadata.creator || {
                      identifier: { value: entry.pnIdentifier || viewingCreatorId }
                    },
                    creatorId: entry.pnIdentifier || metadata.creatorId || viewingCreatorId,
                    // Also check author field for legacy compatibility
                    author: metadata.author || {
                      did: entry.pnIdentifier || viewingCreatorId
                    }
                }
                } as IndexedFile;
              });
              console.log(`📊 Loaded ${apiFiles.length} files from API for user ${viewingCreatorId} (filtered from ${data.files.length} total files)`);
            }
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn(`⚠️ API returned ${response.status} for user files: ${errorText}, falling back to public index`);
          }

          // Also get files from already-loaded public index (in case API missed some)
          const publicIndexFiles = indexedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId ||
                                (f as any).pnIdentifier;
            const normalizedOwnerId = fileOwnerId?.trim().toLowerCase() || '';
            const normalizedViewingId = viewingCreatorId.trim().toLowerCase();
            return normalizedOwnerId === normalizedViewingId;
          });
          
          // Combine and deduplicate by fileId
          const combinedFiles = Array.from(
            new Map([...apiFiles, ...publicIndexFiles]
              .map(f => [f.metadata.fileId, f])).values()
          );
          
          console.log(`📊 Combined: ${apiFiles.length} from API, ${publicIndexFiles.length} from public index, ${combinedFiles.length} total (deduplicated)`);
          setCreatorFilesState(combinedFiles);
        } catch (error) {
          console.error('Failed to load user files from API, falling back to public index:', error);
          // Fallback to public index
          const filtered = indexedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId ||
                                (f as any).pnIdentifier;
            const normalizedOwnerId = fileOwnerId?.trim().toLowerCase() || '';
            const normalizedViewingId = viewingCreatorId.trim().toLowerCase();
            return normalizedOwnerId === normalizedViewingId;
          });
          setCreatorFilesState(filtered);
        }
      };

      loadUserFiles();
    } else {
      // For other creators (or when not logged in), load from public API
      const loadPublicCreatorFiles = async () => {
        try {
          const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
          // Normalize the creator ID - API might expect "pn-" prefix
          const normalizedCreatorId = viewingCreatorId.startsWith('pn-') 
            ? viewingCreatorId 
            : `pn-${viewingCreatorId}`;
          const response = await fetch(
            `${apiEndpoint}/api/aggregator/metadata-index?authorDid=${encodeURIComponent(normalizedCreatorId)}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );

          let apiFiles: IndexedFile[] = [];
          if (response.ok) {
            const data = await response.json();
            if (data.files && Array.isArray(data.files)) {
              // Normalize identifiers for comparison
              const normalizeIdentifier = (id: string | undefined | null): string => {
                if (!id) return '';
                const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
                return cleaned.trim().toLowerCase();
              };
              
              const userIdentifier = normalizeIdentifier(viewingCreatorId);
              
              // Filter files by creatorId
              const userFiles = data.files.filter((entry: any) => {
                const entryPnId = normalizeIdentifier(entry.pnIdentifier);
                const metadata = entry.metadata || {};
                const creatorIdRaw = metadata.creator?.identifier?.value ||
                                    metadata.creator?.["@id"] ||
                                    metadata.author?.did ||
                                    metadata.creatorId;
                const creatorId = normalizeIdentifier(creatorIdRaw);
                
                return entryPnId === userIdentifier || creatorId === userIdentifier;
              });

              // Convert to IndexedFile format
              apiFiles = userFiles.map((entry: any) => {
                const metadata = entry.metadata || {};
                return {
                  metadata: {
                    ...metadata,
                    fileId: entry.fileId || metadata.fileId,
                    creatorId: entry.pnIdentifier || metadata.creatorId || viewingCreatorId,
                    creator: metadata.creator || {
                      identifier: { value: entry.pnIdentifier || viewingCreatorId }
                    },
                    author: metadata.author || {
                      did: entry.pnIdentifier || viewingCreatorId
                    }
                  }
                } as IndexedFile;
              });
            }
          }

          // Also check already-loaded public index as fallback
          const publicIndexFiles = indexedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId;
            const normalizeIdentifier = (id: string | undefined | null): string => {
              if (!id) return '';
              const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
              return cleaned.trim().toLowerCase();
            };
            const normalizedOwnerId = normalizeIdentifier(fileOwnerId);
            const normalizedViewingId = normalizeIdentifier(viewingCreatorId);
            return normalizedOwnerId === normalizedViewingId;
          });

          // Combine and deduplicate
          const combinedFiles = Array.from(
            new Map([...apiFiles, ...publicIndexFiles]
              .map(f => [f.metadata.fileId, f])).values()
          );

          console.log(`📊 Loaded ${combinedFiles.length} public files for creator ${viewingCreatorId} (${apiFiles.length} from API, ${publicIndexFiles.length} from index)`);
          setCreatorFilesState(combinedFiles);
        } catch (error) {
          console.error('Failed to load creator files:', error);
          // Fallback to filtering from already-loaded index
          const filtered = indexedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId;
            const normalizeIdentifier = (id: string | undefined | null): string => {
              if (!id) return '';
              const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
              return cleaned.trim().toLowerCase();
            };
            const normalizedOwnerId = normalizeIdentifier(fileOwnerId);
            const normalizedViewingId = normalizeIdentifier(viewingCreatorId);
            return normalizedOwnerId === normalizedViewingId;
          });
          setCreatorFilesState(filtered);
        }
      };

      loadPublicCreatorFiles();
    }
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked, indexedFilesKey]);

  // Load user's liked and commented files when viewing own index
  const [userLikedFiles, setUserLikedFiles] = useState<IndexedFile[]>([]);
  const [userCommentedFiles, setUserCommentedFiles] = useState<IndexedFile[]>([]);
  const [connectionsFiles, setConnectionsFiles] = useState<IndexedFile[]>([]);
  const [isLoadingUserEngagement, setIsLoadingUserEngagement] = useState(false);
  
  // Load other user's liked and commented files when viewing their profile
  const [viewedUserLikedFiles, setViewedUserLikedFiles] = useState<IndexedFile[]>([]);
  const [viewedUserCommentedFiles, setViewedUserCommentedFiles] = useState<IndexedFile[]>([]);
  
  // Track saved feed fileIds separately to avoid refetching
  const [savedFeedFileIds, setSavedFeedFileIds] = useState<string[]>([]);
  const savedFeedLoadingRef = useRef(false);
  const savedFeedErrorRef = useRef<{ timestamp: number; count: number } | null>(null);
  const lastSavedFeedFetchRef = useRef<{ userDid: string; timestamp: number } | null>(null);
  
  // Load saved feed fileIds from API (only when user/viewing changes)
  useEffect(() => {
    if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked && userState.pnIdentifier) {
      // Prevent multiple simultaneous calls
      if (savedFeedLoadingRef.current) return;
      
      // If we've had recent errors, don't retry immediately (exponential backoff)
      if (savedFeedErrorRef.current) {
        const timeSinceError = Date.now() - savedFeedErrorRef.current.timestamp;
        const backoffDelay = Math.min(30000 * Math.pow(2, savedFeedErrorRef.current.count), 300000); // Max 5 minutes
        if (timeSinceError < backoffDelay) {
          // Don't retry yet - backoff period still active
          return;
        }
      }
      
      // Prevent refetching if we just fetched for this user recently (within 5 seconds)
      if (lastSavedFeedFetchRef.current?.userDid === userState.pnIdentifier) {
        const timeSinceLastFetch = Date.now() - lastSavedFeedFetchRef.current.timestamp;
        if (timeSinceLastFetch < 5000) {
          return; // Too soon to refetch
        }
      }
      
      savedFeedLoadingRef.current = true;
      setIsLoadingSavedFiles(true);
      (async () => {
        try {
          const savedFeed = await getSavedFeed(userState.pnIdentifier);
          if (savedFeed && savedFeed.fileIds.length > 0) {
            setSavedFeedFileIds(savedFeed.fileIds);
          } else {
            setSavedFeedFileIds([]);
          }
          // Clear error ref on success and update last fetch time
          savedFeedErrorRef.current = null;
          lastSavedFeedFetchRef.current = {
            userDid: userState.pnIdentifier,
            timestamp: Date.now()
          };
        } catch (error: any) {
          // Only log if it's not a 500 error (to reduce spam)
          if (error?.status !== 500) {
            console.error('Failed to load saved feed:', error);
          }
          setSavedFeedFileIds([]);
          // Track error for backoff
          if (savedFeedErrorRef.current) {
            savedFeedErrorRef.current.count++;
            savedFeedErrorRef.current.timestamp = Date.now();
          } else {
            savedFeedErrorRef.current = { timestamp: Date.now(), count: 1 };
          }
        } finally {
          setIsLoadingSavedFiles(false);
          savedFeedLoadingRef.current = false;
        }
      })();
    } else {
      setSavedFeedFileIds([]);
      setSavedFiles([]);
      savedFeedLoadingRef.current = false;
      savedFeedErrorRef.current = null; // Clear errors when switching away
      lastSavedFeedFetchRef.current = null;
    }
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked]);

  // Create a map of indexed files by fileId for efficient lookup
  // Use a ref to store the actual Map and only recreate when fileIds change
  const indexedFilesMapRef = useRef<Map<string, IndexedFile>>(new Map());
  const indexedFilesMap = useMemo(() => {
    // Only recreate if fileIds actually changed (not just array reference)
    const currentKey = indexedFiles.map(f => f.metadata.fileId).sort().join(',');
    const prevKey = Array.from(indexedFilesMapRef.current.keys()).sort().join(',');
    
    if (currentKey === prevKey && indexedFilesMapRef.current.size === indexedFiles.length) {
      // FileIds haven't changed - update existing map with new file references but keep same Map instance
      indexedFiles.forEach(f => {
        indexedFilesMapRef.current.set(f.metadata.fileId, f);
      });
      return indexedFilesMapRef.current;
    }
    
    // FileIds changed - create new map
    const map = new Map<string, IndexedFile>();
    indexedFiles.forEach(f => {
      map.set(f.metadata.fileId, f);
    });
    indexedFilesMapRef.current = map;
    return map;
  }, [indexedFilesKey, indexedFiles]);
  
  // Match saved feed fileIds with indexed files (only when savedFeedFileIds or indexedFilesKey changes)
  // Use indexedFilesKey instead of indexedFilesMap to prevent re-runs when Map reference changes
  const savedFeedFileIdsKey = useMemo(() => savedFeedFileIds.sort().join(','), [savedFeedFileIds]);
  useEffect(() => {
    if (savedFeedFileIds.length > 0 && indexedFilesMap.size > 0) {
      const savedFromIndexed = savedFeedFileIds
        .map(fileId => indexedFilesMap.get(fileId))
        .filter((f): f is IndexedFile => f !== undefined);
      
      // Only update if content actually changed (compare by fileId list)
      setSavedFiles(prev => {
        const prevIds = new Set(prev.map(f => f.metadata.fileId));
        const newIds = new Set(savedFromIndexed.map(f => f.metadata.fileId));
        if (prevIds.size === newIds.size && [...prevIds].every(id => newIds.has(id))) {
          return prev; // No change, return previous array to avoid re-render
        }
        return savedFromIndexed;
      });
    } else if (savedFeedFileIds.length === 0) {
      setSavedFiles(prev => prev.length === 0 ? prev : EMPTY_ARRAY);
    }
  }, [savedFeedFileIdsKey, indexedFilesKey, savedFeedFileIds, indexedFilesMap]);

  // Track user engagement fileIds separately
  const [userLikedFileIds, setUserLikedFileIds] = useState<string[]>([]);
  const [userCommentedFileIds, setUserCommentedFileIds] = useState<string[]>([]);
  
  // Load user engagement fileIds (only when user/viewing changes)
  useEffect(() => {
    if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked && userState.pnIdentifier) {
      setIsLoadingUserEngagement(true);
      (async () => {
        try {
          // Get file IDs from engagement data (likes and comments)
          const engagementData = loadEngagementData();
          
          // Get file IDs that user has liked
          const likedFileIds = Array.from(engagementData.likes);
          
          // Get file IDs that user has commented on
          const commentedFileIds = Array.from(engagementData.comments.keys());
          
          setUserLikedFileIds(likedFileIds);
          setUserCommentedFileIds(commentedFileIds);
        } catch (error) {
          console.error('Failed to load user engagement:', error);
          setUserLikedFileIds([]);
          setUserCommentedFileIds([]);
        } finally {
          setIsLoadingUserEngagement(false);
        }
      })();
    } else {
      setUserLikedFileIds([]);
      setUserCommentedFileIds([]);
      setUserLikedFiles([]);
      setUserCommentedFiles([]);
    }
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked]);
  
  // Match engagement fileIds with indexed files (only when engagement fileIds or indexedFilesKey changes)
  // Use indexedFilesKey instead of indexedFilesMap to prevent re-runs when Map reference changes
  const userLikedFileIdsKey = useMemo(() => userLikedFileIds.sort().join(','), [userLikedFileIds]);
  const userCommentedFileIdsKey = useMemo(() => userCommentedFileIds.sort().join(','), [userCommentedFileIds]);
  useEffect(() => {
    if (indexedFilesMap.size > 0) {
      const likedFromIndexed = userLikedFileIds
        .map(fileId => indexedFilesMap.get(fileId))
        .filter((f): f is IndexedFile => f !== undefined);
      const commentedFromIndexed = userCommentedFileIds
        .map(fileId => indexedFilesMap.get(fileId))
        .filter((f): f is IndexedFile => f !== undefined);
      
      // Only update if content actually changed (compare by fileId list)
      setUserLikedFiles(prev => {
        const prevIds = new Set(prev.map(f => f.metadata.fileId));
        const newIds = new Set(likedFromIndexed.map(f => f.metadata.fileId));
        if (prevIds.size === newIds.size && [...prevIds].every(id => newIds.has(id))) {
          return prev; // No change, return previous array to avoid re-render
        }
        return likedFromIndexed;
      });
      
      setUserCommentedFiles(prev => {
        const prevIds = new Set(prev.map(f => f.metadata.fileId));
        const newIds = new Set(commentedFromIndexed.map(f => f.metadata.fileId));
        if (prevIds.size === newIds.size && [...prevIds].every(id => newIds.has(id))) {
          return prev; // No change, return previous array to avoid re-render
        }
        return commentedFromIndexed;
      });
    } else {
      setUserLikedFiles(prev => prev.length === 0 ? prev : EMPTY_ARRAY);
      setUserCommentedFiles(prev => prev.length === 0 ? prev : EMPTY_ARRAY);
    }
  }, [userLikedFileIdsKey, userCommentedFileIdsKey, indexedFilesKey, userLikedFileIds, userCommentedFileIds, indexedFilesMap]);

  // Load other user's liked and commented files when viewing their profile
  useEffect(() => {
    if (viewingCreatorId && viewingCreatorId !== userState.pnIdentifier) {
      (async () => {
        try {
          const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
          // Normalize the creator ID - API might expect "pn-" prefix
          const normalizedCreatorId = viewingCreatorId.startsWith('pn-') 
            ? viewingCreatorId 
            : `pn-${viewingCreatorId}`;
          
          // Get user's engagement (likes and comments)
          const engagementResponse = await fetch(
            `${apiEndpoint}/api/engagement/user/${encodeURIComponent(normalizedCreatorId)}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            }
          );

          if (engagementResponse.ok) {
            const engagementData = await engagementResponse.json();
            const likedFileIds = engagementData.likedFileIds || [];
            const commentedFileIds = engagementData.commentedFileIds || [];

            // Load files from API for liked files
            const allLikedFiles: IndexedFile[] = [];
            const allCommentedFiles: IndexedFile[] = [];

            // Get file metadata for liked files
            if (likedFileIds.length > 0) {
              const apiFilesResponse = await fetch(
                `${apiEndpoint}/api/aggregator/metadata-index`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );

              if (apiFilesResponse.ok) {
                const apiData = await apiFilesResponse.json();
                if (apiData.files && Array.isArray(apiData.files)) {
                  const likedFiles = apiData.files
                    .filter((entry: any) => likedFileIds.includes(entry.fileId))
                    .map((entry: any) => {
                      const metadata = entry.metadata || {};
                      return {
                        metadata: {
                          ...metadata,
                          fileId: entry.fileId || metadata.fileId,
                          creatorId: entry.pnIdentifier || metadata.creatorId,
                          creator: metadata.creator || {
                            identifier: { value: entry.pnIdentifier }
                          },
                          author: metadata.author || {
                            did: entry.pnIdentifier
                          }
                        }
                      } as IndexedFile;
                    });
                  allLikedFiles.push(...likedFiles);
                }
              }
            }

            // Get file metadata for commented files
            if (commentedFileIds.length > 0) {
              const apiFilesResponse = await fetch(
                `${apiEndpoint}/api/aggregator/metadata-index`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );

              if (apiFilesResponse.ok) {
                const apiData = await apiFilesResponse.json();
                if (apiData.files && Array.isArray(apiData.files)) {
                  const commentedFiles = apiData.files
                    .filter((entry: any) => commentedFileIds.includes(entry.fileId))
                    .map((entry: any) => {
                      const metadata = entry.metadata || {};
                      return {
                        metadata: {
                          ...metadata,
                          fileId: entry.fileId || metadata.fileId,
                          creatorId: entry.pnIdentifier || metadata.creatorId,
                          creator: metadata.creator || {
                            identifier: { value: entry.pnIdentifier }
                          },
                          author: metadata.author || {
                            did: entry.pnIdentifier
                          }
                        }
                      } as IndexedFile;
                    });
                  allCommentedFiles.push(...commentedFiles);
                }
              }
            }

            // Also check already-loaded indexed files as fallback
            const likedFromIndexed = indexedFiles.filter(f => 
              likedFileIds.includes(f.metadata.fileId)
            );
            const commentedFromIndexed = indexedFiles.filter(f => 
              commentedFileIds.includes(f.metadata.fileId)
            );

            // Combine and deduplicate
            const combinedLiked = Array.from(
              new Map([...allLikedFiles, ...likedFromIndexed]
                .map(f => [f.metadata.fileId, f])).values()
            );
            const combinedCommented = Array.from(
              new Map([...allCommentedFiles, ...commentedFromIndexed]
                .map(f => [f.metadata.fileId, f])).values()
            );

            // Only update if content actually changed
            setViewedUserLikedFiles(prev => {
              const prevIds = new Set(prev.map(f => f.metadata.fileId));
              const newIds = new Set(combinedLiked.map(f => f.metadata.fileId));
              if (prevIds.size === newIds.size && [...prevIds].every(id => newIds.has(id))) {
                return prev;
              }
              return combinedLiked;
            });
            setViewedUserCommentedFiles(prev => {
              const prevIds = new Set(prev.map(f => f.metadata.fileId));
              const newIds = new Set(combinedCommented.map(f => f.metadata.fileId));
              if (prevIds.size === newIds.size && [...prevIds].every(id => newIds.has(id))) {
                return prev;
              }
              return combinedCommented;
            });
            console.log(`📊 Loaded ${combinedLiked.length} liked files and ${combinedCommented.length} commented files for creator ${viewingCreatorId}`);
          } else {
            setViewedUserLikedFiles(prev => prev.length === 0 ? prev : []);
            setViewedUserCommentedFiles(prev => prev.length === 0 ? prev : []);
          }
        } catch (error) {
          console.error('Failed to load user engagement files:', error);
          setViewedUserLikedFiles(prev => prev.length === 0 ? prev : []);
          setViewedUserCommentedFiles(prev => prev.length === 0 ? prev : []);
        }
      })();
    } else {
      setViewedUserLikedFiles(prev => prev.length === 0 ? prev : []);
      setViewedUserCommentedFiles(prev => prev.length === 0 ? prev : []);
    }
  }, [viewingCreatorId, userState.pnIdentifier, indexedFilesKey]);

  // Load connections files when viewing own index
  useEffect(() => {
    if (viewingCreatorId === userState.pnIdentifier && userState.pnIdentifier) {
      (async () => {
        try {
          const { getConnections } = await import('./services/connectionService');
          const connections = await getConnections(userState.pnIdentifier);
          
          // Get connection IDs (normalize to handle both formats)
          const normalizeIdentifier = (id: string | undefined | null): string => {
            if (!id) return '';
            const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
            return cleaned.trim().toLowerCase();
          };
          
          const connectionIds = connections.map(c => normalizeIdentifier(c.userDid));
          
          // Load top post for each connection from API
          const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
          const connectionTopPosts: IndexedFile[] = [];
          
          // Query API for each connection's top post
          for (const connection of connections) {
            try {
              const normalizedConnectionId = connection.userDid.startsWith('pn-') 
                ? connection.userDid 
                : `pn-${connection.userDid}`;
              const response = await fetch(
                `${apiEndpoint}/api/aggregator/metadata-index?authorDid=${encodeURIComponent(normalizedConnectionId)}`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              if (response.ok) {
                const data = await response.json();
                if (data.files && Array.isArray(data.files)) {
                  // Find the top post for this connection
                  const topPost = data.files.find((entry: any) => {
                    const metadata = entry.metadata || {};
                    return metadata.isTopPost === true;
                  });
                  
                  if (topPost) {
                    const metadata = topPost.metadata || {};
                    connectionTopPosts.push({
                      metadata: {
                        ...metadata,
                        fileId: topPost.fileId || metadata.fileId,
                        creatorId: topPost.pnIdentifier || metadata.creatorId || connection.userDid,
                        creator: metadata.creator || {
                          identifier: { value: topPost.pnIdentifier || connection.userDid }
                        },
                        author: metadata.author || {
                          did: topPost.pnIdentifier || connection.userDid
                        },
                        isTopPost: true
                      }
                    } as IndexedFile);
                  }
                }
              }
            } catch (err) {
              console.warn(`Failed to load top post for connection ${connection.userDid}:`, err);
            }
          }
          
          // Also check already-loaded indexed files as fallback
          const topPostsFromIndexed = indexedFiles.filter(f => {
            const creatorId = f.metadata.creator?.identifier?.value || 
                             f.metadata.creator?.["@id"] || 
                             f.metadata.author?.did ||
                             f.metadata.creatorId;
            const normalizedCreatorId = normalizeIdentifier(creatorId);
            const isTopPost = f.metadata.isTopPost === true;
            return normalizedCreatorId && 
                   connectionIds.includes(normalizedCreatorId) && 
                   isTopPost;
          });
          
          // Combine and deduplicate (prefer API results)
          const combinedTopPosts = Array.from(
            new Map([
              ...connectionTopPosts.map(f => [f.metadata.fileId, f]),
              ...topPostsFromIndexed.map(f => [f.metadata.fileId, f])
            ]).values()
          );
          
          setConnectionsFiles(combinedTopPosts);
          console.log(`📊 Connections feed: ${combinedTopPosts.length} top posts from ${connections.length} connections`);
        } catch (error) {
          console.error('Failed to load connections files:', error);
          setConnectionsFiles([]);
        }
      })();
    } else {
      setConnectionsFiles([]);
    }
  }, [viewingCreatorId, userState.pnIdentifier, indexedFilesKey]);

  // Helper function to load engagement data (same as in useEngagement hook)
  function loadEngagementData() {
    try {
      const stored = localStorage.getItem('pn_engagement_data');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          likes: new Set(parsed.likes || []),
          comments: new Map(Object.entries(parsed.comments || {})),
          shares: new Map(Object.entries(parsed.shares || {}))
        };
      }
    } catch (e) {
      console.warn('Failed to load engagement data:', e);
    }
    return {
      likes: new Set(),
      comments: new Map(),
      shares: new Map()
    };
  }

  // State for editing file metadata
  const [editingFile, setEditingFile] = useState<IndexedFile | null>(null);
  
  // State for Me page tabs
  const [mePageTab, setMePageTab] = useState<'all' | 'media' | 'thoughts' | 'likes' | 'comments' | 'saved' | 'connections'>('all');
  const [savedFiles, setSavedFiles] = useState<IndexedFile[]>([]);
  const [isLoadingSavedFiles, setIsLoadingSavedFiles] = useState(false);

  // Find file index when navigating to a specific file in creator's profile
  useEffect(() => {
    if (!visibleFileId || !viewingCreatorId) {
      isNavigatingToFileRef.current = false;
      return;
    }
    
    // Mark that we're navigating to a file
    isNavigatingToFileRef.current = true;
    
    // Helper function to find and set file index
    const findAndSetFileIndex = () => {
      // Use creatorFilesState directly instead of computed creatorFiles to avoid initialization issues
      const currentCreatorFiles = viewingCreatorId ? creatorFilesState : [];
      const currentIsOwnIndex = viewingCreatorId === userState.pnIdentifier && userState.isUnlocked;
      let currentFilteredMeFiles: IndexedFile[] = [];
      
      if (currentIsOwnIndex) {
        switch (mePageTab) {
          case 'all':
            currentFilteredMeFiles = Array.from(
              new Map([...currentCreatorFiles, ...userLikedFiles, ...userCommentedFiles]
                .map(f => [f.metadata.fileId, f])).values()
            );
            break;
          case 'media':
            currentFilteredMeFiles = currentCreatorFiles.filter(f => !isThought(f));
            break;
          case 'thoughts':
            currentFilteredMeFiles = currentCreatorFiles.filter(f => isThought(f));
            break;
          case 'likes':
            currentFilteredMeFiles = userLikedFiles.filter(f => {
              const fileOwnerId = f.metadata.creator?.identifier?.value || 
                 f.metadata.creator?.["@id"] || 
                       f.metadata.author?.did ||
                       f.metadata.creatorId;
              const normalizedOwnerId = fileOwnerId?.trim().toLowerCase() || '';
            const normalizedViewingId = viewingCreatorId.trim().toLowerCase();
              return normalizedOwnerId !== normalizedViewingId;
          });
            break;
          case 'comments':
            currentFilteredMeFiles = userCommentedFiles.filter(f => {
              const fileOwnerId = f.metadata.creator?.identifier?.value || 
                   f.metadata.creator?.["@id"] || 
                   f.metadata.author?.did ||
                   f.metadata.creatorId;
              const normalizedOwnerId = fileOwnerId?.trim().toLowerCase() || '';
        const normalizedViewingId = viewingCreatorId.trim().toLowerCase();
              return normalizedOwnerId !== normalizedViewingId;
    });
            break;
          case 'saved':
            currentFilteredMeFiles = savedFiles;
            break;
          case 'connections':
            currentFilteredMeFiles = connectionsFiles;
            break;
    }
      } else if (viewingCreatorId) {
        switch (mePageTab) {
          case 'all':
            currentFilteredMeFiles = Array.from(
              new Map([...currentCreatorFiles, ...viewedUserLikedFiles, ...viewedUserCommentedFiles]
                .map(f => [f.metadata.fileId, f])).values()
            );
            break;
          case 'media':
            currentFilteredMeFiles = currentCreatorFiles.filter(f => !isThought(f));
            break;
          case 'thoughts':
            currentFilteredMeFiles = currentCreatorFiles.filter(f => isThought(f));
            break;
          case 'likes':
            currentFilteredMeFiles = viewedUserLikedFiles;
            break;
          case 'comments':
            currentFilteredMeFiles = viewedUserCommentedFiles;
            break;
          default:
            currentFilteredMeFiles = currentCreatorFiles;
        }
      }
      
      // First, check if file is in current filteredMeFiles
      if (currentFilteredMeFiles.length > 0) {
        const fileIndex = currentFilteredMeFiles.findIndex(f => f.metadata.fileId === visibleFileId);
        if (fileIndex !== -1) {
          setCurrentFeedIndex(fileIndex);
          // Track that we navigated to this file
          lastNavigatedFileIdRef.current = visibleFileId;
          lastNavigatedFileIndexRef.current = fileIndex;
          // FullScreenFeed will handle scrolling automatically
          // Clear flags after scroll completes, but keep lastNavigatedFileIdRef to prevent resets
          setTimeout(() => {
            isNavigatingToFileRef.current = false;
            setVisibleFileId(null);
            // Clear the last navigated file ref after a longer delay to prevent resets
            setTimeout(() => {
              lastNavigatedFileIdRef.current = null;
              lastNavigatedFileIndexRef.current = null;
            }, 1000);
          }, 1000);
          return true;
        }
      }
      
      // If not found in current tab, check other tabs
      // Check media tab (currentCreatorFiles)
      if (currentCreatorFiles.length > 0) {
        const mediaIndex = currentCreatorFiles.findIndex(f => f.metadata.fileId === visibleFileId);
        if (mediaIndex !== -1) {
          setMePageTab('media');
          setCurrentFeedIndex(mediaIndex);
          // Track that we navigated to this file
          lastNavigatedFileIdRef.current = visibleFileId;
          lastNavigatedFileIndexRef.current = mediaIndex;
          // FullScreenFeed will handle scrolling automatically
          setTimeout(() => {
            isNavigatingToFileRef.current = false;
            setVisibleFileId(null);
            setTimeout(() => {
              lastNavigatedFileIdRef.current = null;
              lastNavigatedFileIndexRef.current = null;
            }, 1000);
          }, 1000);
          return true;
        }
      }
      
      // Check 'all' tab (combines media, likes, comments)
      const allFiles = currentIsOwnIndex
        ? Array.from(new Map([...currentCreatorFiles, ...userLikedFiles, ...userCommentedFiles].map(f => [f.metadata.fileId, f])).values())
        : Array.from(new Map([...currentCreatorFiles, ...viewedUserLikedFiles, ...viewedUserCommentedFiles].map(f => [f.metadata.fileId, f])).values());
      
      if (allFiles.length > 0) {
        const allIndex = allFiles.findIndex(f => f.metadata.fileId === visibleFileId);
        if (allIndex !== -1) {
          setMePageTab('all');
          setCurrentFeedIndex(allIndex);
          // Track that we navigated to this file
          lastNavigatedFileIdRef.current = visibleFileId;
          lastNavigatedFileIndexRef.current = allIndex;
          // FullScreenFeed will handle scrolling automatically
          setTimeout(() => {
            isNavigatingToFileRef.current = false;
            setVisibleFileId(null);
            setTimeout(() => {
              lastNavigatedFileIdRef.current = null;
              lastNavigatedFileIndexRef.current = null;
            }, 1000);
          }, 1000);
          return true;
        }
      }
      
      return false;
    };
    
    // Try to find the file immediately
    if (findAndSetFileIndex()) {
      return;
    }
    
    // If files haven't loaded yet, retry with increasing delays
    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = 200; // 200ms between retries
    
    const retryTimer = setInterval(() => {
      retryCount++;
      if (findAndSetFileIndex() || retryCount >= maxRetries) {
        clearInterval(retryTimer);
        if (retryCount >= maxRetries) {
          // File not found after retries - clear flag and visibleFileId
          isNavigatingToFileRef.current = false;
          setTimeout(() => setVisibleFileId(null), 100);
          }
      }
    }, retryInterval);
    
    return () => {
      clearInterval(retryTimer);
      isNavigatingToFileRef.current = false;
    };
  }, [visibleFileId, viewingCreatorId, mePageTab, creatorFilesState, userState.pnIdentifier, userState.isUnlocked, userLikedFiles, userCommentedFiles, viewedUserLikedFiles, viewedUserCommentedFiles, savedFiles]);

  // Helper function to identify text posts (thoughts) - MUST be defined before any useMemo/useEffect that uses it
  const isThought = (file: IndexedFile): boolean => {
    return file.metadata.fileType === 'text' || 
           file.metadata.fileType === 'thought' ||
           !!(file.metadata as any).textPost ||
           !!(file.metadata as any).thought;
  };

  // Prepare data for conditional rendering
  // Use stable empty array reference to prevent unnecessary re-renders
  const creatorFiles = viewingCreatorId ? creatorFilesState : EMPTY_ARRAY;
  const isOwnIndex = viewingCreatorId === userState.pnIdentifier && userState.isUnlocked;
  
  // Memoize filteredMeFiles to prevent unnecessary recalculations
  const filteredMeFilesMemo = useMemo(() => {
    let filtered: IndexedFile[] = [];
    if (isOwnIndex) {
      switch (mePageTab) {
        case 'all':
          filtered = Array.from(
            new Map([...creatorFiles, ...userLikedFiles, ...userCommentedFiles]
              .map(f => [f.metadata.fileId, f])).values()
          );
          break;
        case 'media':
          filtered = creatorFiles.filter(f => !isThought(f));
          break;
        case 'thoughts':
          filtered = creatorFiles.filter(f => isThought(f));
          break;
        case 'likes':
          filtered = userLikedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId;
            const normalizedOwnerId = fileOwnerId?.trim().toLowerCase() || '';
            const normalizedViewingId = viewingCreatorId!.trim().toLowerCase();
            return normalizedOwnerId !== normalizedViewingId;
          });
          break;
        case 'comments':
          filtered = userCommentedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId;
            const normalizedOwnerId = fileOwnerId?.trim().toLowerCase() || '';
            const normalizedViewingId = viewingCreatorId!.trim().toLowerCase();
            return normalizedOwnerId !== normalizedViewingId;
          });
          break;
        case 'saved':
          filtered = savedFiles;
          break;
        case 'connections':
          filtered = connectionsFiles;
          break;
      }
      
      // Pin top post at the top for 'all', 'media', and 'thoughts' tabs
      if ((mePageTab === 'all' || mePageTab === 'media' || mePageTab === 'thoughts') && filtered.length > 0) {
        const topPostIndex = filtered.findIndex(f => f.metadata.isTopPost === true);
        if (topPostIndex > 0) {
          const topPost = filtered[topPostIndex];
          filtered = [topPost, ...filtered.filter((_, i) => i !== topPostIndex)];
        }
      }
    } else if (viewingCreatorId) {
      switch (mePageTab) {
        case 'all':
          filtered = Array.from(
            new Map([...creatorFiles, ...viewedUserLikedFiles, ...viewedUserCommentedFiles]
              .map(f => [f.metadata.fileId, f])).values()
          );
          break;
        case 'media':
          filtered = creatorFiles.filter(f => !isThought(f));
          break;
        case 'thoughts':
          filtered = creatorFiles.filter(f => isThought(f));
          break;
        case 'likes':
          filtered = viewedUserLikedFiles;
          break;
        case 'comments':
          filtered = viewedUserCommentedFiles;
          break;
        default:
          filtered = creatorFiles;
      }
      
      // Pin top post at the top for 'all', 'media', and 'thoughts' tabs
      if ((mePageTab === 'all' || mePageTab === 'media' || mePageTab === 'thoughts') && filtered.length > 0) {
        const topPostIndex = filtered.findIndex(f => f.metadata.isTopPost === true);
        if (topPostIndex > 0) {
          const topPost = filtered[topPostIndex];
          filtered = [topPost, ...filtered.filter((_, i) => i !== topPostIndex)];
        }
      }
    }
    return filtered;
  }, [isOwnIndex, mePageTab, creatorFiles, userLikedFiles, userCommentedFiles, savedFiles, connectionsFiles, viewedUserLikedFiles, viewedUserCommentedFiles, viewingCreatorId]);
  
  // Only log when the count actually changes - use refs to track all values to prevent unnecessary re-runs
  const prevFilteredCountRef = useRef<number>(-1);
  // prevViewingCreatorIdRef is already declared above (line 436)
  const prevIsOwnIndexRef = useRef<boolean>(false);
  const prevMePageTabRef = useRef<string>('all');
  
  // Track lengths with refs to avoid dependency issues
  const creatorFilesLengthRef = useRef<number>(0);
  const userLikedFilesLengthRef = useRef<number>(0);
  const userCommentedFilesLengthRef = useRef<number>(0);
  const savedFilesLengthRef = useRef<number>(0);
  const filteredMeFilesLengthRef = useRef<number>(0);
  
  // Update length refs when they change
  useEffect(() => {
    creatorFilesLengthRef.current = creatorFiles.length;
    userLikedFilesLengthRef.current = userLikedFiles.length;
    userCommentedFilesLengthRef.current = userCommentedFiles.length;
    savedFilesLengthRef.current = savedFiles.length;
    filteredMeFilesLengthRef.current = filteredMeFilesMemo.length;
  }, [creatorFiles, userLikedFiles, userCommentedFiles, savedFiles, filteredMeFilesMemo]);
  
  useEffect(() => {
    const currentCount = filteredMeFilesLengthRef.current;
    const countChanged = currentCount !== prevFilteredCountRef.current;
    const creatorChanged = viewingCreatorId !== prevViewingCreatorIdRef.current;
    const ownIndexChanged = isOwnIndex !== prevIsOwnIndexRef.current;
    const tabChanged = mePageTab !== prevMePageTabRef.current;
    
    // Only log if something meaningful changed
    if (viewingCreatorId && (countChanged || creatorChanged || ownIndexChanged || tabChanged)) {
      prevFilteredCountRef.current = currentCount;
      prevViewingCreatorIdRef.current = viewingCreatorId;
      prevIsOwnIndexRef.current = isOwnIndex;
      prevMePageTabRef.current = mePageTab;
      
      // Only log if count actually changed (not just other dependencies)
      if (countChanged || creatorChanged) {
        console.log(`📊 Creator index: Found ${currentCount} files for creator ${viewingCreatorId}${isOwnIndex ? ` (tab: ${mePageTab}, ${creatorFilesLengthRef.current} owned, ${userLikedFilesLengthRef.current} liked, ${userCommentedFilesLengthRef.current} commented, ${savedFilesLengthRef.current} saved)` : ''}`);
      }
    }
  }, [viewingCreatorId, isOwnIndex, mePageTab]);

  const filteredMeFiles = filteredMeFilesMemo;

  // Memoize callbacks for FeedEngagementSidebar to prevent re-renders
  const handleLike = useCallback((fileId: string) => {
    const wasLiked = isLiked(fileId);
    toggleLike(fileId);
    if (!wasLiked) {
      success('Liked!');
    }
  }, [isLiked, toggleLike, success]);

  const handleComment = useCallback((indexedFile: IndexedFile) => {
    console.log('[App] handleComment called', { fileId: indexedFile.metadata.fileId });
    setCommentingFile(indexedFile);
  }, []);
  
  // Debug: Track commentingFile changes
  useEffect(() => {
    console.log('[App] commentingFile state changed', { 
      hasCommentingFile: !!commentingFile,
      commentingFileId: commentingFile?.metadata?.fileId,
      viewingCreatorId,
      viewMode,
      willRenderModal: !!commentingFile
    });
  }, [commentingFile, viewingCreatorId, viewMode]);

  const handleShare = useCallback(async (fileId: string) => {
    share(fileId);
    const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      success('Link copied to clipboard!');
      setParam('file', fileId);
    } catch (err) {
      showErrorToast('Failed to copy link. Please try again.');
    }
  }, [share, success, setParam, showErrorToast]);

  const handleCreatorClick = useCallback((creatorId: string) => {
    setViewingCreatorId(creatorId);
    setViewMode('profile');
    setMePageTab('all');
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
            likes: currentLikeCount,
            comments: currentCommentCount,
            shares: currentShareCount
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

  // Memoize indexedFiles array reference to prevent FeedEngagementSidebar re-renders
  // Only recreate when indexedFilesKey changes (actual fileIds change)
  const stableIndexedFiles = useMemo(() => indexedFiles, [indexedFilesKey]);
  
  const creatorFeeds = viewingCreatorId ? feeds.filter(feed => feed.creatorId === viewingCreatorId) : [];
  const uniqueFiles = viewingCreatorId ? Array.from(new Map(creatorFiles.map(f => [f.metadata.fileId, f])).values()) : [];


  const handleLockUnlock = async () => {
    if (userState.isUnlocked) {
      // Lock the user
      setLocked();
      // Clear OAuth session
      PNOAuthService.clearSession();
    } else {
      // Unlock - redirect to OAuth authorization page (external HTML page)
      // Get the redirect URI that will be used (must match in token exchange)
      // This must match what getAuthorizationUrl uses internally
      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      
      // Parse the auth URL to extract the redirect_uri that was used
      let authUrl = PNOAuthService.getAuthorizationUrl({ usePopup: true });
      const authUrlObj = new URL(authUrl);
      const actualRedirectUri = authUrlObj.searchParams.get('redirect_uri') || redirectUri;
      
      console.log('Opening OAuth popup, original URL:', authUrl);
      console.log('Using redirect_uri:', actualRedirectUri);
      
      try {
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
        
        // Track processed codes to prevent duplicate processing
        const processedCodes = new Set<string>();
        
        // Handle OAuth callback - listen for both postMessage and localStorage events
        const handleOAuthCallback = (data: { code?: string; state?: string; error?: string; error_description?: string }) => {
          console.log('🔐 OAuth callback received:', data);
          
          if (data.code) {
            // Prevent processing the same code multiple times
            if (processedCodes.has(data.code)) {
              console.warn('🔐 OAuth code already processed, ignoring duplicate callback');
              return;
            }
            processedCodes.add(data.code);
            
            console.log('🔐 Processing OAuth code:', data.code.substring(0, 20) + '...');
            // Handle OAuth callback
            (async () => {
              try {
                // Use the same redirect_uri that was used in the authorization request
                // Extract it from the auth URL to ensure exact match
                const tokenResponse = await PNOAuthService.exchangeCodeForToken(data.code!, actualRedirectUri);
                const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);
                
                console.log('🔐 [OAuth] UserInfo response:', {
                  did: userInfo.did,
                  pn_identifier: userInfo.pn_identifier,
                  public_key: userInfo.public_key ? `${userInfo.public_key.substring(0, 30)}...` : 'undefined',
                  hasPublicKey: !!userInfo.public_key
                });
                
                const session = {
                  accessToken: tokenResponse.access_token,
                  refreshToken: tokenResponse.refresh_token,
                  expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                  did: userInfo.did,
                  pnName: userInfo.pn_name,
                  pnIdentifier: userInfo.pn_identifier, // Store pN identifier from OAuth
                  publicKey: userInfo.public_key // Store publicKey from OAuth for file decryption
                };
                
                PNOAuthService.saveSession(session);
                console.log('🔐 [OAuth] Session saved with publicKey:', session.publicKey ? `${session.publicKey.substring(0, 30)}...` : 'undefined');
                console.log('🔐 Calling setUnlocked with pN identifier:', userInfo.pn_identifier || userInfo.did);
                // Use pN identifier from API if available, otherwise fall back to DID
                // But only set unlocked if we have a pN identifier (not a DID)
                if (userInfo.pn_identifier && !userInfo.pn_identifier.startsWith('did:key:')) {
                  setUnlocked(userInfo.pn_identifier);
                  
                  // Set display name to nickname if not already set
                  if (userInfo.nickname && !userState.preferences.displayName) {
                    updateDisplayName(userInfo.nickname);
                  }
                } else {
                  // No pN identifier yet - this shouldn't happen but handle gracefully
                  console.warn('⚠️ OAuth userinfo did not return pN identifier, using DID as fallback');
                  setUnlocked(userInfo.did);
                }
                console.log('🔐 setUnlocked called, checking state...');
                
                // Refresh feed if needed
                if (discoverFilesRef.current) {
                  discoverFilesRef.current(undefined, true);
                }
                
                console.log('✅ OAuth success! User should be unlocked now.');
              } catch (err) {
                console.error('OAuth callback error:', err);
                // Remove code from processed set so user can retry
                processedCodes.delete(data.code!);
                // Ensure user is locked if authentication failed
                setLocked();
                PNOAuthService.clearSession();
                showErrorToast('Authentication failed. Please try again.');
              }
            })();
          } else if (data.error) {
            console.error('OAuth error:', data.error);
            // Ensure user is locked if authentication was denied
            setLocked();
            PNOAuthService.clearSession();
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
        
        // Poll localStorage aggressively - check for pending flag and latest key
        // Keep polling even after popup closes (callback might arrive after popup closes)
        let callbackFound = false;
        let pollCount = 0;
        const pollInterval = setInterval(() => {
          if (callbackFound) {
            clearInterval(pollInterval);
            return;
          }
          
          pollCount++;
          if (pollCount % 20 === 0) { // Log every second (20 * 50ms)
            console.log(`[OAuth Polling] Check #${pollCount}, popup closed: ${popup.closed}`);
          }
          
          const pending = localStorage.getItem('pn_oauth_pending');
          const latestKey = localStorage.getItem('pn_oauth_latest_key');
          
          if (pollCount % 20 === 0) {
            console.log(`[OAuth Polling] pending=${pending}, latestKey=${latestKey}`);
          }
          
          if (pending === 'true') {
            if (latestKey) {
              const stored = localStorage.getItem(latestKey);
              if (stored) {
                try {
                  const data = JSON.parse(stored);
                  const age = Date.now() - data.timestamp;
                  // Only process if recent (within last 30 seconds - give more time)
                  if (data.timestamp && age < 30000) {
                    console.log('✅ OAuth callback found via polling:', data, `age: ${age}ms`);
                    callbackFound = true;
                    clearInterval(pollInterval);
                    
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
                    
                    // Clean up listeners
                    window.removeEventListener('message', messageListener);
                    window.removeEventListener('storage', storageListener);
                    return;
                  } else if (pollCount % 20 === 0) {
                    console.log(`[OAuth Polling] Callback data too old: ${age}ms`);
                  }
                } catch (e) {
                  console.error('Failed to parse OAuth callback:', e);
                }
              } else if (pollCount % 20 === 0) {
                console.log(`[OAuth Polling] No data found for key: ${latestKey}`);
              }
            } else if (pollCount % 20 === 0) {
              console.log('[OAuth Polling] Pending=true but no latestKey');
            }
          }
        }, 50); // Poll every 50ms for fastest detection
        
        // Stop polling after 30 seconds (timeout)
        setTimeout(() => {
          if (!callbackFound) {
            console.log('OAuth polling timeout - no callback received');
            clearInterval(pollInterval);
            window.removeEventListener('message', messageListener);
            window.removeEventListener('storage', storageListener);
          }
        }, 30000);
        
        // Clean up when popup closes (but keep polling for callback)
        const checkPopupInterval = setInterval(() => {
          if (popup.closed && callbackFound) {
            clearInterval(checkPopupInterval);
            console.log('Popup closed and callback processed');
          } else if (popup.closed && !callbackFound) {
            console.log('Popup closed, but still polling for callback...');
          }
        }, 500);
      } catch (err) {
        console.error('OAuth redirect error:', err);
        showErrorToast('Failed to open authentication window');
      }
    }
  };

  return (
    <div className={`min-h-screen ${viewMode === 'feed' ? 'h-screen overflow-hidden bg-black' : 'bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900'}`}>
      {/* Lock/Unlock Button - Top right corner, always visible on ALL screens */}
      <button
        onClick={handleLockUnlock}
        className="fixed top-3 right-3 z-[110] w-10 h-10 flex items-center justify-center text-white/85 hover:text-white transition-colors pointer-events-auto bg-black/50 rounded-full backdrop-blur-sm"
        title={userState.isUnlocked ? 'Lock pN' : 'Unlock pN'}
      >
        {userState.isUnlocked ? (
          <Unlock className="h-5 w-5" />
        ) : (
          <Lock className="h-5 w-5" />
        )}
      </button>

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
        <div className="h-screen w-full bg-neutral-900">
          <Inbox
            initialThread={initialThread}
            onNotificationClick={(notification) => {
              setShowInbox(false);
              setActiveBottomTab('home');
              // Navigate to relevant content based on notification type
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
        </div>
      ) : showSearch ? (
        <SearchResults
          initialQuery={searchQuery}
          indexedFiles={stableIndexedFiles}
          thumbnails={thumbnails}
          onFileClick={(file) => {
            setShowSearch(false);
            
            // Extract creator ID from the file
            const normalizeIdentifier = (id: string | undefined | null): string => {
              if (!id) return '';
              // Remove "pn-" prefix if present, then normalize
              const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
              return cleaned.trim().toLowerCase();
            };
            
            const creatorIdRaw = file.metadata.creator?.identifier?.value ||
                                file.metadata.creator?.["@id"] ||
                                file.metadata.author?.did ||
                                file.metadata.creatorId ||
                                (file as any).pnIdentifier;
            
            if (!creatorIdRaw) {
              console.error('No creator ID found for file:', file.metadata.fileId);
              return;
            }
            
            const creatorId = creatorIdRaw.trim();
            
            // Set navigation flag BEFORE changing viewingCreatorId to prevent reset effect
            isNavigatingToFileRef.current = true;
            setVisibleFileId(file.metadata.fileId);
            
            // Navigate to creator's profile
            // The useEffect will handle finding the file index in filteredMeFiles
            setViewingCreatorId(creatorId);
            setViewMode('profile');
            setMePageTab('all'); // Default to all tab - useEffect will adjust if needed
          }}
        />
      ) : viewingCreatorId ? (
        <div 
          className="h-screen flex flex-col bg-black"
          style={{ 
            pointerEvents: commentingFile ? 'none' : 'auto',
            zIndex: commentingFile ? 0 : 'auto'
          }}
        >
          {/* Header Railway with Tabs - Show saved tab only if owner */}
          <MePageTabsRail
            activeTab={mePageTab}
            onTabSelect={(tab) => {
              // If not owner, don't allow saved or connections tabs
              if (!isOwnIndex && (tab === 'saved' || tab === 'connections')) return;
              setMePageTab(tab);
              setCurrentFeedIndex(0);
            }}
            availableTabs={isOwnIndex ? ['connections', 'all', 'media', 'likes', 'comments', 'saved'] : ['all', 'media', 'likes', 'comments']}
          />
          
          {/* Unified feed view for all profiles */}
          {filteredMeFiles.length > 0 ? (
            <div className="flex-1" style={{ height: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))', maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))' }}>
              <FullScreenFeed
                files={filteredMeFiles}
                currentIndex={currentFeedIndex}
                onIndexChange={setCurrentFeedIndex}
                onLike={(fileId) => {
                  const wasLiked = isLiked(fileId);
                  toggleLike(fileId);
                  if (!wasLiked) {
                    success('Liked!');
                  }
                }}
                onComment={handleComment}
                onShare={async (fileId) => {
                  share(fileId);
                }}
                isLiked={isLiked}
                getLikeCount={getLikeCount}
                getComments={getComments}
                loadComments={loadComments}
                getShareCount={getShareCount}
                userState={userState}
                onCreatorClick={(creatorId) => {
                  if (creatorId !== viewingCreatorId) {
                    setViewingCreatorId(creatorId);
                    setMePageTab('all');
                    setCurrentFeedIndex(0);
                  }
                }}
                onMessage={(creatorId) => {
                  setInitialThread({ participantDid: creatorId });
                  setShowInbox(true);
                  setActiveBottomTab('messages');
                }}
                onEdit={isOwnIndex ? (file) => setEditingFile(file) : undefined}
                onSave={userState.isUnlocked && userState.pnIdentifier ? async (file) => {
                  try {
                    await saveToFeed(userState.pnIdentifier!, file.metadata.fileId);
                    success('Saved to your private collection!');
                    // Optimistically update the saved feed fileIds
                    setSavedFeedFileIds(prev => {
                      if (!prev.includes(file.metadata.fileId)) {
                        return [...prev, file.metadata.fileId];
                      }
                      return prev;
                    });
                    // Don't refresh from API if we're in backoff - just use optimistic update
                    if (!savedFeedErrorRef.current || 
                        (Date.now() - savedFeedErrorRef.current.timestamp) >= 
                        Math.min(30000 * Math.pow(2, savedFeedErrorRef.current.count), 300000)) {
                      // Only refresh if not in backoff period
                      try {
                        const savedFeed = await getSavedFeed(userState.pnIdentifier);
                        if (savedFeed && savedFeed.fileIds.length > 0) {
                          setSavedFeedFileIds(savedFeed.fileIds);
                          savedFeedErrorRef.current = null; // Clear error on success
                          lastSavedFeedFetchRef.current = {
                            userDid: userState.pnIdentifier,
                            timestamp: Date.now()
                          };
                        }
                      } catch (refreshError) {
                        // Silently fail - we've already optimistically updated
                      }
                    }
                  } catch (error) {
                    showErrorToast('Failed to save. Please try again.');
                  }
                } : undefined}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-white" style={{ paddingBottom: '64px' }}>
              <EmptyState
                type="no-content"
                message={
                  mePageTab === 'media' 
                    ? 'No media yet.'
                    : mePageTab === 'thoughts'
                    ? 'No thoughts yet.'
                    : mePageTab === 'likes'
                    ? 'No liked posts yet.'
                    : mePageTab === 'comments'
                    ? 'No commented posts yet.'
                    : mePageTab === 'saved'
                    ? 'No saved posts yet. Save posts to your private collection!'
                    : 'No content yet.'
                }
              />
            </div>
          )}
        </div>
      ) : showUploadModal ? (
        <div className="h-screen w-full bg-neutral-900" style={{ paddingBottom: '64px' }}>
          <UploadModal
            onClose={() => {
              setShowUploadModal(false);
              setActiveBottomTab('home');
            }}
            onUploadComplete={() => {
              // Refresh files after upload
              discoverFiles(undefined, true);
            }}
          />
        </div>
      ) : (
      <div className={`${viewMode === 'feed' ? 'h-full flex flex-col' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
        {/* Header */}
        {viewMode !== 'feed' && (
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">par Noir Content Browser</h1>
            <p className="text-text-secondary">
              Discover public encrypted content from the par Noir network
            </p>
          </div>
        )}


        {/* Top Navigation Bar - TikTok Style: Text-only overlay, ONLY on home/feed screen */}
        {viewMode === 'feed' && (
          <div 
            className="fixed top-0 left-0 h-12 flex items-center z-[100] bg-transparent"
            style={{ 
              right: '56px', // Space for lock button (40px button + 12px right-3 + 4px gap)
              background: 'transparent'
            }}
          >
            {/* Feed Rail - Scrollable horizontally, centers active feed (TikTok style) */}
            <FeedRail
              feeds={feedRailItems}
              activeFeedId={activeFeedId}
              onFeedSelect={(feedId) => {
                isManualFeedChangeRef.current = true;
                setActiveFeedId(feedId);
              }}
              onBrowseFeeds={undefined}
                  />
          </div>
        )}

        {/* Search and Filters */}
        {viewMode !== 'feed' && (
          <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6 mb-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by tags (comma-separated)..."
                  className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilters({});
                  discoverFiles({});
                }}
                className="px-4 py-2 bg-neutral-700 text-white text-sm font-medium rounded-lg hover:bg-neutral-600 transition-colors"
              >
                Reset
              </button>
            </div>

            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-text-secondary" />
                <span className="text-text-secondary">Filters:</span>
              </div>
              <select
                value={filters.fileType || ''}
                onChange={(e) => handleFilterChange('fileType', e.target.value || undefined)}
                className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="document">Documents</option>
                <option value="file">Other</option>
              </select>
            </div>
          </div>
        </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Stats and View Mode Toggle - ONLY show when NOT in feed mode */}
            {viewMode !== 'feed' && (
          <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-secondary text-sm">Public Files Discovered</p>
                <p className="text-white text-2xl font-bold">{indexedFiles.length}</p>
              </div>
              <div className="flex items-center space-x-4">
                  <button
                    onClick={() => discoverFiles(undefined, true)}
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
            </div>
          </div>
        </div>
        )}

        {/* Files Grid */}
        {error && !isLoading && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
            <p className="text-yellow-400 text-sm">{error}</p>
            <p className="text-yellow-400/80 text-xs mt-2">
              Note: Connect Google Drive at <a href="https://pn.parnoir.com" target="_blank" rel="noopener noreferrer" className="underline">pn.parnoir.com</a> first to scan for public files
            </p>
          </div>
        )}
        
        {isLoading ? (
          viewMode === 'feed' ? (
            <LoadingSkeleton type="feed" count={3} />
          ) : (
            <LoadingSkeleton type="grid" count={6} />
          )
        ) : indexedFiles.length === 0 ? (
          <EmptyState
            type="no-content"
            message={
              typeof window !== 'undefined' && localStorage.getItem('google_drive_token')
                ? 'No files have been marked as public yet. Mark files as public in the dashboard to see them here.'
                : 'Connect Google Drive in the dashboard to scan for public files'
            }
          />
        ) : viewMode === 'feed' && activeFeedId === 'discovery' ? (
          // Discovery Page - uses all indexedFiles (virtual feed)
          <div className="flex-1 h-full pt-20 pb-20">
            <DiscoveryPage
              files={indexedFiles}
              feeds={feeds}
              thumbnails={thumbnails}
              onFileClick={(file) => {
                const index = indexedFiles.findIndex(f => f.metadata.fileId === file.metadata.fileId);
                if (index !== -1) {
                  setActiveFeedId('public');
                  setCurrentFeedIndex(index);
                }
              }}
              onFeedClick={(feed) => {
                setViewingBrandedFeed(feed);
              }}
              onCreatorClick={(creatorId) => {
                console.log('🔍 onCreatorClick called with:', creatorId);
                setViewingCreatorId(creatorId);
                setViewMode('profile');
                setMePageTab('all');
              }}
            />
                    </div>
        ) : viewMode === 'feed' ? (
          // TikTok-style feed view using FullScreenFeed component
          <div 
            ref={(el) => {
              if (horizontalSwipeRef.current !== el) {
                (horizontalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }
            }}
            className="flex-1"
            style={{ height: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))', maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))' }}
          >
            {filteredFilesByFeed.length > 0 ? (
              <FullScreenFeed
                files={filteredFilesByFeed}
                currentIndex={currentFeedIndex}
                onIndexChange={setCurrentFeedIndex}
                onSwipeLeft={handleNextFeed}
                onSwipeRight={handlePreviousFeed}
                onLike={(fileId) => {
                  const wasLiked = isLiked(fileId);
                  toggleLike(fileId);
                      if (!wasLiked) {
                        success('Liked!');
                      }
                    }}
                onComment={(file) => {
                  console.log('[App] Me page onComment called', { 
                    file: file?.metadata?.fileId, 
                    viewingCreatorId,
                    viewMode,
                    commentingFile: !!commentingFile 
                  });
                  setCommentingFile(file);
                  console.log('[App] After setCommentingFile on Me page', { commentingFile: !!commentingFile });
                }}
                onShare={async (fileId) => {
                  share(fileId);
                    }}
                onAddToFeed={(file) => {
                  const creatorId = file.metadata.creator?.identifier?.value || file.metadata.creator?.["@id"] || file.metadata.author?.did;
                      if (userState.isUnlocked && userState.pnIdentifier === creatorId) {
                    setAddingToFeedFile(file);
                      }
                    }}
                onSave={userState.isUnlocked && userState.pnIdentifier ? async (file) => {
                  try {
                    await saveToFeed(userState.pnIdentifier!, file.metadata.fileId);
                    success('Saved to your private collection!');
                  } catch (error) {
                    showErrorToast('Failed to save. Please try again.');
                  }
                } : undefined}
                isLiked={isLiked}
                getLikeCount={getLikeCount}
                getComments={getComments}
                loadComments={loadComments}
                getShareCount={getShareCount}
                userState={userState}
                onCreatorClick={(creatorId) => setViewingCreatorId(creatorId)}
                onMessage={(creatorId) => {
                  setInitialThread({ participantDid: creatorId });
                  setShowInbox(true);
                  setActiveBottomTab('messages');
                }}
                indexedFiles={stableIndexedFiles}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-white">
                <EmptyState
                  type="no-content"
                  message={
                    activeFeedId === 'curated'
                      ? 'No curated content yet. Subscribe to feeds to see content here.'
                      : activeFeedId === 'discovery'
                      ? 'Discovery page coming soon'
                      : 'No content available in this feed'
                  }
                />
                        </div>
            )}
          </div>
        ) : (
          // Grid view
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {indexedFiles.map((indexedFile) => {
              const file = indexedFile.metadata;
              // Detect if file is an image or video from fileType or filename
              const isImage = file.fileType === 'image' || 
                             (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
              const isVideo = file.fileType === 'video' || 
                             (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
              const fileName = file.name || file.title || 'Untitled';
              
              return (
                <div
                  key={file.fileId}
                  className="bg-neutral-900/60 border border-neutral-700 rounded-xl overflow-hidden hover:bg-neutral-800 transition-colors cursor-pointer group"
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
                  {/* Image/Video Preview Section */}
                  {(isImage || isVideo) && (
                    <div 
                      className="w-full h-48 bg-neutral-800 flex items-center justify-center relative overflow-hidden group"
                      onMouseEnter={async () => {
                        // For videos, start loading the video blob on hover for smooth playback
                        if (isVideo && file.publicToken && !videoBlobs.has(file.fileId)) {
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
                            console.warn('Failed to load video for preview:', err);
                          }
                        }
                      }}
                    >
                      {isVideo && videoBlobs.get(file.fileId) && videoPlaying.get(file.fileId) ? (
                        <video 
                          src={videoBlobs.get(file.fileId)!}
                          className="w-full h-full object-cover"
                          controls
                          autoPlay
                          muted
                          loop
                          onMouseLeave={() => {
                            setVideoPlaying(prev => {
                              const newMap = new Map(prev);
                              newMap.set(file.fileId, false);
                              return newMap;
                            });
                          }}
                        />
                      ) : thumbnails.get(file.fileId) ? (
                        <div 
                          className="relative w-full h-full cursor-pointer"
                          onClick={() => {
                            if (isVideo) {
                              setVideoPlaying(prev => {
                                const newMap = new Map(prev);
                                newMap.set(file.fileId, true);
                                return newMap;
                              });
                            }
                          }}
                        >
                          <img 
                            src={thumbnails.get(file.fileId)!} 
                            alt={fileName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to icon if thumbnail fails to load
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          {isVideo && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-black/50 rounded-full p-4">
                                <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : generatingThumbnails.has(file.fileId) ? (
                        <div className="flex flex-col items-center justify-center text-neutral-500">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2"></div>
                          <span className="text-xs">Generating thumbnail...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-neutral-500">
                          <ImageIcon className="h-12 w-12 mb-2" />
                          <span className="text-xs">Encrypted {isVideo ? 'Video' : 'Image'}</span>
                          <span className="text-xs text-neutral-600 mt-1">Decryption required</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="p-4">
                    {/* Header with rating */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate group-hover:text-blue-400 transition-colors">
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
                      <p className="text-text-secondary text-sm mb-3 line-clamp-2">{file.description}</p>
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
                      className="flex items-center space-x-2 text-xs text-text-secondary mb-3 hover:text-blue-400 transition-colors w-full text-left"
                    >
                      <User className="h-3 w-3" />
                      <span className="truncate">
                        {file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did || 'Unknown'}
                      </span>
                    </button>

                    {/* Tags */}
                    {(file.keywords || file.tags) && (file.keywords || file.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(file.keywords || file.tags || []).slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full"
                          >
                            #{tag}
                          </span>
                        ))}
                        {(file.keywords || file.tags || []).length > 3 && (
                          <span className="px-2 py-0.5 text-text-secondary text-xs">
                            +{(file.keywords || file.tags || []).length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Engagement Actions - Use FeedEngagementSidebar for consistency */}
                    <div 
                      className="pt-3 border-t border-neutral-700 relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end">
                        {(() => {
                          const fileProps = getFileProps(indexedFile);
                          return (
                            <FeedEngagementSidebar
                              file={fileProps.file}
                              isLiked={fileProps.isLiked}
                              onLike={() => handleLike(file.fileId)}
                              onComment={() => handleComment(indexedFile)}
                              onShare={() => handleShare(file.fileId)}
                              isOwner={fileProps.isOwner}
                              onCreatorClick={handleCreatorClick}
                              indexedFiles={stableIndexedFiles}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Media Viewer */}
        {viewingFile && (
          <MediaViewer
            file={viewingFile.file}
            blob={viewingFile.blob}
            url={viewingFile.url}
            onClose={() => {
              if (viewingFile.url) URL.revokeObjectURL(viewingFile.url);
              setViewingFile(null);
            }}
          />
        )}

        {/* Feed Browser Modal */}
        {showFeedBrowser && (
          <FeedBrowser
            feeds={feeds}
            onClose={() => setShowFeedBrowser(false)}
            onFeedClick={(feed) => {
              setShowFeedBrowser(false);
              setViewingBrandedFeed(feed);
            }}
            onCreateFeed={() => {
              setShowFeedBrowser(false);
              setShowCreateFeedModal(true);
            }}
          />
        )}

        {/* Create Feed Modal */}
        {showCreateFeedModal && (
          <CreateFeedModal
            onClose={() => setShowCreateFeedModal(false)}
            onFeedCreated={(feed) => {
              handleFeedCreated(feed);
              setShowCreateFeedModal(false);
            }}
          />
        )}

        {/* Add to Feed Modal */}
        {addingToFeedFile && (
          <AddToFeedModal
            file={addingToFeedFile}
            feeds={feeds}
            onClose={() => setAddingToFeedFile(null)}
            onAdded={(feedId) => {
              // Refresh files to show updated feed membership
              discoverFiles(undefined, true);
              setAddingToFeedFile(null);
            }}
          />
        )}

        {/* Settings Panel */}
        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Keyboard Shortcuts Panel */}
        {showShortcuts && (
          <KeyboardShortcuts
            onClose={() => setShowShortcuts(false)}
          />
        )}

        {/* Comment Modal - Render outside conditional views to ensure it works on all pages */}
        {commentingFile ? (
          <CommentModal
            key={commentingFile.metadata.fileId} // Force remount on file change
            file={commentingFile}
            onClose={() => {
              console.log('[App] CommentModal onClose called', { viewingCreatorId, viewMode });
              setCommentingFile(null);
            }}
          />
        ) : null}

        {/* Edit File Modal */}
        {editingFile && (
          <EditFileModal
            file={editingFile}
            onClose={() => setEditingFile(null)}
            onSave={(updatedFile) => {
              // Update the file in creatorFilesState
              setCreatorFilesState(prev => 
                prev.map(f => 
                  f.metadata.fileId === updatedFile.metadata.fileId ? updatedFile : f
                )
              );
              // Also update in indexedFiles if it exists there
              setIndexedFiles(prev =>
                prev.map(f =>
                  f.metadata.fileId === updatedFile.metadata.fileId ? updatedFile : f
                )
              );
              setEditingFile(null);
              success('File updated successfully!');
              // Refresh files from Google Drive if needed
              if (discoverFilesRef.current) {
                discoverFilesRef.current(undefined, true);
              }
            }}
          />
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <UploadModal
            onClose={() => setShowUploadModal(false)}
            onUploadComplete={() => {
              // Refresh files after upload
              discoverFiles(undefined, true);
            }}
          />
        )}

        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
      )}

      {/* Bottom Navigation Bar - Single instance, always visible on ALL screens */}
      <BottomNav
        activeTab={activeBottomTab}
        onTabChange={setActiveBottomTab}
        onHomeClick={() => {
              setActiveBottomTab('home');
          setViewMode('feed');
              setShowInbox(false);
              setShowSearch(false);
          setShowUploadModal(false);
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
        }}
        onSearchClick={() => {
              setShowSearch(true);
          setShowInbox(false);
          setShowUploadModal(false);
              setActiveBottomTab('search');
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
        }}
        onUploadClick={() => {
              setShowUploadModal(true);
          setShowInbox(false);
          setShowSearch(false);
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
              setActiveBottomTab('upload');
            }}
        onIndexClick={handleMeClick}
        onInboxClick={() => {
              setShowInbox(true);
          setShowSearch(false);
          setShowUploadModal(false);
              setActiveBottomTab('messages');
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
        }}
      />
    </div>
  );
}

export default App;

