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
import { EngagementActions } from './components/EngagementActions';
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
import { saveToFeed } from './services/savedFeedService';

// Shared types - importing from id-dashboard
// In production, these would come from a shared package

function App() {
  const { userState, setLocked, setUnlocked } = useUserState();
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
  
  const metadataIndexService = getMetadataIndexService();
  const { toggleLike, share, getLikeCount, isLiked, getComments, getShareCount, loadBulkEngagementStats } = useEngagement();
  const { toasts, removeToast, success, error: showErrorToast } = useToast();
  const { getParam, setParam } = useURLParams();

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
  useEffect(() => {
    // Only switch feeds if unlock state actually changed (not just activeFeedId)
    const unlockStateChanged = prevUnlockedRef.current !== userState.isUnlocked;
    prevUnlockedRef.current = userState.isUnlocked;
    
    if (unlockStateChanged) {
      if (userState.isUnlocked && activeFeedId === 'public') {
        // User just unlocked - switch to curated
        setActiveFeedId('curated');
      } else if (!userState.isUnlocked && activeFeedId === 'curated') {
        // User just locked - switch to public
        setActiveFeedId('public');
      }
    }
  }, [userState.isUnlocked]); // Only depend on isUnlocked, not activeFeedId

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

  // Initialize from URL params
  useEffect(() => {
    const fileParam = getParam('file');
    const feedParam = getParam('feed');
    const creatorParam = getParam('creator');
    const viewParam = getParam('view') as 'grid' | 'feed' | null;

    if (viewParam && (viewParam === 'grid' || viewParam === 'feed')) {
      setViewMode(viewParam);
    }

    if (feedParam) {
      setActiveFeedId(feedParam);
    }

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

  // Re-discover files when active feed or rating preferences change
  // Debounce to prevent rapid-fire calls when switching feeds quickly
  // NOTE: Don't call discoverFiles for virtual feeds (discovery, curated) - they use all files
  useEffect(() => {
    // Skip discovery feed - it's a virtual feed that uses all indexedFiles
    if (activeFeedId === 'discovery') {
      return;
    }
    
    const timeoutId = setTimeout(() => {
      if (discoverFilesRef.current) {
        discoverFilesRef.current();
      }
    }, 100); // Small delay to batch rapid feed switches
    
    return () => clearTimeout(timeoutId);
  }, [activeFeedId, userState.preferences.maxRating]);

  // Reset feed index when feed changes
  useEffect(() => {
    setCurrentFeedIndex(0);
  }, [activeFeedId]);

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
  const horizontalSwipeRef = useHorizontalSwipe({
    onSwipeLeft: viewMode === 'feed' ? handleNextFeed : undefined,
    onSwipeRight: viewMode === 'feed' ? handlePreviousFeed : undefined,
    enabled: viewMode === 'feed' && !showFeedBrowser && !showSettings && !showShortcuts && !viewingCreatorId
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
    try {
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
      
      setIndexedFiles(discoveredFiles);
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
    }
  }, [filters, searchQuery, userState.preferences.maxRating, activeFeedId, viewMode, videoBlobs]);
  
  // Store discoverFiles in ref so it can be called from OAuth callback
  useEffect(() => {
    discoverFilesRef.current = discoverFiles;
  }, [discoverFiles]);
  
  // Initial file discovery on mount (after discoverFiles is defined)
  useEffect(() => {
    if (discoverFilesRef.current) {
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

  // Show inbox if messages tab is active
  if (showInbox) {
    return (
      <div className="h-screen w-full bg-neutral-900">
        <Inbox
          onClose={() => {
            setShowInbox(false);
            setActiveBottomTab('home');
          }}
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
    );
  }

  // Show search results if search is open
  if (showSearch) {
    return (
      <SearchResults
        initialQuery={searchQuery}
        onFileClick={(file) => {
          setShowSearch(false);
          setViewMode('feed');
          const index = filteredFilesByFeed.findIndex(f => f.metadata.fileId === file.metadata.fileId);
          if (index !== -1) {
            setCurrentFeedIndex(index);
          }
        }}
        onClose={() => {
          setShowSearch(false);
          setSearchQuery('');
        }}
      />
    );
  }

  // Load creator files when viewing a creator (especially own index)
  useEffect(() => {
    if (!viewingCreatorId) {
      setCreatorFilesState([]);
      return;
    }
    
    if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked) {
      // Fetch user's own files from API using pN identifier from Google Drive folder name
      setIsLoadingCreatorFiles(true);
      (async () => {
        try {
          // Use pN identifier directly if it's already a pN identifier (not a DID)
          // Otherwise, get it from the session
          let pnIdentifier: string;
          if (viewingCreatorId && !viewingCreatorId.startsWith('did:key:')) {
            // Already a pN identifier
            pnIdentifier = viewingCreatorId;
          } else {
            // It's a DID - get pN identifier from session
            const session = PNOAuthService.loadSession();
            if (session?.pnIdentifier && !session.pnIdentifier.startsWith('did:key:')) {
              pnIdentifier = session.pnIdentifier;
            } else if (viewingCreatorId && viewingCreatorId.startsWith('did:key:')) {
              // Fallback: try to fetch from userinfo if session doesn't have it
              try {
                if (session?.accessToken) {
                  const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
                  if (userInfo.pn_identifier) {
                    pnIdentifier = userInfo.pn_identifier;
                    // Update session with the pN identifier
                    const updatedSession = { ...session, pnIdentifier };
                    PNOAuthService.saveSession(updatedSession);
                  } else {
                    // Last resort: derive from DID (shouldn't happen)
                    const publicKeyPart = viewingCreatorId.substring(8);
                    const combined = `${viewingCreatorId}:${publicKeyPart}`;
                    const encoder = new TextEncoder();
                    const keyBuffer = encoder.encode(combined);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    pnIdentifier = hexHash.substring(0, 12);
                  }
                } else {
                  throw new Error('No access token');
                }
              } catch (error) {
                console.warn('Failed to get pN identifier, deriving from DID:', error);
                // Last resort: derive from DID
                const publicKeyPart = viewingCreatorId.substring(8);
                const combined = `${viewingCreatorId}:${publicKeyPart}`;
                const encoder = new TextEncoder();
                const keyBuffer = encoder.encode(combined);
                const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                pnIdentifier = hexHash.substring(0, 12);
              }
            } else {
              // Already a pN identifier or other format
              pnIdentifier = viewingCreatorId;
            }
          }
          const userFiles = await metadataIndexService.discoverFiles({
            authorDid: pnIdentifier
          });
          setCreatorFilesState(userFiles);
          console.log(`✅ Loaded ${userFiles.length} files for user's own index from API`);
        } catch (error) {
          console.error('Failed to load user files from API:', error);
          // Fallback to filtering indexedFiles
          const filtered = indexedFiles.filter(f => {
      const did = f.metadata.creator?.identifier?.value || 
                 f.metadata.creator?.["@id"] || 
                       f.metadata.author?.did ||
                       f.metadata.creatorId;
            const normalizedDid = did?.trim().toLowerCase();
            const normalizedViewingId = viewingCreatorId.trim().toLowerCase();
            return normalizedDid === normalizedViewingId;
          });
          setCreatorFilesState(filtered);
        } finally {
          setIsLoadingCreatorFiles(false);
        }
      })();
    } else {
      // Filter from indexedFiles for other creators
      const filtered = indexedFiles.filter(f => {
        const did = f.metadata.creator?.identifier?.value || 
                   f.metadata.creator?.["@id"] || 
                   f.metadata.author?.did ||
                   f.metadata.creatorId;
        const normalizedDid = did?.trim().toLowerCase();
        const normalizedViewingId = viewingCreatorId.trim().toLowerCase();
        return normalizedDid === normalizedViewingId;
    });
      setCreatorFilesState(filtered);
    }
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked, indexedFiles]);

  // Load user's shares and comments when viewing own index
  const [userSharedFiles, setUserSharedFiles] = useState<IndexedFile[]>([]);
  const [userCommentedFiles, setUserCommentedFiles] = useState<IndexedFile[]>([]);
  const [isLoadingUserEngagement, setIsLoadingUserEngagement] = useState(false);

  useEffect(() => {
    if (viewingCreatorId === userState.pnIdentifier && userState.isUnlocked && userState.pnIdentifier) {
      setIsLoadingUserEngagement(true);
      (async () => {
        try {
          // Get file IDs from engagement data (shares and comments)
          const engagementData = loadEngagementData();
          
          // Get file IDs that user has shared
          const sharedFileIds = Array.from(engagementData.shares.keys());
          
          // Get file IDs that user has commented on
          const commentedFileIds = Array.from(engagementData.comments.keys());
          
          // First, try to find files from already indexed files
          const sharedFromIndexed = indexedFiles.filter(f => 
            sharedFileIds.includes(f.metadata.fileId)
          );
          const commentedFromIndexed = indexedFiles.filter(f => 
            commentedFileIds.includes(f.metadata.fileId)
          );
          
          // Find file IDs that aren't in indexedFiles yet
          const missingSharedIds = sharedFileIds.filter(id => 
            !indexedFiles.some(f => f.metadata.fileId === id)
          );
          const missingCommentedIds = commentedFileIds.filter(id => 
            !indexedFiles.some(f => f.metadata.fileId === id)
          );
          const allMissingIds = [...new Set([...missingSharedIds, ...missingCommentedIds])];
          
          // Try to fetch missing files from API (if API supports it)
          // For now, we'll just use what's in indexedFiles
          // In the future, we could add an API endpoint to fetch files by IDs
          
          setUserSharedFiles(sharedFromIndexed);
          setUserCommentedFiles(commentedFromIndexed);
          
          console.log(`📊 User engagement: ${sharedFromIndexed.length} shared files, ${commentedFromIndexed.length} commented files${allMissingIds.length > 0 ? ` (${allMissingIds.length} not yet indexed)` : ''}`);
        } catch (error) {
          console.error('Failed to load user engagement files:', error);
          setUserSharedFiles([]);
          setUserCommentedFiles([]);
        } finally {
          setIsLoadingUserEngagement(false);
        }
      })();
    } else {
      setUserSharedFiles([]);
      setUserCommentedFiles([]);
    }
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked, indexedFiles]);

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

  // Show creator feed page if viewing a creator
  if (viewingCreatorId) {
    const creatorFiles = creatorFilesState;
    
    // If viewing own index, combine media, shares, and comments
    const isOwnIndex = viewingCreatorId === userState.pnIdentifier && userState.isUnlocked;
    const allUserFiles = isOwnIndex 
      ? [...creatorFiles, ...userSharedFiles, ...userCommentedFiles]
      : creatorFiles;
    
    // Remove duplicates by fileId, keeping the first occurrence
    const uniqueFiles = Array.from(
      new Map(allUserFiles.map(f => [f.metadata.fileId, f])).values()
    );
    
    console.log(`📊 Creator index: Found ${uniqueFiles.length} files for creator ${viewingCreatorId}${isOwnIndex ? ` (${creatorFiles.length} media, ${userSharedFiles.length} shared, ${userCommentedFiles.length} commented)` : ''}`);
    
    const creatorFeeds = feeds.filter(feed => feed.creatorId === viewingCreatorId);
    
    return (
      <div className="min-h-screen bg-neutral-900 pb-20">
        <CreatorFeedPage
          creatorId={viewingCreatorId}
          creatorName={
            creatorFiles[0]?.metadata.creator?.identifier?.value || 
            viewingCreatorId
          }
          files={uniqueFiles}
          feeds={creatorFeeds}
          onFileClick={(file) => {
            // Switch to feed mode and show file
            setViewMode('feed');
            setViewingCreatorId(null);
            const index = indexedFiles.findIndex(f => f.metadata.fileId === file.metadata.fileId);
            if (index !== -1) {
              setCurrentFeedIndex(index);
            }
          }}
          onFeedClick={(feed) => {
            setViewingBrandedFeed(feed);
            setViewingCreatorId(null);
          }}
          onBack={() => setViewingCreatorId(null)}
          onLike={(fileId) => {
            const wasLiked = isLiked(fileId);
            toggleLike(fileId);
            if (!wasLiked) {
              success('Liked!');
            }
          }}
          onComment={(file) => setCommentingFile(file)}
          onShare={async (fileId) => {
            share(fileId);
            const file = uniqueFiles.find(f => f.metadata.fileId === fileId);
            if (file) {
              const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
              try {
                await navigator.clipboard.writeText(shareUrl);
                success('Link copied to clipboard!');
              } catch (err) {
                showErrorToast('Failed to copy link. Please try again.');
              }
            }
          }}
          isLiked={isLiked}
          getLikeCount={getLikeCount}
          getComments={getComments}
          getShareCount={getShareCount}
        />
        
        {/* Bottom Navigation Bar - Always visible */}
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 h-16 flex items-center justify-around z-[100]">
          <button
            onClick={() => {
              setActiveBottomTab('home');
              setShowInbox(false);
              setShowSearch(false);
              setViewingCreatorId(null);
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'home' ? 'text-blue-400' : ''}`}
            title="Home"
          >
            <Home className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">HOME</span>
          </button>
          <button
            onClick={() => {
              setShowSearch(true);
              setActiveBottomTab('search');
              setViewingCreatorId(null);
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'search' ? 'text-blue-400' : ''}`}
            title="Search"
          >
            <Search className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">SEARCH</span>
          </button>
          <button
            onClick={() => {
              setShowUploadModal(true);
              setActiveBottomTab('upload');
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'upload' ? 'text-blue-400' : ''}`}
            title="Upload"
          >
            <Upload className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">UPLOAD</span>
          </button>
          <button
            onClick={async () => {
              if (userState.isUnlocked) {
                // Get pN identifier from session if available, otherwise use userState.pnIdentifier
                const session = PNOAuthService.loadSession();
                let pnIdentifier = session?.pnIdentifier || userState.pnIdentifier;
                
                // If still a DID, try to fetch pN identifier from userinfo
                if (pnIdentifier && pnIdentifier.startsWith('did:key:')) {
                  try {
                    if (session?.accessToken) {
                      const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
                      if (userInfo.pn_identifier) {
                        pnIdentifier = userInfo.pn_identifier;
                        // Update session and userState with the pN identifier
                        const updatedSession = { ...session, pnIdentifier };
                        PNOAuthService.saveSession(updatedSession);
                        setUnlocked(pnIdentifier);
                      }
                    }
                  } catch (error) {
                    console.warn('Failed to fetch pN identifier from userinfo:', error);
                  }
                }
                
                if (pnIdentifier && !pnIdentifier.startsWith('did:key:')) {
                  // Show user's own index using pN identifier (must not be a DID)
                  setViewingCreatorId(pnIdentifier);
                  setActiveBottomTab('index');
                } else {
                  // Still a DID - try one more time to get it from the API
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
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'index' ? 'text-blue-400' : ''}`}
            title="Me"
          >
            <Grid className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">ME</span>
          </button>
          <button
            onClick={() => {
              setShowInbox(true);
              setActiveBottomTab('messages');
              setViewingCreatorId(null);
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'messages' ? 'text-blue-400' : ''}`}
            title="Inbox"
          >
            <MessageSquare className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">INBOX</span>
          </button>
        </div>
      </div>
    );
  }


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
                
                const session = {
                  accessToken: tokenResponse.access_token,
                  refreshToken: tokenResponse.refresh_token,
                  expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                  did: userInfo.did,
                  pnName: userInfo.pn_name,
                  pnIdentifier: userInfo.pn_identifier // Store pN identifier from API
                };
                
                PNOAuthService.saveSession(session);
                console.log('🔐 Calling setUnlocked with pN identifier:', userInfo.pn_identifier || userInfo.did);
                // Use pN identifier from API if available, otherwise fall back to DID
                // But only set unlocked if we have a pN identifier (not a DID)
                if (userInfo.pn_identifier && !userInfo.pn_identifier.startsWith('did:key:')) {
                  setUnlocked(userInfo.pn_identifier);
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
                setViewingCreatorId(creatorId);
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
            className="flex-1 h-full"
          >
            {filteredFilesByFeed.length > 0 ? (
              <FullScreenFeed
                files={filteredFilesByFeed}
                currentIndex={currentFeedIndex}
                onIndexChange={setCurrentFeedIndex}
                onLike={(fileId) => {
                  const wasLiked = isLiked(fileId);
                  toggleLike(fileId);
                      if (!wasLiked) {
                        success('Liked!');
                      }
                    }}
                onComment={(file) => setCommentingFile(file)}
                onShare={async (fileId) => {
                  share(fileId);
                  const file = filteredFilesByFeed.find(f => f.metadata.fileId === fileId);
                  if (file) {
                    const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
                      try {
                        await navigator.clipboard.writeText(shareUrl);
                        success('Link copied to clipboard!');
                      setParam('file', fileId);
                      } catch (err) {
                        showErrorToast('Failed to copy link. Please try again.');
                    }
                      }
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
                    success('Saved to your private feed!');
                  } catch (error) {
                    showErrorToast('Failed to save. Please try again.');
                  }
                } : undefined}
                isLiked={isLiked}
                getLikeCount={getLikeCount}
                getComments={getComments}
                getShareCount={getShareCount}
                userState={userState}
                onCreatorClick={(creatorId) => setViewingCreatorId(creatorId)}
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
                          const wasLiked = isLiked(file.fileId);
                          toggleLike(file.fileId);
                          if (!wasLiked) {
                            success('Liked!');
                          }
                        }}
                        onComment={() => setCommentingFile(indexedFile)}
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

        {/* Comment Modal */}
        {commentingFile && (
          <CommentModal
            file={commentingFile}
            onClose={() => setCommentingFile(null)}
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

        {/* Bottom Navigation Bar - Static on ALL screens: HOME, SEARCH, UPLOAD, ME, INBOX (5 buttons evenly spaced) */}
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 h-16 flex items-center justify-around z-[100]">
          <button
            onClick={() => {
              setActiveBottomTab('home');
              setShowInbox(false);
              setShowSearch(false);
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'home' ? 'text-blue-400' : ''}`}
            title="Home"
          >
            <Home className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">HOME</span>
          </button>
          <button
            onClick={() => {
              setShowSearch(true);
              setActiveBottomTab('search');
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'search' ? 'text-blue-400' : ''}`}
            title="Search"
          >
            <Search className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">SEARCH</span>
          </button>
          <button
            onClick={() => {
              setShowUploadModal(true);
              setActiveBottomTab('upload');
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'upload' ? 'text-blue-400' : ''}`}
            title="Upload"
          >
            <Upload className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">UPLOAD</span>
          </button>
          <button
            onClick={async () => {
              if (userState.isUnlocked) {
                // Get pN identifier from session if available, otherwise use userState.pnIdentifier
                const session = PNOAuthService.loadSession();
                let pnIdentifier = session?.pnIdentifier || userState.pnIdentifier;
                
                // If still a DID, try to fetch pN identifier from userinfo
                if (pnIdentifier && pnIdentifier.startsWith('did:key:')) {
                  try {
                    if (session?.accessToken) {
                      const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
                      if (userInfo.pn_identifier) {
                        pnIdentifier = userInfo.pn_identifier;
                        // Update session and userState with the pN identifier
                        const updatedSession = { ...session, pnIdentifier };
                        PNOAuthService.saveSession(updatedSession);
                        setUnlocked(pnIdentifier);
                      }
                    }
                  } catch (error) {
                    console.warn('Failed to fetch pN identifier from userinfo:', error);
                  }
                }
                
                if (pnIdentifier && !pnIdentifier.startsWith('did:key:')) {
                  // Show user's own index using pN identifier (must not be a DID)
                  setViewingCreatorId(pnIdentifier);
                  setActiveBottomTab('index');
                } else {
                  // Still a DID - try one more time to get it from the API
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
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'index' ? 'text-blue-400' : ''}`}
            title="Me"
          >
            <Grid className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">ME</span>
          </button>
          <button
            onClick={() => {
              setShowInbox(true);
              setActiveBottomTab('messages');
            }}
            className={`flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors ${activeBottomTab === 'messages' ? 'text-blue-400' : ''}`}
            title="Inbox"
          >
            <MessageSquare className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">INBOX</span>
          </button>
        </div>

        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    </div>
  );
}

export default App;

