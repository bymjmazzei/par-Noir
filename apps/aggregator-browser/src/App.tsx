/**
 * Aggregator Browser
 * Licensed aggregator application for discovering and viewing public encrypted content
 * Deployed at browse.parnoir.com
 */

import React, { useState, useEffect } from 'react';
import { Search, Filter, File, Globe, Tag, Calendar, User, Download, RefreshCw, Lock, Image as ImageIcon, X } from 'lucide-react';
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
import { Settings } from 'lucide-react';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useSwipeGesture } from './hooks/useSwipeGesture';

// Shared types - importing from id-dashboard
// In production, these would come from a shared package

function App() {
  const { userState } = useUserState();
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
  const [activeFeedId, setActiveFeedId] = useState<string>('public'); // Active feed ID
  const [feeds, setFeeds] = useState<Feed[]>([]); // Available feeds
  const [visibleFileId, setVisibleFileId] = useState<string | null>(null); // Currently visible file in feed mode
  const [showFeedBrowser, setShowFeedBrowser] = useState(false); // Show feed browser modal
  const [showSettings, setShowSettings] = useState(false); // Show settings panel
  const [showShortcuts, setShowShortcuts] = useState(false); // Show keyboard shortcuts
  const [viewingCreatorId, setViewingCreatorId] = useState<string | null>(null); // Creator ID for index view
  const feedScrollRef = React.useRef<HTMLDivElement>(null); // Ref for feed scroll container
  const videoRefs = React.useRef<Map<string, HTMLVideoElement>>(new Map()); // Store video element refs
  
  const metadataIndexService = getMetadataIndexService();

  useEffect(() => {
    discoverFiles();
  }, []);

  // Re-discover files when active feed or rating preferences change
  useEffect(() => {
    discoverFiles();
  }, [activeFeedId, userState.preferences.maxRating]);

  // Navigation handlers
  const handleNextPost = () => {
    if (!feedScrollRef.current) return;
    const currentScroll = feedScrollRef.current.scrollTop;
    const viewportHeight = feedScrollRef.current.clientHeight;
    feedScrollRef.current.scrollTo({
      top: currentScroll + viewportHeight,
      behavior: 'smooth'
    });
  };

  const handlePreviousPost = () => {
    if (!feedScrollRef.current) return;
    const currentScroll = feedScrollRef.current.scrollTop;
    const viewportHeight = feedScrollRef.current.clientHeight;
    feedScrollRef.current.scrollTo({
      top: currentScroll - viewportHeight,
      behavior: 'smooth'
    });
  };

  const handleNextFeed = () => {
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
  };

  const handlePreviousFeed = () => {
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
  };

  const handleTogglePlayPause = () => {
    if (!visibleFileId) return;
    const videoElement = videoRefs.current.get(visibleFileId);
    if (videoElement) {
      if (videoElement.paused) {
        videoElement.play();
      } else {
        videoElement.pause();
      }
    }
  };

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
        discoverFiles();
      }
    };

    // Check immediately
    checkToken();

    // Also listen for storage events (in case token is set in another tab/window)
    window.addEventListener('storage', (e) => {
      if (e.key === 'google_drive_token' && e.newValue) {
        console.log('✅ Google Drive token updated - refreshing metadata');
        discoverFiles();
      }
    });

    return () => {
      window.removeEventListener('storage', checkToken);
    };
  }, []);

  const discoverFiles = async (searchFilters?: MetadataFilters, forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
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
        ...(activeFeedId === 'public' ? {} : { feedId: activeFeedId })
      };
      
      // Discover public files from all users (with optional force refresh)
      const discoveredFiles = await metadataIndexService.discoverFiles(finalFilters, forceRefresh);
      
      setIndexedFiles(discoveredFiles);
      console.log(`✅ Discovered ${discoveredFiles.length} public files`);
      
      // Generate thumbnails for image files
      generateThumbnailsForImages(discoveredFiles);
      
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
  };


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

  return (
    <div className={`min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 ${viewMode === 'feed' ? 'h-screen overflow-hidden' : ''}`}>
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

        {/* Feed Rail - Only show in feed mode */}
        {viewMode === 'feed' && (
          <div className="bg-neutral-900/60 border-b border-neutral-700 px-4 py-2 flex items-center justify-between">
            <div className="flex-1">
              <FeedRail
                feeds={buildFeedRailItems(
                  feeds,
                  userState.preferences.subscribedFeedIds,
                  activeFeedId,
                  false // TODO: Track new third-party content
                )}
                activeFeedId={activeFeedId}
                onFeedSelect={setActiveFeedId}
                onBrowseFeeds={() => setShowFeedBrowser(true)}
              />
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="ml-4 p-2 text-text-secondary hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
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

        {/* Stats and View Mode Toggle */}
        <div className={`bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 ${viewMode === 'feed' ? 'mb-2' : 'mb-6'}`}>
          <div className="flex items-center justify-between">
            {viewMode !== 'feed' && (
              <div>
                <p className="text-text-secondary text-sm">Public Files Discovered</p>
                <p className="text-white text-2xl font-bold">{indexedFiles.length}</p>
              </div>
            )}
            <div className={`flex items-center space-x-4 ${viewMode === 'feed' ? 'w-full justify-center' : ''}`}>
              {/* View Mode Toggle */}
              <div className="flex items-center space-x-2 bg-neutral-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('feed')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'feed' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  Feed
                </button>
              </div>
              {viewMode !== 'feed' && (
                <>
                  <button
                    onClick={() => discoverFiles(undefined, true)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-neutral-700 text-white text-sm font-medium rounded-lg hover:bg-neutral-600 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
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
          <div className="text-center py-12">
            <Globe className="h-12 w-12 text-text-secondary mx-auto mb-4" />
            <p className="text-text-secondary">No public files found</p>
            <p className="text-text-secondary text-sm mt-2">
              {typeof window !== 'undefined' && localStorage.getItem('google_drive_token') 
                ? 'No files have been marked as public yet. Mark files as public in the dashboard to see them here.'
                : 'Connect Google Drive in the dashboard to scan for public files'}
            </p>
          </div>
        ) : viewMode === 'feed' ? (
          // TikTok-style feed view - takes full viewport
          <div 
            ref={(el) => {
              feedScrollRef.current = el;
              (swipeRef as React.MutableRefObject<HTMLElement | null>).current = el;
            }}
            className="flex-1 overflow-y-scroll snap-y snap-mandatory h-full"
          >
            {indexedFiles.map((indexedFile) => {
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
                  className="h-screen w-full snap-start flex items-center justify-center bg-black relative"
                >
                  {/* Full-screen video */}
                  {isVideo && videoBlobs.get(file.fileId) && (
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current.set(file.fileId, el);
                      }}
                      src={videoBlobs.get(file.fileId)!}
                      className="w-full h-full object-contain"
                      controls
                      muted
                      loop
                      playsInline
                    />
                  )}
                  
                  {/* Full-screen image */}
                  {isImage && thumbnails.get(file.fileId) && (
                    <img
                      src={thumbnails.get(file.fileId)!}
                      alt={fileName}
                      className="max-w-full max-h-full object-contain"
                    />
                  )}

                  {/* Loading state for images/videos */}
                  {((isImage || isVideo) && !thumbnails.get(file.fileId) && !videoBlobs.get(file.fileId)) && (
                    <div className="flex flex-col items-center justify-center text-neutral-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2"></div>
                      <span className="text-xs">Loading...</span>
                    </div>
                  )}

                  {/* Non-image/video file */}
                  {!isImage && !isVideo && (
                    <div className="flex flex-col items-center justify-center text-neutral-500">
                      <File className="h-24 w-24 mb-4" />
                      <h3 className="text-white text-xl font-medium mb-2">{fileName}</h3>
                      <p className="text-text-secondary text-sm">{file.fileType || 'File'}</p>
                    </div>
                  )}
                  
                  {/* Engagement Sidebar - Right Side */}
                  <FeedEngagementSidebar
                    file={indexedFile}
                    onLike={() => {
                      // TODO: Implement like functionality
                      console.log('Like:', file.fileId);
                    }}
                    onComment={() => {
                      // TODO: Implement comment functionality
                      console.log('Comment:', file.fileId);
                    }}
                    onShare={() => {
                      // TODO: Implement share functionality
                      console.log('Share:', file.fileId);
                    }}
                  />

                  {/* Content Info Overlay - Bottom Left */}
                  <div className="absolute bottom-0 left-0 right-20 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-6">
                    <div className="flex items-center space-x-3 mb-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const creatorId = file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did;
                          if (creatorId) {
                            setViewingCreatorId(creatorId);
                          }
                        }}
                        className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-400" />
                        </div>
                        <div className="text-left">
                          <div className="text-white font-semibold text-sm">
                            {file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did || 'Unknown'}
                          </div>
                          <div className="text-white/70 text-xs">
                            {new Date(file.uploadDate).toLocaleDateString()}
                          </div>
                        </div>
                      </button>
                    </div>
                    
                    <h3 className="text-white text-lg font-semibold mb-2 line-clamp-1">{fileName}</h3>
                    {file.description && (
                      <p className="text-white/90 text-sm mb-3 line-clamp-2">{file.description}</p>
                    )}
                    
                    {(file.keywords || file.tags) && (file.keywords || file.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(file.keywords || file.tags || []).slice(0, 5).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-white/20 text-white text-xs rounded-full"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {file.contentRating && (
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                          {file.contentRating}
                        </span>
                        {file.warningTags && file.warningTags.length > 0 && (
                          <span className="text-white/70 text-xs">
                            {file.warningTags.join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
                  className="bg-neutral-900/60 border border-neutral-700 rounded-xl overflow-hidden hover:bg-neutral-800 transition-colors"
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
                    <div className="flex items-start space-x-3 mb-3">
                      {!isImage && !isVideo && (
                        <div className="flex-shrink-0 w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                          <File className="h-6 w-6 text-blue-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">{fileName}</h3>
                        <p className="text-text-secondary text-xs mt-1">
                          {isVideo ? 'Video' : file.fileType === 'image' ? 'Image' : file.fileType || 'File'} • {new Date(file.uploadDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                  {file.description && (
                    <p className="text-text-secondary text-sm mb-3 line-clamp-2">{file.description}</p>
                  )}

                  <div className="flex items-center space-x-2 text-xs text-text-secondary mb-3">
                    <User className="h-3 w-3" />
                    <span className="truncate">
                      {file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did || 'Unknown'}
                    </span>
                  </div>

                  {(file.keywords || file.tags) && (file.keywords || file.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(file.keywords || file.tags || []).slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded flex items-center space-x-1"
                        >
                          <Tag className="h-3 w-3" />
                          <span>{tag}</span>
                        </span>
                      ))}
                      {(file.keywords || file.tags || []).length > 3 && (
                        <span className="px-2 py-0.5 text-text-secondary text-xs">
                          +{(file.keywords || file.tags || []).length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                    <div className="flex items-center justify-between pt-3 border-t border-neutral-700">
                      <span className="text-xs text-text-secondary">
                        {file.backend}
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            // Extract token from metadata
                            const tokenString = file.publicToken;
                            if (!tokenString) {
                              alert('This file does not have a share token yet. Please make it private and then public again in the dashboard to generate a token (Phase 3).');
                              return;
                            }

                            let token: ShareToken;
                            try {
                              token = typeof tokenString === 'string' ? JSON.parse(tokenString) : tokenString;
                            } catch (e) {
                              alert('Invalid share token format.');
                              return;
                            }

                            // Decrypt using token
                            setIsLoading(true);
                            const decryptedBlob = await decryptWithToken(token);
                            const url = URL.createObjectURL(decryptedBlob);
                            
                            setViewingFile({ file: indexedFile, blob: decryptedBlob, url });
                            setIsLoading(false);
                          } catch (err) {
                            setIsLoading(false);
                            const errorMessage = err instanceof Error ? err.message : 'Failed to decrypt file';
                            alert(`Decryption failed: ${errorMessage}`);
                            console.error('Token decryption error:', err);
                          }
                        }}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={file.publicToken ? "View decrypted file" : "Click to see token status"}
                      >
                        <Download className="h-3 w-3" />
                        <span>{isLoading ? 'Decrypting...' : 'View'}</span>
                      </button>
                    </div>

                    {/* Note about decryption */}
                    <p className="text-xs text-text-secondary mt-2 italic">
                      {file.publicToken ? '✅ Token available - Click View to decrypt' : '⚠️ No token - Make file private then public again in dashboard'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* File Viewer Modal */}
        {viewingFile && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 rounded-xl max-w-4xl max-h-[90vh] w-full flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-neutral-700">
                <h3 className="text-white font-medium">{viewingFile.file.metadata.name || viewingFile.file.metadata.title || 'Decrypted File'}</h3>
                <button
                  onClick={() => {
                    if (viewingFile.url) URL.revokeObjectURL(viewingFile.url);
                    setViewingFile(null);
                  }}
                  className="text-text-secondary hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {viewingFile.blob.type.startsWith('image/') ? (
                  <img 
                    src={viewingFile.url} 
                    alt={viewingFile.file.metadata.name || 'Decrypted image'}
                    className="max-w-full max-h-[70vh] mx-auto"
                  />
                ) : viewingFile.blob.type.startsWith('video/') ? (
                  <video 
                    src={viewingFile.url} 
                    controls
                    className="max-w-full max-h-[70vh] mx-auto"
                  />
                ) : viewingFile.blob.type.startsWith('audio/') ? (
                  <audio 
                    src={viewingFile.url} 
                    controls
                    className="w-full"
                  />
                ) : (
                  <div className="text-center py-12">
                    <File className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                    <p className="text-text-secondary mb-4">File type: {viewingFile.blob.type}</p>
                    <a
                      href={viewingFile.url}
                      download={viewingFile.file.metadata.name || 'file'}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center space-x-2"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download File</span>
                    </a>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-neutral-700 flex items-center justify-between">
                <span className="text-xs text-text-secondary">
                  Decrypted via share token (Phase 3)
                </span>
                <a
                  href={viewingFile.url}
                  download={viewingFile.file.metadata.name || 'file'}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center space-x-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Feed Browser Modal */}
        {showFeedBrowser && (
          <FeedBrowser
            feeds={feeds}
            onClose={() => setShowFeedBrowser(false)}
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
      </div>
    </div>
  );
}

export default App;

