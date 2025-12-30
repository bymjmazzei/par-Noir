/**
 * Aggregator Browser
 * Licensed aggregator application for discovering and viewing public encrypted content
 * Deployed at browse.parnoir.com
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Filter, File, Globe, Tag, Calendar, User, Download, RefreshCw, Lock, Unlock, Image as ImageIcon, X, Grid } from 'lucide-react';
import { LockButtonWithContext } from './components/LockButtonWithContext';
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
import { useViewportHeightCSS } from './hooks/useViewportHeight';
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
import { useAppContext } from './hooks/useAppContext';
import { DiscoveryPage } from './components/DiscoveryPage';
import { SearchResults } from './components/SearchResults';
import { CreatorFeedPage } from './components/CreatorFeedPage';
import { Inbox } from './components/Inbox';
import { saveToFeed, getSavedFeed } from './services/savedFeedService';
import { getUserProfile } from './services/profileService';
import { isNSFWContent } from './constants/contentRatings';
import { calculateMediaScaling, getContainerDimensions, type MediaDimensions } from './utils/mediaScaling';

// Shared types - importing from id-dashboard
// In production, these would come from a shared package

// Stable empty array reference to prevent unnecessary re-renders
const EMPTY_ARRAY: IndexedFile[] = [];

function App() {
  const { userState, setLocked, setUnlocked, updateDisplayName, getDisplayName } = useUserState();
  const { activeContext, setActiveContext, availableContexts, loadContexts, isLoading: isLoadingContexts } = useAppContext(userState.pnIdentifier);
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SCALABILITY: Pagination state for infinite scroll
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true); // Ref to track hasMore for infinite scroll observer
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 50;
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<MetadataFilters>({});
  const [viewingFile, setViewingFile] = useState<{ file: IndexedFile; blob: Blob; url: string } | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map()); // fileId -> thumbnail URL
  const [generatingThumbnails, setGeneratingThumbnails] = useState<Set<string>>(new Set()); // Track which thumbnails are being generated
  const [videoPlaying, setVideoPlaying] = useState<Map<string, boolean>>(new Map()); // Track which videos are playing
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(new Map()); // Store video URLs for playback
  const [mediaDimensions, setMediaDimensions] = useState<Map<string, MediaDimensions>>(new Map()); // Track media dimensions for scaling
  
  // Keep videoBlobsRef in sync with videoBlobs state
  useEffect(() => {
    videoBlobsRef.current = videoBlobs;
  }, [videoBlobs]);
  
  // Keep thumbnailsRef in sync with thumbnails state
  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);
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
  const discoverFilesRef = useRef<((filters?: MetadataFilters, forceRefresh?: boolean, page?: number, append?: boolean) => Promise<void>) | null>(null); // Ref for discoverFiles function
  const generateThumbnailsForImagesRef = useRef<((files: IndexedFile[]) => Promise<void>) | null>(null); // Ref for generateThumbnailsForImages function
  const isDiscoveringRef = useRef<boolean>(false); // Track if discoverFiles is currently running
  const discoverFilesTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track debounce timeout
  const isNavigatingToFileRef = useRef<boolean>(false); // Track if we're navigating to a specific file
  const lastNavigatedFileIdRef = useRef<string | null>(null); // Track the last file we navigated to
  const lastNavigatedFileIndexRef = useRef<number | null>(null); // Track the index we navigated to
  const loadBulkEngagementStatsRef = useRef<((fileIds: string[]) => Promise<void>) | null>(null); // Ref for loadBulkEngagementStats function
  const loadedEngagementFileIdsRef = useRef<Set<string>>(new Set()); // Track which fileIds have had engagement stats loaded
  const videoBlobsRef = useRef<Map<string, string>>(new Map()); // Ref to track videoBlobs without causing dependency issues
  const thumbnailsRef = useRef<Map<string, string>>(new Map()); // Ref to track thumbnails without causing dependency issues
  const loadingDisplayNameRef = useRef<Set<string>>(new Set()); // Track which user IDs are currently loading display names
  
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
              
              // Load display name from API (preferred) or use nickname as fallback
              // Add delay to avoid rate limiting when OAuth window opens
              setTimeout(async () => {
                try {
                  const profile = await getUserProfile(pnIdentifier);
                  if (profile.displayName) {
                    updateDisplayName(profile.displayName);
                  } else if (userInfo.nickname && !userState.preferences.displayName) {
                    // Fallback to nickname if no display name in profile
                    updateDisplayName(userInfo.nickname);
                  }
                } catch (error) {
                  // If API call fails, fallback to nickname
                  if (userInfo.nickname && !userState.preferences.displayName) {
                    updateDisplayName(userInfo.nickname);
                  }
                }
              }, 1000);
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
              
              // Load display name from API (preferred) or use nickname as fallback
              // Add delay to avoid rate limiting when OAuth window opens
              setTimeout(async () => {
                try {
                  const profile = await getUserProfile(userInfo.pn_identifier);
                  if (profile.displayName) {
                    updateDisplayName(profile.displayName);
                  } else if (userInfo.nickname && !userState.preferences.displayName) {
                    // Fallback to nickname if no display name in profile
                    updateDisplayName(userInfo.nickname);
                  }
                } catch (error) {
                  // If API call fails, fallback to nickname
                  if (userInfo.nickname && !userState.preferences.displayName) {
                    updateDisplayName(userInfo.nickname);
                  }
                }
              }, 1000);
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

  // MOBILE FIX: Use actual viewport height instead of 100vh to account for mobile browser UI
  const viewportHeightCSS = useViewportHeightCSS(true); // true = exclude bottom nav


  // Feed navigation hook
  const { feedHierarchy, getNextFeed, getPreviousFeed, getFeedIndex } = useFeedNavigation(
    feeds,
    userState.preferences.subscribedFeedIds
  );

  // Load user's own display name from API
  const loadUserDisplayName = useCallback(async (pnIdentifier: string) => {
    if (!pnIdentifier || pnIdentifier.startsWith('did:key:')) return;
    
    // Prevent duplicate simultaneous calls for the same user
    if (loadingDisplayNameRef.current.has(pnIdentifier)) {
      return;
    }
    
    loadingDisplayNameRef.current.add(pnIdentifier);
    
    try {
      const profile = await getUserProfile(pnIdentifier);
      if (profile.displayName) {
        updateDisplayName(profile.displayName);
      }
    } catch (error) {
      // Silently fail - profile may not exist yet
      console.debug('Failed to load user display name:', error);
    } finally {
      loadingDisplayNameRef.current.delete(pnIdentifier);
    }
  }, [updateDisplayName]);

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
        const pnId = session.pnIdentifier || session.did;
        setUnlocked(pnId);
        // Load display name from API (with delay to avoid rate limiting)
        if (pnId && !pnId.startsWith('did:key:')) {
          setTimeout(() => loadUserDisplayName(pnId), 500);
        }
      } else if (userState.pnIdentifier && !userState.preferences.displayName) {
        // User is unlocked but no display name loaded - load it from API
        loadUserDisplayName(userState.pnIdentifier);
      }
    } else if (session && PNOAuthService.isSessionValid(session) && session.did) {
      // If UI says locked but valid session exists, unlock the user
      console.log('🔐 Valid OAuth session found, unlocking user');
      // Use pN identifier from session if available, otherwise use DID
      const pnId = session.pnIdentifier || session.did;
      setUnlocked(pnId);
      // Load display name from API (with delay to avoid rate limiting)
      if (pnId && !pnId.startsWith('did:key:')) {
        setTimeout(() => loadUserDisplayName(pnId), 500);
      }
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
      } catch (error: any) {
        // Don't log 429 errors as errors - they're handled gracefully
        if (error?.message?.includes('429') || error?.status === 429) {
          console.warn('Rate limited when loading feeds, using empty list');
        } else {
        console.error('Failed to load feeds:', error);
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
            // If request fails, remove from loaded set so we can retry
            console.warn('Failed to load engagement stats, will retry:', error);
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
    // SCALABILITY: Reset pagination when feed changes
    setCurrentPage(0);
    setHasMore(true);
    hasMoreRef.current = true;
    
    discoverFilesTimeoutRef.current = setTimeout(() => {
      if (discoverFilesRef.current && !isDiscoveringRef.current) {
        discoverFilesRef.current(undefined, false, 0, false); // Reset to page 0
      }
    }, 500); // Increased delay to 500ms to reduce API calls
    
    return () => {
      if (discoverFilesTimeoutRef.current) {
        clearTimeout(discoverFilesTimeoutRef.current);
      }
    };
  }, [activeFeedId, userState.preferences.showNSFW]);

  // Reset feed index and pagination when feed changes (unless navigating to a specific file)
  useEffect(() => {
    // Don't reset if we're navigating to a specific file or if we just navigated to a file
    if (visibleFileId || isNavigatingToFileRef.current || lastNavigatedFileIdRef.current) return;
    setCurrentFeedIndex(0);
    // SCALABILITY: Reset pagination when feed changes
    setCurrentPage(0);
    setHasMore(true);
    hasMoreRef.current = true;
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
  const [isLoadingCreatorFiles, setIsLoadingCreatorFiles] = useState(false);
  
  // Create a stable key for indexedFilesMap based on fileIds (not array reference)
  // MUST be declared before any useEffect that uses it
  const indexedFilesKey = useMemo(() => {
    return indexedFiles.map(f => f.metadata.fileId).sort().join(',');
  }, [indexedFiles]);

  // Memoize filtered files by active feed
  // Helper function to normalize fileType based on file extension
  // This fixes cases where fileType is 'other' but should be 'image', 'video', etc.
  const normalizeFileType = (file: IndexedFile): string => {
    const fileType = file.metadata.fileType;
    const fileName = file.metadata.name || file.metadata.title || '';
    
    // If fileType is already correct, return it
    if (fileType === 'image' || fileType === 'video' || fileType === 'document' || fileType === 'text' || fileType === 'thought') {
      return fileType;
    }
    
    // Determine fileType from extension
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i)) {
      return 'image';
    }
    if (fileName.match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i)) {
      return 'video';
    }
    if (fileName.match(/\.(thought)$/i) || /^thought-\d+\.(thought|png)/i.test(fileName)) {
      return 'thought';
    }
    
    // Return original fileType if we can't determine from extension
    return fileType || 'other';
  };

  // Helper function to identify text posts (thoughts) - MUST be defined before filteredFilesByFeed
  // Use same detection logic as FullScreenFeed for consistency
  // NOTE: Thoughts now render as thumbnails - thumbnail files should NOT be detected as thoughts
  const isThought = (file: IndexedFile): boolean => {
    // CRITICAL: Exclude thumbnail files - they are just images, not thoughts
    const fileName = file.metadata.name || file.metadata.title || '';
    const isThumbnailFile = fileName.toLowerCase().startsWith('thumb_');
    if (isThumbnailFile) {
      return false; // Thumbnail files are images, not thoughts
    }
    
    // Normalize fileType first to ensure correct detection
    const normalizedFileType = normalizeFileType(file);
    
    // Check for textPost/thought data in multiple locations (same as FullScreenFeed)
    const hasTextPostData = !!(file.metadata as any).textPost || 
                           !!(file.metadata as any).thought ||
                           !!(file as any).textPost ||
                           !!(file as any).thought;
    
    // Check for fileType in multiple locations (use normalized fileType)
    const hasTextFileType = normalizedFileType === 'text' || 
                           normalizedFileType === 'thought' ||
                           file.metadata.fileType === 'text' ||
                           file.metadata.fileType === 'thought' ||
                           (file.metadata as any).fileType === 'text' ||
                           (file.metadata as any).fileType === 'thought';
    
    // Check for thought filename pattern (new .thought format or legacy .png format)
    // Also check originalName if available (file.name might be content, not filename)
    const thoughtFileName = fileName || 
                           (file.metadata as any).originalName ||
                           (file.metadata as any).name ||
                           '';
    const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(thoughtFileName);
    
    // IMPORTANT: If file has image/video extension, it's NOT a thought (unless it's thought-*.png)
    const hasMediaExtension = !isThoughtFile && (
      !!(fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mov|avi|webm|mkv|flv|wmv)$/i))
    );
    
    // Prioritize hasTextPostData and hasTextFileType first, but exclude media files
    return (hasTextPostData || hasTextFileType || isThoughtFile) && !hasMediaExtension;
  };

  // Helper function to check if a file is a collection
  const isCollection = (file: IndexedFile): boolean => {
    const collectionData = file.metadata?.collection;
    return file.metadata.fileType === 'collection' && 
           collectionData?.collectionFileIds && 
           Array.isArray(collectionData.collectionFileIds) &&
           collectionData.collectionFileIds.length > 0;
  };

  // REMOVED: isMediaOnlyFeed function - thoughts should appear in ALL feeds
  // The only place thoughts are excluded is the me page "media" tab, which handles it separately

  const filteredFilesByFeed = useMemo(() => {
    console.log('[DEBUG] filteredFilesByFeed computing', { activeFeedId, indexedFilesLength: indexedFiles.length, viewMode });
    
    // Build sets of fileIds to exclude (individual thought pages from multi-page thought collections)
    // Only filter out thoughts that are in thought collections (multi-page thoughts), not regular collections or single thoughts
    const thoughtThumbnailIdsInCollections = new Set<string>();
    const thoughtFileIdsInCollections = new Set<string>();
    
    // Find all thought collections and mark their constituent files for exclusion
    indexedFiles.forEach((file: IndexedFile) => {
      const isThoughtCollection = (file.metadata as any).isThoughtCollection === true;
      if (isThoughtCollection && file.metadata.collection?.collectionFileIds) {
        const collectionFileIds = file.metadata.collection.collectionFileIds;
        
        // For thought collections, collectionFileIds are thumbnail IDs
        collectionFileIds.forEach((thumbnailId: string) => {
          thoughtThumbnailIdsInCollections.add(thumbnailId);
          
          // Find the main thought file for this thumbnail (if it exists in indexedFiles)
          const thumbnailFile = indexedFiles.find(f => f.metadata.fileId === thumbnailId);
          if (thumbnailFile?.metadata.mainFileId) {
            thoughtFileIdsInCollections.add(thumbnailFile.metadata.mainFileId);
          }
        });
      }
    });
    
    const showNSFW = userState.preferences.showNSFW;
    const hasAgeZKP = userState.preferences.hasAgeZKP;
    const isOver18 = userState.preferences.isOver18;
    
    // Helper to check if file should be shown based on NSFW preference
    // LOCKED USERS: Never show NSFW content, period
    // UNLOCKED USERS: Only show NSFW if age-verified and enabled
    const shouldShowFile = (file: IndexedFile): boolean => {
      const isNSFW = isNSFWContent(file.metadata);
      
      // LOCKED USERS: Never show NSFW content, period
      if (!userState.isUnlocked && isNSFW) {
        return false;
      }
      
      // UNLOCKED USERS: Only show NSFW if age-verified and enabled
      if (isNSFW) {
        return hasAgeZKP && isOver18 && showNSFW;
      }
      
      // Show public (non-NSFW) content
      return true;
    };
    
    // Helper to check if file should be excluded (individual thought pages from multi-page thought collections)
    const shouldExcludeThoughtPage = (file: IndexedFile): boolean => {
      const fileType = file.metadata.fileType;
      
      // Exclude if fileType is 'thought-collection-thumbnail', 'thought-collection-page', or 'thought-collection'
      // These are the new types for thoughts that are part of collections
      if (fileType === 'thought-collection-thumbnail' || fileType === 'thought-collection-page' || fileType === 'thought-collection') {
        console.log(`[App] Excluding ${fileType} ${file.metadata.fileId} - collection thought`);
        return true;
      }
      
      // Fallback for existing data: check if in collections
      const fileId = file.metadata.fileId;
      if (thoughtThumbnailIdsInCollections.has(fileId) || thoughtFileIdsInCollections.has(fileId)) {
        console.log(`[App] Excluding thought ${fileId} - part of thought collection (fallback)`);
        return true;
      }
      
      return false;
    };

    if (activeFeedId === 'public') {
      // Public feed: ALWAYS filter out NSFW content unless user has it enabled
      // This ensures NSFW content never appears in public feed unless explicitly enabled
      // Also filter out individual thought pages from multi-page thought collections
      const filtered = indexedFiles.filter(file => shouldShowFile(file) && !shouldExcludeThoughtPage(file));
      console.log('[DEBUG] Public feed filtered', { activeFeedId, indexedFilesLength: indexedFiles.length, filteredLength: filtered.length });
      
      // Helper function to detect images - check fileType, name, title, mimeType, encodingFormat, and @type
      const isImageFile = (f: IndexedFile): boolean => {
        const fileType = f.metadata.fileType;
        const fileName = f.metadata.name || f.metadata.title || '';
        // Check both mimeType and encodingFormat (encodingFormat is the standard field in PublicMetadata)
        const mimeType = (f.metadata as any).mimeType || f.metadata.encodingFormat || '';
        // Check @type field (JSON-LD semantic web field)
        const atType = f.metadata['@type'];
        const isImageObject = Array.isArray(atType) 
          ? atType.some(t => String(t).toLowerCase().includes('image'))
          : String(atType || '').toLowerCase().includes('image');
        
        // Check if fileType is explicitly 'image'
        if (fileType === 'image') return true;
        
        // Check if @type indicates ImageObject
        if (isImageObject) return true;
        
        // Check if mimeType/encodingFormat indicates image
        if (mimeType.startsWith('image/')) return true;
        
        // Check if filename has image extension (check both name and title)
        const hasImageExt = !!(fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif)$/i));
        if (hasImageExt) return true;
        
        // If fileType is 'other' but has image extension, it's likely an image
        if (fileType === 'other' && hasImageExt) return true;
        
        return false;
      };
      
      // Debug logging for public feed (only in development)
      const imageFiles = filtered.filter(isImageFile);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Public Feed] ${filtered.length} files: ${imageFiles.length} images, ${filtered.filter(f => f.metadata.fileType === 'video').length} videos, ${filtered.filter(f => {
          const fileType = f.metadata.fileType;
          const hasTextPostData = !!(f.metadata as any).textPost || !!(f.metadata as any).thought;
          const hasTextFileType = fileType === 'text' || fileType === 'thought';
          const fileName = f.metadata.name || f.metadata.title || '';
          const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(fileName);
          return hasTextPostData || hasTextFileType || isThoughtFile;
        }).length} thoughts`);
      }
      
      return filtered;
    }
    if (activeFeedId === 'curated') {
      // Curated feed = all content EXCEPT blocked categories (negative filter)
      // Also respects subscribed feeds and subject filters for backward compatibility
      const blockedCategories = userState.preferences.blockedCategories || [];
      const subscribedFeedIds = userState.preferences.subscribedFeedIds || [];
      const subscribedSubjects = userState.preferences.subscribedSubjects || [];
      const blockedSubjects = userState.preferences.blockedSubjects || [];
      
      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Curated Feed] Filtering ${indexedFiles.length} files`);
      }
      
      return indexedFiles.filter(file => {
        // Exclude individual thought pages from multi-page thought collections
        if (shouldExcludeThoughtPage(file)) {
          return false;
        }
        
        // Check if file matches blocked categories
        // Check both feedCategories (array) and category (single string) fields
        const fileCategoriesArray = file.metadata.feedCategories || [];
        const fileCategorySingle = file.metadata.category;
        
        // Combine all possible category sources
        // Handle nested arrays by flattening (in case feedCategories contains arrays of arrays)
        const flattenedCategories = Array.isArray(fileCategoriesArray) 
          ? fileCategoriesArray.flat(Infinity) // Flatten nested arrays
          : [fileCategoriesArray];
        const allFileCategories = [
          ...flattenedCategories,
          ...(fileCategorySingle ? [fileCategorySingle] : [])
        ].filter(Boolean); // Remove any null/undefined values
        
        // Normalize categories for comparison
        const normalizedFileCategories = allFileCategories.map(cat => String(cat).toLowerCase().trim());
        const normalizedBlocked = blockedCategories.map(cat => String(cat).toLowerCase().trim());
        
        // Debug logging only in development
        if (process.env.NODE_ENV === 'development' && normalizedBlocked.length > 0 && normalizedFileCategories.some(cat => normalizedBlocked.includes(cat))) {
          console.log(`[Curated Feed] Filtered out file ${file.metadata.fileId} due to blocked category`);
        }
        
        const hasBlockedCategory = normalizedBlocked.length > 0 && 
          normalizedFileCategories.some(cat => normalizedBlocked.includes(cat));
        
        // Exclude if matches blocked category
        if (hasBlockedCategory) {
          return false;
        }
        
        // Subject filtering (backward compatibility)
        const fileSubjects = (file.metadata.subjects || []).map(s => s.toLowerCase().trim());
        
        // If user has subscribed subjects, only show matching content
        let matchesSubject = true;
        if (subscribedSubjects.length > 0) {
          const normalizedSubscribed = subscribedSubjects.map(s => s.toLowerCase().trim());
          matchesSubject = fileSubjects.some(subject => 
            normalizedSubscribed.includes(subject)
          );
        }
        
        // Always exclude blocked subjects
        let hasBlockedSubject = false;
        if (blockedSubjects.length > 0) {
          const normalizedBlocked = blockedSubjects.map(s => s.toLowerCase().trim());
          hasBlockedSubject = fileSubjects.some(subject => 
            normalizedBlocked.includes(subject)
          );
        }
        
        // If user has subscribed subjects, must match those
        if (subscribedSubjects.length > 0 && !matchesSubject) return false;
        if (hasBlockedSubject) return false;
        
        // Check if file is in a subscribed feed (backward compatibility)
        if (subscribedFeedIds.length > 0) {
          const inSubscribedFeed = file.metadata.feedIds?.some(feedId => subscribedFeedIds.includes(feedId));
          if (inSubscribedFeed) return shouldShowFile(file); // Show subscribed feed content
        }
        
        // Default: show all content (negative filter - only exclude blocked)
        // Filter by NSFW preference
        return shouldShowFile(file);
      });
    }
    if (activeFeedId === 'discovery') {
      // Discovery page - return empty for now (will be implemented in Phase 3)
      return [];
    }
    
    // Handle niche category feeds (virtual feeds based on categories)
    if (activeFeedId.startsWith('niche-')) {
      const categoryId = activeFeedId.replace('niche-', '');
      let filtered = indexedFiles.filter(file => {
        // Exclude individual thought pages from multi-page thought collections
        if (shouldExcludeThoughtPage(file)) {
          return false;
        }
        
        // Check if file has this category in its feedCategories
        // Handle nested arrays by flattening (in case feedCategories contains arrays of arrays)
        const fileCategories = file.metadata.feedCategories || [];
        const flattenedFileCategories = Array.isArray(fileCategories) 
          ? fileCategories.flat(Infinity) // Flatten nested arrays
          : [fileCategories];
        if (flattenedFileCategories.includes(categoryId as any)) {
          return true;
        }
        // Also check if file is in a feed with this category
        const fileFeedIds = file.metadata.feedIds || [];
        const fileFeeds = feeds.filter(f => fileFeedIds.includes(f.feedId));
        return fileFeeds.some(feed => feed.feedCategory === categoryId);
      });
      
      // ALWAYS filter by NSFW preference (for both unlocked and locked users)
      filtered = filtered.filter(shouldShowFile);
      
      // Thoughts should appear in all niche feeds - no filtering needed
      return filtered;
    }
    
    // Individual feed: ALWAYS filter by NSFW preference
    // Also filter out individual thought pages from multi-page thought collections
    let filtered = indexedFiles.filter(file => {
      if (!file.metadata.feedIds?.includes(activeFeedId)) {
        return false;
      }
      if (shouldExcludeThoughtPage(file)) {
        return false;
      }
      return true;
    });
    filtered = filtered.filter(shouldShowFile);
    
    // Thoughts should appear in all feeds - no filtering needed
    // The only place thoughts are excluded is the me page "media" tab, which handles it separately
    console.log('[DEBUG] filteredFilesByFeed result', { activeFeedId, resultLength: filtered.length, indexedFilesLength: indexedFiles.length });
    return filtered;
  }, [indexedFiles, activeFeedId, userState.preferences.subscribedFeedIds, userState.preferences.blockedCategories, userState.preferences.subscribedSubjects, userState.preferences.blockedSubjects, userState.preferences.showNSFW, userState.preferences.hasAgeZKP, userState.preferences.isOver18, userState.isUnlocked, feeds]);

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

  // Auto-refresh metadata when Google Drive token becomes available
  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem('google_drive_token');
      if (token) {
        console.log('✅ Google Drive token found - will scan pN folders');
        if (discoverFilesRef.current) {
          discoverFilesRef.current(undefined, false, 0, false); // Reset to page 0
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
          discoverFilesRef.current(undefined, false, 0, false); // Reset to page 0
        }
      }
    });

    return () => {
      window.removeEventListener('storage', checkToken);
    };
  }, []);

  const discoverFiles = useCallback(async (
    searchFilters?: MetadataFilters, 
    forceRefresh: boolean = false,
    page: number = 0,
    append: boolean = false
  ) => {
    // Prevent duplicate simultaneous calls (unless appending for pagination)
    if (isDiscoveringRef.current && !forceRefresh && !append) {
      console.log('⏸️ Discover files already in progress, skipping duplicate call');
      return;
    }
    
    try {
      isDiscoveringRef.current = true;
      if (!append) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);
      
      // No Google Drive connection needed - just query central aggregator API
      await metadataIndexService.initialize();
      
      // Build filters with rating preferences and feed filtering
      // NOTE: 'curated', 'discovery', and 'niche-*' are virtual feeds - don't filter by feedId for these
      // They are filtered client-side in filteredFilesByFeed
      const isVirtualFeed = activeFeedId === 'public' || 
                            activeFeedId === 'curated' || 
                            activeFeedId === 'discovery';
      const isNicheCategoryFeed = activeFeedId.startsWith('niche-');
      
      const finalFilters: MetadataFilters & { limit?: number; offset?: number } = {
        ...filters,
        ...searchFilters,
        ...(searchQuery ? { tags: searchQuery.split(',').map(t => t.trim()).filter(Boolean) } : {}),
        // SCALABILITY: Add pagination parameters
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        // DON'T apply rating filter to public feed - public feed shows all public files
        // Only apply rating filter to non-public feeds (but not virtual feeds)
        // NSFW filtering is handled in filteredFilesByFeed based on showNSFW preference
        // No need to filter here at the API level
        // Filter by active feed (but not for virtual feeds)
        // For niche category feeds, filter by feedCategory instead of feedId
        ...(isVirtualFeed
          ? {} 
          : isNicheCategoryFeed
          ? { feedCategory: activeFeedId.replace('niche-', '') as any }
          : { feedId: activeFeedId })
      };
      
      // Discover public files from all users (with pagination support)
      const publicFilesResult = await metadataIndexService.discoverFiles(finalFilters, forceRefresh);
      
      // Handle paginated response (could be array for backward compat or object with pagination info)
      const publicFiles = Array.isArray(publicFilesResult) 
        ? publicFilesResult 
        : publicFilesResult.files;
      console.log('[DEBUG] discoverFiles API result', { activeFeedId, publicFilesLength: publicFiles.length, isArray: Array.isArray(publicFilesResult), finalFilters });
      const paginationInfo = Array.isArray(publicFilesResult)
        ? { total: publicFiles.length, hasMore: false }
        : { total: publicFilesResult.total, hasMore: publicFilesResult.hasMore };
      
      // If user has age ZKP, is over 18, AND has NSFW enabled, also load NSFW index
      let nsfwFiles: IndexedFile[] = [];
      if (userState.preferences.hasAgeZKP && userState.preferences.isOver18 && userState.preferences.showNSFW) {
        try {
          const { CentralMetadataAggregator } = await import('./services/storage/CentralMetadataAggregator');
          const nsfwResult = await CentralMetadataAggregator.fetchNSFWIndex({
            tags: finalFilters?.tags,
            fileType: finalFilters?.fileType,
            authorDid: finalFilters?.authorDid,
            limit: PAGE_SIZE,      // SCALABILITY: Pagination support
            offset: page * PAGE_SIZE // SCALABILITY: Pagination support
          }, forceRefresh);
          
          // Handle paginated response
          const nsfwEntries = nsfwResult.files || [];
          
          // Transform NSFW entries to IndexedFile format (same as public files)
          nsfwFiles = nsfwEntries
            .filter((entry: any) => {
              const metadata = entry.metadata || {};
              const isPublic = metadata.isPublic;
              const hasPublicToken = metadata.publicToken != null;
              return (isPublic !== false || hasPublicToken) && metadata.isNSFW === true;
            })
            .map((entry: any) => {
              const pnId = entry.pnIdentifier;
              const normalizedPnId = pnId && pnId.startsWith('pn-') ? pnId.substring(3) : pnId;
              const metadata = entry.metadata || {};
              
              return {
                metadata: {
                  ...metadata,
                  textPost: metadata.textPost || metadata.thought,
                  thought: metadata.thought || metadata.textPost,
                  creatorId: normalizedPnId || metadata.creatorId,
                  publicToken: entry.publicToken || metadata.publicToken
                },
                thumbnail: metadata.thumbnail,
                publicToken: entry.publicToken || metadata.publicToken,
                pnIdentifier: entry.pnIdentifier || normalizedPnId
              };
            });
          
          // Removed verbose logging
        } catch (nsfwError) {
          console.warn('Failed to fetch NSFW index:', nsfwError);
          // Continue with public files only if NSFW fetch fails
        }
      }
      
      // Merge public and NSFW files, deduplicate by fileId
      const allFilesMap = new Map<string, IndexedFile>();
      
      // Add public files first
      for (const file of publicFiles) {
        allFilesMap.set(file.metadata.fileId, file);
      }
      
      // Add NSFW files (will override public if same fileId, but shouldn't happen)
      for (const file of nsfwFiles) {
        if (!allFilesMap.has(file.metadata.fileId)) {
          allFilesMap.set(file.metadata.fileId, file);
        }
      }
      
      // Convert back to array, sorted by uploadDate (newest first)
      const discoveredFiles = Array.from(allFilesMap.values()).sort((a, b) => {
        const aDate = new Date(a.metadata.uploadDate || 0).getTime();
        const bDate = new Date(b.metadata.uploadDate || 0).getTime();
        return bDate - aDate;
      });
      
      // SCALABILITY: Handle pagination - append or replace based on page number
      setIndexedFiles(prev => {
        const result = page === 0 || !append
          ? discoveredFiles
          : (() => {
              const existingIds = new Set(prev.map(f => f.metadata.fileId));
              const newFiles = discoveredFiles.filter(f => !existingIds.has(f.metadata.fileId));
              return [...prev, ...newFiles];
            })();
        console.log('[DEBUG] setIndexedFiles', { activeFeedId, discoveredFilesLength: discoveredFiles.length, prevLength: prev.length, resultLength: result.length, page, append });
        return result;
      });
      
      // Update pagination state
      setHasMore(paginationInfo.hasMore);
      hasMoreRef.current = paginationInfo.hasMore; // Update ref as well
      setCurrentPage(page);
      
      // Removed verbose logging - only log errors
      
      // Generate thumbnails for image files (only for newly loaded files)
      if (generateThumbnailsForImagesRef.current) {
        const filesToThumbnail = page === 0 || !append 
          ? discoveredFiles 
          : discoveredFiles.filter(f => !indexedFiles.some(existing => existing.metadata.fileId === f.metadata.fileId));
        generateThumbnailsForImagesRef.current(filesToThumbnail);
      }
      
      // Pre-load video blobs for feed mode (if in feed mode) - only for newly loaded files
      const currentViewMode = viewMode || 'grid';
      if (currentViewMode === 'feed') {
        const filesToPreload = page === 0 || !append 
          ? discoveredFiles 
          : discoveredFiles.filter(f => !indexedFiles.some(existing => existing.metadata.fileId === f.metadata.fileId));
        for (const indexedFile of filesToPreload) {
          const file = indexedFile.metadata;
          const isVideo = file.fileType === 'video' || 
                         !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
          if (isVideo && file.publicToken && !videoBlobsRef.current.has(file.fileId)) {
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
      setIsLoadingMore(false);
      isDiscoveringRef.current = false;
    }
  }, [filters, searchQuery, userState.preferences.showNSFW, activeFeedId, viewMode, indexedFiles]);
  
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
      discoverFilesRef.current(undefined, false, 0, false); // Initial load - page 0
    }
  }, []);


  const handleSearch = () => {
    setCurrentPage(0); // SCALABILITY: Reset pagination on search
    setHasMore(true);
    hasMoreRef.current = true;
    discoverFiles(undefined, false, 0, false);
  };

  const handleFilterChange = (key: keyof MetadataFilters, value: any) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined
    };
    setFilters(newFilters);
    setCurrentPage(0); // SCALABILITY: Reset pagination on filter change
    setHasMore(true);
    hasMoreRef.current = true;
    discoverFiles(newFilters, false, 0, false);
  };

  // Generate thumbnails for image and video files by decrypting and resizing/extracting frames
  const generateThumbnailsForImages = async (files: IndexedFile[]) => {
    for (const indexedFile of files) {
      const file = indexedFile.metadata;
      const isImage = file.fileType === 'image' || 
                     !!(file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
      const isVideo = file.fileType === 'video' || 
                     !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
      
      // Skip if not an image/video, no publicToken, or already has thumbnail/generating
      // Validate publicToken exists and is not empty
      const hasValidToken = file.publicToken && 
                            typeof file.publicToken === 'string' && 
                            file.publicToken.trim().length > 0;
      
      // CRITICAL: Skip if thumbnailFileId exists - we should use the thumbnail file, not generate from full image
      // This prevents showing both the thumbnail file AND a generated thumbnail from the full image
      const hasThumbnailFile = !!file.thumbnailFileId;
      
      // CRITICAL: Skip if this IS a thumbnail file (name starts with thumb_)
      // Thumbnail files are already thumbnails - don't generate thumbnails from thumbnails
      const fileName = (file.name || file.title || '').toLowerCase();
      const isThumbnailFile = fileName.startsWith('thumb_');
      
      if ((!isImage && !isVideo) || !hasValidToken || thumbnailsRef.current.has(file.fileId) || generatingThumbnails.has(file.fileId) || hasThumbnailFile || isThumbnailFile) {
        if (hasValidToken === false && (isImage || isVideo)) {
          console.warn(`⚠️ [Feed] Skipping ${file.fileId} - missing or invalid publicToken:`, {
            fileId: file.fileId,
            hasPublicToken: !!file.publicToken,
            publicTokenType: typeof file.publicToken,
            publicTokenLength: file.publicToken ? String(file.publicToken).length : 0
          });
        }
        if ((hasThumbnailFile || isThumbnailFile) && (isImage || isVideo)) {
          // Silently skip - thumbnail file exists or this IS a thumbnail file, FullScreenFeed will load it directly
          continue;
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
  
  // Cleanup thumbnails for deleted files
  const cleanupThumbnailsForFiles = useCallback((fileIds: string[]) => {
    setThumbnails(prev => {
      const newMap = new Map(prev);
      fileIds.forEach(fileId => {
        const thumbnailUrl = newMap.get(fileId);
        if (thumbnailUrl) {
          // Only revoke blob URLs (start with "blob:"), not data URLs
          if (thumbnailUrl.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(thumbnailUrl);
            } catch (err) {
              console.warn(`Failed to revoke thumbnail URL for ${fileId}:`, err);
            }
          }
          newMap.delete(fileId);
        }
      });
      return newMap;
    });
  }, []);

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
    
    // If viewing own profile and unlocked, use authenticated endpoint to get ALL files (public + private)
    if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked) {
      const loadUserFiles = async () => {
        setIsLoadingCreatorFiles(true);
        try {
          // Use authenticated endpoint to get ALL files (public + private) for the user
          const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
          const { PNOAuthService } = await import('./services/pnOAuthService');
          const accessToken = await PNOAuthService.getValidAccessToken();
          
          if (!accessToken) {
            console.warn('⚠️ No access token available for authenticated file fetch');
            return;
          }

          const response = await fetch(
            `${apiEndpoint}/api/aggregator/my-files`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );

          let apiFiles: IndexedFile[] = [];
          if (response.ok) {
            const data = await response.json();
            if (data.files && Array.isArray(data.files)) {
              // The /api/aggregator/my-files endpoint already returns all files (public + private) for the authenticated user
              // No need to filter - the server already filtered by pnIdentifier
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Me Page] Loaded ${data.files.length} files for user ${viewingCreatorId}`);
              }
              
              // Convert entries to IndexedFile format
              apiFiles = data.files.map((entry: any) => {
                const metadata = entry.metadata || {};
                return {
                  metadata: {
                    ...metadata,
                    fileId: entry.fileId || metadata.fileId,
                    // FIX: Ensure textPost and thought are preserved for thoughts
                    textPost: metadata.textPost || metadata.thought || undefined,
                    thought: metadata.thought || metadata.textPost || undefined,
                    // Preserve collection data for collections
                    // IMPORTANT: Don't use || undefined - preserve null/empty objects if they exist
                    collection: metadata.collection !== undefined ? metadata.collection : undefined,
                    // Ensure owner info is preserved
                    creator: metadata.creator || {
                      identifier: { value: entry.pnIdentifier || viewingCreatorId }
                    },
                    creatorId: entry.pnIdentifier || metadata.creatorId || viewingCreatorId,
                    // Also check author field for legacy compatibility
                    author: metadata.author || {
                      did: entry.pnIdentifier || viewingCreatorId
                    }
                  },
                  // Preserve pnIdentifier from API response
                  pnIdentifier: entry.pnIdentifier
                } as IndexedFile;
              });
            }
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn(`⚠️ API returned ${response.status} for user files: ${errorText}, falling back to public index`);
          }

          // Also get files from already-loaded public index (in case API missed some)
          const normalizeIdentifier = (id: string | undefined | null): string => {
            if (!id) return '';
            const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
            return cleaned.trim().toLowerCase();
          };
          const normalizedViewingId = normalizeIdentifier(viewingCreatorId);
          const publicIndexFiles = indexedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId ||
                                (f as any).pnIdentifier;
            const normalizedOwnerId = normalizeIdentifier(fileOwnerId);
            return normalizedOwnerId === normalizedViewingId;
          });
          
          // Combine and deduplicate by fileId
          const combinedFiles = Array.from(
            new Map([...apiFiles, ...publicIndexFiles]
              .map(f => [f.metadata.fileId, f])).values()
          );
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Me Page] Combined ${combinedFiles.length} files (${apiFiles.length} API + ${publicIndexFiles.length} index)`);
          }
          setCreatorFilesState(combinedFiles);
        } catch (error) {
          console.error('Failed to load user files from API, falling back to public index:', error);
          // Fallback to public index
          const normalizeIdentifier = (id: string | undefined | null): string => {
            if (!id) return '';
            const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
            return cleaned.trim().toLowerCase();
          };
          const normalizedViewingId = normalizeIdentifier(viewingCreatorId);
          const filtered = indexedFiles.filter(f => {
            const fileOwnerId = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId ||
                                (f as any).pnIdentifier;
            const normalizedOwnerId = normalizeIdentifier(fileOwnerId);
            return normalizedOwnerId === normalizedViewingId;
          });
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Me Page] Fallback: Found ${filtered.length} files from public index for ${viewingCreatorId}`);
          }
          setCreatorFilesState(filtered);
        } finally {
          setIsLoadingCreatorFiles(false);
        }
      };

      loadUserFiles();
    } else {
      // For other creators (or when not logged in), load from public API
      const loadPublicCreatorFiles = async () => {
        setIsLoadingCreatorFiles(true);
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

          if (process.env.NODE_ENV === 'development') {
            console.log(`[Me Page] Loaded ${combinedFiles.length} files for creator ${viewingCreatorId}`);
          }
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
        } finally {
          setIsLoadingCreatorFiles(false);
        }
      };

      loadPublicCreatorFiles();
    }
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked, indexedFilesKey]);

  // Load user's liked and commented files when viewing own index
  const [userLikedFiles, setUserLikedFiles] = useState<IndexedFile[]>([]);
  const [userCommentedFiles, setUserCommentedFiles] = useState<IndexedFile[]>([]);
  const [connectionsFiles, setConnectionsFiles] = useState<IndexedFile[]>([]);
  const [connectionsList, setConnectionsList] = useState<Array<{ connectionId: string; userDid: string; status: string; createdAt: string; acceptedAt?: string }>>([]);
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
      
      // Prevent refetching if we just fetched for this user recently (within 30 seconds)
      if (lastSavedFeedFetchRef.current?.userDid === userState.pnIdentifier) {
        const timeSinceLastFetch = Date.now() - lastSavedFeedFetchRef.current.timestamp;
        if (timeSinceLastFetch < 30000) {
          return; // Too soon to refetch (increased from 5 to 30 seconds)
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
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Me Page] Engagement: ${likedFileIds.length} liked, ${commentedFileIds.length} commented`);
          }
          
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
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Me Page] Creator engagement: ${combinedLiked.length} liked, ${combinedCommented.length} commented`);
            }
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

  // Load connections list when viewing own index
  useEffect(() => {
    if (viewingCreatorId === userState.pnIdentifier && userState.pnIdentifier) {
      (async () => {
        try {
          const { getConnections } = await import('./services/connectionService');
          console.log(`[App] Loading connections for: ${userState.pnIdentifier}`);
          const connections = await getConnections(userState.pnIdentifier);
          console.log(`[App] Loaded ${connections.length} connections`);
          
          // Store the connections list (not posts)
          setConnectionsList(connections);
        } catch (error) {
          console.error('Failed to load connections:', error);
          setConnectionsList([]);
        }
      })();
    } else {
      setConnectionsList([]);
    }
  }, [viewingCreatorId, userState.pnIdentifier]);

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
      // Reset to index 0 on initial load only if files are stabilized
      if (viewingCreatorId && filesStabilizedRef.current && currentFeedIndex !== 0 && filteredMeFilesMemo.length > 0) {
        setCurrentFeedIndex(0);
      }
      return;
    }
    
    // If mePageTab changed but we're not navigating to a file, don't run the navigation logic
    // This prevents flickering when user manually changes tabs
    if (!isNavigatingToFileRef.current && mePageTab !== prevMePageTabRef.current) {
      // User manually changed tab - don't interfere
      return;
    }
    
    // Mark that we're navigating to a file
    isNavigatingToFileRef.current = true;
    
    // Helper function to find and set file index
    const findAndSetFileIndex = () => {
      // If user manually changed tab (not navigating to a file), don't auto-switch tabs
      if (!isNavigatingToFileRef.current && !visibleFileId) {
        return false;
      }
      
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
            // Only show images and videos (exclude thoughts)
            currentFilteredMeFiles = currentCreatorFiles.filter(f => isMedia(f));
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
            // Only show posts the user has commented on (excluding their own posts)
            currentFilteredMeFiles = userCommentedFiles.filter(f => {
              const fileOwnerId = f.metadata.creator?.identifier?.value || 
                   f.metadata.creator?.["@id"] || 
                   f.metadata.author?.did ||
                   f.metadata.creatorId ||
                   (f as any).pnIdentifier; // Fallback to pnIdentifier if available
              
              // Normalize both IDs by removing "pn-" prefix and converting to lowercase
              const normalizeId = (id: string | undefined | null): string => {
                if (!id) return '';
                const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
                return cleaned.trim().toLowerCase();
              };
              
              const normalizedOwnerId = normalizeId(fileOwnerId);
              const normalizedViewingId = normalizeId(viewingCreatorId);
              
              // Exclude own posts - only show posts from other creators that user commented on
              const isNotOwnPost = normalizedOwnerId !== normalizedViewingId;
              return isNotOwnPost;
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
            // Only show images and videos (exclude thoughts)
            currentFilteredMeFiles = currentCreatorFiles.filter(f => isMedia(f));
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
      
      // Apply top post pinning logic to match filteredMeFilesMemo
      if ((mePageTab === 'all' || mePageTab === 'media' || mePageTab === 'thoughts') && currentFilteredMeFiles.length > 0) {
        const topPostIndex = currentFilteredMeFiles.findIndex(f => f.metadata.isTopPost === true);
        if (topPostIndex > 0) {
          const topPost = currentFilteredMeFiles[topPostIndex];
          currentFilteredMeFiles = [topPost, ...currentFilteredMeFiles.filter((_, i) => i !== topPostIndex)];
        }
      }
      
      // First, check if file is in current filteredMeFiles
      if (currentFilteredMeFiles.length > 0) {
        const fileIndex = currentFilteredMeFiles.findIndex(f => f.metadata.fileId === visibleFileId);
        if (fileIndex !== -1) {
          // Only update if index actually changed to prevent unnecessary scrolling
          if (currentFeedIndex !== fileIndex) {
            setCurrentFeedIndex(fileIndex);
          }
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
      // BUT: Only auto-switch tabs if we're navigating to a file (isNavigatingToFileRef), not if user manually changed tabs
      if (!isNavigatingToFileRef.current || !visibleFileId) {
        return false; // User manually changed tab or no file to navigate to - don't auto-switch
      }
      
      // Check thoughts tab first (if not already on thoughts)
      if (mePageTab !== 'thoughts' && currentCreatorFiles.length > 0) {
        const thoughtsFiles = currentCreatorFiles.filter(f => isThought(f));
        const thoughtsIndex = thoughtsFiles.findIndex(f => f.metadata.fileId === visibleFileId);
        if (thoughtsIndex !== -1) {
          setMePageTab('thoughts');
          if (currentFeedIndex !== thoughtsIndex) {
            setCurrentFeedIndex(thoughtsIndex);
          }
          lastNavigatedFileIdRef.current = visibleFileId;
          lastNavigatedFileIndexRef.current = thoughtsIndex;
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
      
      // Check media tab (currentCreatorFiles)
      if (currentCreatorFiles.length > 0) {
        // Apply top post pinning for media tab
        let mediaFiles = [...currentCreatorFiles];
        const topPostIndex = mediaFiles.findIndex(f => f.metadata.isTopPost === true);
        if (topPostIndex > 0) {
          const topPost = mediaFiles[topPostIndex];
          mediaFiles = [topPost, ...mediaFiles.filter((_, i) => i !== topPostIndex)];
        }
        
        const mediaIndex = mediaFiles.findIndex(f => f.metadata.fileId === visibleFileId);
        if (mediaIndex !== -1) {
          setMePageTab('media');
          // Only update if index actually changed
          if (currentFeedIndex !== mediaIndex) {
            setCurrentFeedIndex(mediaIndex);
          }
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
      
      // Apply top post pinning for 'all' tab
      let allFilesPinned = [...allFiles];
      const topPostIndexAll = allFilesPinned.findIndex(f => f.metadata.isTopPost === true);
      if (topPostIndexAll > 0) {
        const topPost = allFilesPinned[topPostIndexAll];
        allFilesPinned = [topPost, ...allFilesPinned.filter((_, i) => i !== topPostIndexAll)];
      }
      
      if (allFilesPinned.length > 0) {
        const allIndex = allFilesPinned.findIndex(f => f.metadata.fileId === visibleFileId);
        if (allIndex !== -1) {
          setMePageTab('all');
          // Only update if index actually changed
          if (currentFeedIndex !== allIndex) {
            setCurrentFeedIndex(allIndex);
          }
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
    // Note: currentFeedIndex is intentionally NOT in dependencies to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFileId, viewingCreatorId, mePageTab, creatorFilesState, userState.pnIdentifier, userState.isUnlocked, userLikedFiles, userCommentedFiles, viewedUserLikedFiles, viewedUserCommentedFiles, savedFiles]);

  // Helper function to check if a file is media (image or video)
  const isMedia = (file: IndexedFile): boolean => {
    // Check if it's a thought first - if so, it's not media
    const thoughtCheck = isThought(file);
    if (thoughtCheck) {
      return false; // Thoughts are not media
    }
    
    // Normalize fileType based on extension - this fixes 'other' types
    const normalizedFileType = normalizeFileType(file);
    const fileName = file.metadata.name || file.metadata.title || '';
    
    // Check for images using normalized fileType
    const isImage = normalizedFileType === 'image' || 
                   !!(fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i));
    
    // Check for videos using normalized fileType
    const isVideo = normalizedFileType === 'video' || 
                   !!(fileName.match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i));
    
    const result = isImage || isVideo;
    
    // Debug logging for files that should be media but aren't detected
    if (!result && (normalizedFileType === 'image' || normalizedFileType === 'video' || !!fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mov|avi|webm)$/i))) {
      console.warn(`[App] File not detected as media:`, {
        fileId: file.metadata.fileId,
        originalFileType: file.metadata.fileType,
        normalizedFileType,
        fileName,
        isThought: thoughtCheck,
        isImage,
        isVideo
      });
    }
    
    return result;
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
          // Combine all files - show everything that is either media OR thoughts (or both)
          const allFiles = Array.from(
            new Map([...creatorFiles, ...userLikedFiles, ...userCommentedFiles]
              .map(f => [f.metadata.fileId, f])).values()
          );
          // Show all files that are either media OR thoughts
          filtered = allFiles.filter(f => {
            const isMediaFile = isMedia(f);
            const isThoughtFile = isThought(f);
            return isMediaFile || isThoughtFile;
          });
          
          // Debug logging for me page "all" tab (only in development)
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Me Page] Filtered ${filtered.length} of ${allFiles.length} files`);
          }
          break;
        case 'media':
          // Only show images and videos (exclude thoughts)
          filtered = creatorFiles.filter(f => isMedia(f));
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
          // Only show posts the user has commented on (excluding their own posts)
          filtered = userCommentedFiles.filter(f => {
            // Look up the full file from indexedFilesMap to get pnIdentifier
            const fullFile = indexedFilesMap.get(f.metadata.fileId) || f;
            
            // Prioritize pnIdentifier first, then check other fields but skip public keys
            // Public keys start with "MII" (base64 encoded RSA public key header)
            const isPublicKey = (id: string | undefined | null): boolean => {
              if (!id) return false;
              const trimmed = id.trim();
              return trimmed.startsWith('MII') || trimmed.length > 100; // Public keys are long base64 strings
            };
            
            // Try to get pnIdentifier first (it's on the file object, not in metadata)
            let fileOwnerId = (fullFile as any).pnIdentifier || (f as any).pnIdentifier;
            
            // If no pnIdentifier, try other fields but skip public keys
            if (!fileOwnerId) {
              const candidate = f.metadata.creator?.identifier?.value || 
                                f.metadata.creator?.["@id"] || 
                                f.metadata.author?.did ||
                                f.metadata.creatorId;
              
              // Only use if it's not a public key
              if (candidate && !isPublicKey(candidate)) {
                fileOwnerId = candidate;
              }
            }
            
            // Normalize both IDs by removing "pn-" prefix and converting to lowercase
            const normalizeId = (id: string | undefined | null): string => {
              if (!id) return '';
              const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
              return cleaned.trim().toLowerCase();
            };
            
            const normalizedOwnerId = normalizeId(fileOwnerId);
            const normalizedViewingId = normalizeId(viewingCreatorId!);
            
            // Exclude own posts - only show posts from other creators that user commented on
            const isNotOwnPost = normalizedOwnerId !== normalizedViewingId;
            return isNotOwnPost;
          });
          break;
        case 'saved':
          filtered = savedFiles;
          break;
          case 'connections':
            // Connections tab shows a list of users, not posts
            // Return empty array - we'll render connections list separately
            filtered = [];
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
          // Combine all files - show everything that is either media OR thoughts (or both)
          const allFilesOther = Array.from(
            new Map([...creatorFiles, ...viewedUserLikedFiles, ...viewedUserCommentedFiles]
              .map(f => [f.metadata.fileId, f])).values()
          );
          // Show all files that are either media OR thoughts
          filtered = allFilesOther.filter(f => {
            return isMedia(f) || isThought(f);
          });
          break;
        case 'media':
          // Only show images and videos (exclude thoughts)
          filtered = creatorFiles.filter(f => isMedia(f));
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
    
    // Don't inject cover into feed array - it will be shown as empty state instead
    return filtered;
  }, [isOwnIndex, mePageTab, creatorFiles, userLikedFiles, userCommentedFiles, savedFiles, connectionsFiles, viewedUserLikedFiles, viewedUserCommentedFiles, viewingCreatorId, indexedFilesMap]);
  
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
      if (process.env.NODE_ENV === 'development' && (countChanged || creatorChanged)) {
        console.log(`[Me Page] ${currentCount} files${isOwnIndex ? ` (tab: ${mePageTab})` : ''}`);
      }
    }
  }, [viewingCreatorId, isOwnIndex, mePageTab]);

  const filteredMeFiles = filteredMeFilesMemo;

  // Track if files are still loading to prevent glitchy scrolling
  // Must be after filteredMeFilesMemo is defined to avoid TDZ error
  const filesStabilizedRef = useRef<boolean>(false);
  const prevFilteredMeFilesLengthRef = useRef<number>(0);
  
  useEffect(() => {
    // Mark files as stabilized when the array length stops changing
    if (filteredMeFilesMemo.length !== prevFilteredMeFilesLengthRef.current) {
      filesStabilizedRef.current = false;
      prevFilteredMeFilesLengthRef.current = filteredMeFilesMemo.length;
      // Wait for array to stabilize
      const stabilizeTimer = setTimeout(() => {
        filesStabilizedRef.current = true;
      }, 500);
      return () => clearTimeout(stabilizeTimer);
    } else {
      filesStabilizedRef.current = true;
    }
  }, [filteredMeFilesMemo.length]);

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
  
  // Debug logging removed for cleaner console
  
  // CommentModal render logic (logging removed - was too verbose)

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
        const handleOAuthCallback = (data: { code?: string; state?: string; error?: string; error_description?: string; age_shared?: string }) => {
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
                // Pass age_shared preference to token exchange
                const ageShared = data.age_shared === 'true';
                const tokenResponse = await PNOAuthService.exchangeCodeForToken(data.code!, actualRedirectUri, ageShared);
                const userInfo = await PNOAuthService.getUserInfo(tokenResponse.access_token);
                
                console.log('🔐 [OAuth] UserInfo response:', {
                  did: userInfo.did,
                  pn_identifier: userInfo.pn_identifier,
                  public_key: userInfo.public_key ? `${userInfo.public_key.substring(0, 30)}...` : 'undefined',
                  hasPublicKey: !!userInfo.public_key
                });
                
                // Load feed tokens for owned feeds
                let feedTokens: any[] = [];
                try {
                  if (userInfo.pn_identifier) {
                    const feedTokensResponse = await fetch(`${process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com'}/api/feeds/tokens`, {
                      headers: {
                        'Authorization': `Bearer ${tokenResponse.access_token}`
                      }
                    });
                    
                    if (feedTokensResponse.ok) {
                      const feedTokensData = await feedTokensResponse.json();
                      feedTokens = feedTokensData.feedTokens || [];
                      console.log(`✅ Loaded ${feedTokens.length} feed tokens`);
                    } else {
                      console.warn('⚠️ Failed to load feed tokens:', feedTokensResponse.status);
                    }
                  }
                } catch (error) {
                  console.error('❌ Error loading feed tokens:', error);
                  // Don't fail auth if feed tokens can't be loaded
                }

                const session = {
                  accessToken: tokenResponse.access_token,
                  refreshToken: tokenResponse.refresh_token,
                  expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                  did: userInfo.did,
                  pnName: userInfo.pn_name,
                  pnIdentifier: userInfo.pn_identifier, // Store pN identifier from OAuth
                  publicKey: userInfo.public_key, // Store publicKey from OAuth for file decryption
                  feedTokens: feedTokens // Store feed tokens for context switching
                };
                
                // Save session with pnIdentifier if available
                const sessionWithIdentifier = {
                  ...session,
                  pnIdentifier: userInfo.pn_identifier || session.pnIdentifier
                };
                PNOAuthService.saveSession(sessionWithIdentifier);
                console.log('🔐 [OAuth] Session saved with publicKey:', session.publicKey ? `${session.publicKey.substring(0, 30)}...` : 'undefined');
                console.log('🔐 [OAuth] Session saved with pnIdentifier:', sessionWithIdentifier.pnIdentifier || 'undefined');
                console.log('🔐 Calling setUnlocked with pN identifier:', userInfo.pn_identifier || userInfo.did);
                // Use pN identifier from API if available, otherwise fall back to DID
                // But only set unlocked if we have a pN identifier (not a DID)
                if (userInfo.pn_identifier && !userInfo.pn_identifier.startsWith('did:key:')) {
                  setUnlocked(userInfo.pn_identifier);
                  
                  // Load display name from API (preferred) or use nickname as fallback
                  try {
                    const profile = await getUserProfile(userInfo.pn_identifier);
                    if (profile.displayName) {
                      updateDisplayName(profile.displayName);
                    } else if (userInfo.nickname && !userState.preferences.displayName) {
                      // Fallback to nickname if no display name in profile
                      updateDisplayName(userInfo.nickname);
                    }
                  } catch (error) {
                    // If API call fails, fallback to nickname
                    if (userInfo.nickname && !userState.preferences.displayName) {
                      updateDisplayName(userInfo.nickname);
                    }
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
          // OAuth polling (logging removed - was too verbose, only log errors)
          
          const pending = localStorage.getItem('pn_oauth_pending');
          const latestKey = localStorage.getItem('pn_oauth_latest_key');
          
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
                  }
                } catch (e) {
                  console.error('Failed to parse OAuth callback:', e);
                }
              }
            }
          }
        }, 50); // Poll every 50ms for fastest detection
        
        // Clean up when popup closes (but keep polling for callback for a short grace period)
        let popupClosedTime: number | null = null;
        const checkPopupInterval = setInterval(() => {
          try {
            if (popup.closed && callbackFound) {
              clearInterval(checkPopupInterval);
              clearTimeout(timeoutId);
              console.log('Popup closed and callback processed');
            } else if (popup.closed && !callbackFound) {
              // Track when popup closed
              if (popupClosedTime === null) {
                popupClosedTime = Date.now();
                console.log('Popup closed, waiting for callback (grace period: 3 seconds)...');
              }
              
              // If popup closed more than 3 seconds ago and no callback, stop polling
              if (popupClosedTime && Date.now() - popupClosedTime > 3000) {
                console.log('Popup closed without callback - stopping polling');
                callbackFound = true; // Set flag to stop polling
                clearInterval(pollInterval);
                clearInterval(checkPopupInterval);
                clearTimeout(timeoutId);
                window.removeEventListener('message', messageListener);
                window.removeEventListener('storage', storageListener);
                // Clear OAuth flags
                localStorage.removeItem('pn_oauth_pending');
                localStorage.removeItem('pn_oauth_latest_key');
                // Lock user if authentication failed
                setLocked();
                PNOAuthService.clearSession();
                showErrorToast('Authentication cancelled or failed. Please try again.');
              }
            }
          } catch (e) {
            // Popup access might be blocked by COOP policy - ignore
          }
        }, 500);
        
        // Stop polling after 30 seconds (timeout)
        const timeoutId = setTimeout(() => {
          if (!callbackFound) {
            console.log('OAuth polling timeout - no callback received');
            clearInterval(pollInterval);
            clearInterval(checkPopupInterval);
            window.removeEventListener('message', messageListener);
            window.removeEventListener('storage', storageListener);
            // Clear OAuth flags
            localStorage.removeItem('pn_oauth_pending');
            localStorage.removeItem('pn_oauth_latest_key');
            // Lock user if authentication failed
            setLocked();
            PNOAuthService.clearSession();
            showErrorToast('Authentication timeout. Please try again.');
          }
        }, 30000);
      } catch (err) {
        console.error('OAuth redirect error:', err);
        showErrorToast('Failed to open authentication window');
      }
    }
  };

  return (
    <>
      {/* Comment Modal - Render OUTSIDE all conditional views to ensure it works on all pages */}
      {commentingFile && (
        <CommentModal
          key={commentingFile.metadata.fileId} // Force remount on file change
          file={commentingFile}
          onClose={() => {
            console.log('[App] CommentModal onClose called', { viewingCreatorId, viewMode });
            setCommentingFile(null);
          }}
        />
      )}
      
      <div className={`min-h-screen ${viewMode === 'feed' ? 'h-screen overflow-hidden bg-black' : 'bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900'}`}>
        {/* Lock/Unlock Button with Context Switcher - Top right corner, always visible on ALL screens */}
        <LockButtonWithContext
          onLockUnlock={handleLockUnlock}
          currentContext={userState.isUnlocked ? activeContext : null}
          availableContexts={userState.isUnlocked ? availableContexts : []}
          onContextChange={(context) => {
            setActiveContext(context);
            // TODO: Load context-specific content
            // loadContextContent(context);
          }}
        />

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
            availableTabs={isOwnIndex ? ['connections', 'all', 'media', 'thoughts', 'likes', 'comments', 'saved'] : ['all', 'media', 'thoughts', 'likes', 'comments']}
          />
          
          {/* Connections List View - Show when connections tab is selected */}
          {mePageTab === 'connections' && isOwnIndex ? (
            <div className="flex-1 overflow-y-auto px-6 pt-14 pb-6">
              {connectionsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-6xl mb-4">👥</div>
                  <h2 className="text-2xl font-semibold text-white mb-2">No Connections Yet</h2>
                  <p className="text-neutral-400">Connect with other users to see them here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {connectionsList.map((connection) => (
                    <div
                      key={connection.connectionId}
                      onClick={() => {
                        setViewingCreatorId(connection.userDid);
                        setMePageTab('all');
                        setCurrentFeedIndex(0);
                      }}
                      className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                          {connection.userDid.substring(3, 5).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium truncate">
                            {connection.userDid}
                          </h3>
                          <p className="text-neutral-400 text-sm">
                            Connected {connection.acceptedAt 
                              ? new Date(connection.acceptedAt).toLocaleDateString()
                              : connection.createdAt 
                              ? new Date(connection.createdAt).toLocaleDateString()
                              : 'recently'}
                          </p>
                        </div>
                        <div className="text-neutral-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : filteredMeFiles.length > 0 ? (
            <div className="flex-1" style={{ height: viewportHeightCSS, maxHeight: viewportHeightCSS }}>
              <FullScreenFeed
                files={filteredMeFiles}
                currentIndex={currentFeedIndex}
                thumbnails={thumbnails}
                videoBlobs={videoBlobs}
                onIndexChange={(newIndex) => {
                  // Only update if index is within valid range and actually changed
                  // Remove stabilization check to allow smooth scrolling
                  if (newIndex >= 0 && newIndex < filteredMeFiles.length && newIndex !== currentFeedIndex) {
                    setCurrentFeedIndex(newIndex);
                  }
                }}
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
                mePageTab={mePageTab}
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
          ) : mePageTab !== 'connections' ? (() => {
            // Show cover as empty state when:
            // 1. No files in filtered array (empty state)
            // 2. On 'all' or 'media' tab
            // 3. Either files are still loading (show optimistically) OR files have loaded and user has no media
            // This ensures smooth transition: cover shows immediately, then switches directly to content when it loads
            const userHasMedia = creatorFiles.length > 0 && creatorFiles.some(f => isMedia(f));
            const shouldShowCover = 
              filteredMeFiles.length === 0 && 
              (mePageTab === 'all' || mePageTab === 'media') && 
              (isLoadingCreatorFiles || !userHasMedia); // Show optimistically while loading, or if no media after loading
            const coverCreatorId = viewingCreatorId || (isOwnIndex ? userState.pnIdentifier : null);
            
            if (shouldShowCover && coverCreatorId) {
              const coverName = getDisplayName(coverCreatorId) || coverCreatorId;
              
              return (
                <div className="flex-1" style={{ height: viewportHeightCSS, maxHeight: viewportHeightCSS }}>
                  <div className="relative w-full h-full flex">
                    {/* Background Image - Direct CSS reference, no generation needed */}
                    <div 
                      className="flex-1 relative overflow-hidden"
                      style={{
                        backgroundImage: 'url(/branding/Par-Noir-Background-Dark.png)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }}
                    >
                      {/* User's Public Name - Bottom left, same position as regular media tiles */}
                      <div 
                        className="absolute left-0 right-20 p-4 md:p-6 z-10"
                        style={{ 
                          bottom: '10px',
                          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                        }}
                      >
                        <h3 className="text-white text-base md:text-lg font-semibold line-clamp-1">
                          {coverName}
                        </h3>
                      </div>
                    </div>
                    
                    {/* Engagement Sidebar */}
                    <FeedEngagementSidebar
                      file={{
                        metadata: {
                          fileId: `me-page-cover-${coverCreatorId}`,
                          creatorId: coverCreatorId,
                          name: coverName,
                          engagement: {
                            views: 0,
                            likes: 0,
                            comments: 0,
                            shares: 0,
                            saves: 0,
                            lastUpdated: new Date().toISOString()
                          }
                        }
                      } as IndexedFile}
                      isLiked={false}
                      onLike={() => {}}
                      onComment={() => {}}
                      onShare={async () => {}}
                      onAddToFeed={undefined}
                      onEdit={undefined}
                      isOwner={isOwnIndex && coverCreatorId === userState.pnIdentifier}
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
                      indexedFiles={[]}
                    />
                  </div>
                </div>
              );
            }
            
            // Default empty state
            return (
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
            );
          })() : null}
        </div>
      ) : showUploadModal ? (
        <div className="h-screen w-full bg-neutral-900" style={{ paddingBottom: '64px' }}>
          <UploadModal
            feeds={feeds}
            onClose={() => {
              setShowUploadModal(false);
              setActiveBottomTab('home');
            }}
            onUploadComplete={() => {
              // Refresh files after upload - reset to page 0
              setCurrentPage(0);
              setHasMore(true);
    hasMoreRef.current = true;
              discoverFiles(undefined, true, 0, false);
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
              right: '56px', // Space for lock button with context switcher (40px button + 12px right-3 + 4px gap)
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
                  setCurrentPage(0); // SCALABILITY: Reset pagination
                  setHasMore(true);
    hasMoreRef.current = true;
                  discoverFiles({}, false, 0, false);
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
                    onClick={() => {
                      setCurrentPage(0); // SCALABILITY: Reset pagination
                      setHasMore(true);
    hasMoreRef.current = true;
                      discoverFiles(undefined, true, 0, false);
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
            style={{ height: viewportHeightCSS, maxHeight: viewportHeightCSS }}
          >
            {(() => {
              console.log('[DEBUG] Feed render check', { viewMode, activeFeedId, filteredFilesByFeedLength: filteredFilesByFeed.length, indexedFilesLength: indexedFiles.length });
              return filteredFilesByFeed.length > 0;
            })() ? (
              <>
              <FullScreenFeed
                files={filteredFilesByFeed}
                key={`feed-${activeFeedId}-${filteredFilesByFeed.length}`}
                currentIndex={currentFeedIndex}
                thumbnails={thumbnails}
                videoBlobs={videoBlobs}
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
              {/* SCALABILITY: Infinite scroll sentinel - Intersection Observer watches this */}
              {viewMode === 'feed' && hasMore && (
                <div 
                  id="feed-infinite-scroll-sentinel" 
                  data-feed-container="true"
                  style={{ height: '1px', width: '100%' }}
                />
              )}
              {viewMode === 'feed' && isLoadingMore && (
                <div className="flex items-center justify-center py-4">
                  <p className="text-text-secondary text-sm">Loading more...</p>
                </div>
              )}
            </>
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
                             !!(file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
              const isVideo = file.fileType === 'video' || 
                             !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
              const fileName = file.name || file.title || 'Untitled';
              
              // Detect if file is a collection
              const collectionData = indexedFile.metadata?.collection;
              const isCollectionFile = file.fileType === 'collection' && 
                                     collectionData && 
                                     typeof collectionData === 'object' &&
                                     collectionData.collectionFileIds && 
                                     Array.isArray(collectionData.collectionFileIds) &&
                                     collectionData.collectionFileIds.length > 0;
              
              // Detect if file is a thought
              const isThoughtFile = isThought(indexedFile);
              
              // Helper to get text post data
              const getTextPostData = (file: IndexedFile) => {
                return (file.metadata as any).textPost || (file.metadata as any).thought || null;
              };
              
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
                  {/* Collection Preview Section */}
                  {isCollectionFile && collectionData.collectionFileIds && (
                    <div className="w-full h-48 bg-neutral-800 flex items-center justify-center relative overflow-hidden">
                      {(() => {
                        const collectionThumbnails = collectionData.collectionFileIds
                          .map((fileId: string) => thumbnails.get(fileId))
                          .filter((url): url is string => url !== undefined);
                        
                        if (collectionThumbnails.length > 0) {
                          return (
                            <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                              {collectionThumbnails.map((thumbnailUrl, idx) => (
                                <div
                                  key={`${file.fileId}-${idx}`}
                                  className="flex-shrink-0 w-full h-full snap-start"
                                >
                                  <img
                                    src={thumbnailUrl}
                                    alt={`${fileName} - ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.src = '/placeholder-thumbnail.png';
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex flex-col items-center justify-center text-neutral-400">
                              <div className="text-4xl mb-2">📚</div>
                              <div className="text-sm">Collection</div>
                              <div className="text-xs mt-1">{collectionData.collectionFileIds.length} files</div>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                  
                  {/* Thought Preview Section */}
                  {!isCollectionFile && isThoughtFile && (
                    <div className="w-full h-48 bg-neutral-800 flex items-center justify-center relative overflow-hidden">
                      {(() => {
                        const textPostData = getTextPostData(indexedFile);
                        // Use thumbnail if available, otherwise render thought content directly
                        const thoughtThumbnail = thumbnails.get(file.fileId);
                        
                        if (thoughtThumbnail) {
                          // Thought thumbnails are 1080x1080 (square)
                          const containerDims = { width: 192, height: 192 }; // h-48 = 192px
                          const dims = mediaDimensions.get(file.fileId) || { width: 1080, height: 1080 }; // Default to 1080x1080 for thoughts
                          const scalingStyles = calculateMediaScaling(dims, containerDims);
                          
                          return (
                            <>
                              {/* Blurred background */}
                              <img
                                src={thoughtThumbnail}
                                alt=""
                                className="absolute"
                                style={scalingStyles.background}
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                  console.error(`[App] Thought background thumbnail failed to load for ${file.fileId}:`, e);
                                }}
                              />
                              {/* Main image */}
                              <div className="w-full h-full flex items-center justify-center relative z-10">
                                <img
                                  src={thoughtThumbnail}
                                  alt={fileName}
                                  style={scalingStyles.mainMedia}
                                  onLoad={(e) => {
                                    const img = e.currentTarget;
                                    // Track dimensions - thoughts are 1080x1080
                                    setMediaDimensions(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(file.fileId, { width: img.naturalWidth || 1080, height: img.naturalHeight || 1080 });
                                      return newMap;
                                    });
                                  }}
                                  onError={(e) => {
                                    console.error(`[App] Thought thumbnail failed to load for ${file.fileId}:`, e);
                                    // Fallback to rendering thought content if thumbnail fails
                                    e.currentTarget.style.display = 'none';
                                  }}
                                  loading="lazy"
                                  decoding="sync"
                                />
                              </div>
                            </>
                          );
                        } else if (textPostData) {
                          return (
                            <div
                              className="w-full h-full flex items-center justify-center"
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
                                className="w-full px-4 text-center"
                                style={{
                                  fontFamily: textPostData?.style?.fontFamily || 'Arial',
                                  fontSize: textPostData?.style?.fontSize 
                                    ? `${Math.min(textPostData.style.fontSize, 24)}px` 
                                    : '16px',
                                  color: textPostData?.style?.textColor || '#FFFFFF',
                                  fontWeight: textPostData?.style?.textStyle === 'bold' ? 'bold' : 'normal',
                                  fontStyle: textPostData?.style?.textStyle === 'italic' ? 'italic' : 'normal',
                                  textDecoration: textPostData?.style?.textStyle === 'strikethrough' ? 'line-through' : 'none',
                                  textAlign: (textPostData?.style?.textAlign || 'center') as 'left' | 'center' | 'right' | 'justify',
                                  textShadow: textPostData?.style?.dropShadowOffsetX || textPostData?.style?.dropShadowOffsetY || textPostData?.style?.dropShadowBlur
                                    ? `${textPostData.style.dropShadowOffsetX || 2}px ${textPostData.style.dropShadowOffsetY || 2}px ${textPostData.style.dropShadowBlur || 10}px ${textPostData.style.dropShadowColor || '#000000'}`
                                    : 'none',
                                  padding: `${Math.min(textPostData?.style?.padding || 20, 20)}px`,
                                  lineHeight: 1.2,
                                  wordWrap: 'break-word',
                                  overflowWrap: 'break-word',
                                  whiteSpace: 'pre-wrap',
                                  maxHeight: '100%',
                                  overflow: 'hidden',
                                }}
                              >
                                {textPostData?.content || file.description || fileName || 'Thought'}
                              </div>
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex flex-col items-center justify-center text-neutral-500">
                              <div className="text-2xl mb-2">💭</div>
                              <span className="text-xs">Thought</span>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                  
                  {/* Image/Video Preview Section */}
                  {!isCollectionFile && !isThoughtFile && (isImage || isVideo) && (
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
                          {isThoughtFile ? 'Thought' : isVideo ? 'Video' : file.fileType === 'image' ? 'Image' : file.fileType || 'File'} • {new Date(file.uploadDate).toLocaleDateString()}
                        </p>
                      </div>
                      {file.metadata?.isNSFW && (
                        <ContentRatingBadge isNSFW={true} size="sm" className="ml-2 flex-shrink-0" />
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
              // Refresh files to show updated feed membership - reset to page 0
              setCurrentPage(0);
              setHasMore(true);
    hasMoreRef.current = true;
              discoverFiles(undefined, true, 0, false);
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

        {/* Edit File Modal */}
        {editingFile && (
          <EditFileModal
            file={editingFile}
            onClose={() => setEditingFile(null)}
            onSave={async (updatedFile) => {
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
              
              // Clear cache and force refresh to ensure updated files appear
              try {
                const { CentralMetadataAggregator } = await import('./services/storage/CentralMetadataAggregator');
                CentralMetadataAggregator.clearCache();
              } catch (err) {
                console.warn('Failed to clear cache:', err);
              }
              
              // Force refresh files from API (forceRefresh=true ensures fresh data)
              if (discoverFilesRef.current) {
                await discoverFilesRef.current(undefined, true, 0, false);
              }
            }}
          />
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <UploadModal
            feeds={feeds}
            onClose={() => setShowUploadModal(false)}
            onUploadComplete={() => {
              // Refresh files after upload - reset to page 0
              setCurrentPage(0);
              setHasMore(true);
    hasMoreRef.current = true;
              discoverFiles(undefined, true, 0, false);
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
    </>
  );
}

export default App;

