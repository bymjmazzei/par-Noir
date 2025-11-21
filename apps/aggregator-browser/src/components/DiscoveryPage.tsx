/**
 * Discovery Page Component
 * YouTube-style grid view for discovering creators and content
 */

import React, { useState, useMemo, useEffect } from 'react';
import { IndexedFile, Feed } from '../types/aggregator';
import { FEED_CATEGORIES } from '../constants/feedCategories';
import { Info, Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { getUserProfile } from '../services/profileService';

interface DiscoveryPageProps {
  files: IndexedFile[];
  feeds: Feed[];
  thumbnails?: Map<string, string>; // Thumbnail URLs by fileId
  onFileClick: (file: IndexedFile) => void;
  onFeedClick: (feed: Feed) => void;
  onCreatorClick: (creatorId: string) => void;
}

type TopFeedOption = 'all' | 'trending' | 'featured' | 'classics' | 'new-creators';
type NicheFeedOption = string | null; // Feed category ID

export function DiscoveryPage({
  files,
  feeds,
  thumbnails,
  onFileClick,
  onFeedClick,
  onCreatorClick
}: DiscoveryPageProps) {
  const { userState, getDisplayName, setUserDisplayName } = useUserState();
  const [activeTopFeed, setActiveTopFeed] = useState<TopFeedOption>('all');
  const [selectedNiche, setSelectedNiche] = useState<NicheFeedOption>(null);
  const [showInfo, setShowInfo] = useState<string | null>(null);
  const [fetchedCreators, setFetchedCreators] = useState<Set<string>>(new Set());

  // Get trending files (most engagement)
  const trendingFiles = useMemo(() => {
    return [...files]
      .sort((a, b) => {
        const aEngagement = (a.metadata.engagement?.likes || 0) + 
                           (a.metadata.engagement?.comments || 0) + 
                           (a.metadata.engagement?.shares || 0);
        const bEngagement = (b.metadata.engagement?.likes || 0) + 
                           (b.metadata.engagement?.comments || 0) + 
                           (b.metadata.engagement?.shares || 0);
        return bEngagement - aEngagement;
      })
      .slice(0, 20);
  }, [files]);

  // Get new creators (recent uploads from new creators)
  const newCreators = useMemo(() => {
    const creatorMap = new Map<string, { 
      files: IndexedFile[]; 
      latestUpload: Date;
      totalViews7Days: number;
      primaryNiche: string | null;
    }>();
    
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      const creatorId = file.metadata.creator?.identifier?.value || 
                       file.metadata.creator?.["@id"] || 
                       file.metadata.author?.did;
      if (!creatorId) return;

      const uploadDate = new Date(file.metadata.uploadDate);
      const existing = creatorMap.get(creatorId);
      
      // Calculate views in last 7 days
      const fileViews = file.metadata.engagement?.views || 0;
      const fileUploadTime = uploadDate.getTime();
      const views7Days = fileUploadTime >= sevenDaysAgo ? fileViews : 0;
      
      // Determine primary niche from file categories
      const fileNiche = file.metadata.feedCategories?.[0] || 
                       file.metadata.category || 
                       null;
      
      if (!existing || uploadDate > existing.latestUpload) {
        creatorMap.set(creatorId, {
          files: [file],
          latestUpload: uploadDate,
          totalViews7Days: views7Days,
          primaryNiche: fileNiche
        });
      } else {
        existing.files.push(file);
        existing.totalViews7Days += views7Days;
        // Update primary niche if this file has more engagement
        if (fileNiche && fileViews > (existing.files[0].metadata.engagement?.views || 0)) {
          existing.primaryNiche = fileNiche;
        }
      }
    });

    // Sort by latest upload date (newest first)
    return Array.from(creatorMap.entries())
      .sort((a, b) => b[1].latestUpload.getTime() - a[1].latestUpload.getTime())
      .slice(0, 20)
      .map(([creatorId, data]) => ({
        creatorId,
        file: data.files[0], // Use first file as thumbnail
        fileCount: data.files.length,
        totalViews7Days: data.totalViews7Days,
        primaryNiche: data.primaryNiche
      }));
  }, [files]);


  // Get files filtered by top feed and niche
  const filteredFiles = useMemo(() => {
    let filtered = [...files];
    
    // First filter by niche if selected
    if (selectedNiche) {
      filtered = filtered.filter(file => 
        file.metadata.feedCategories?.includes(selectedNiche as any) ||
        file.metadata.feedIds?.some(feedId => {
          const feed = feeds.find(f => f.feedId === feedId);
          return feed?.feedCategory === selectedNiche;
        })
      );
    }
    
    // Then apply top feed filter
    switch (activeTopFeed) {
      case 'all':
        // Show all files (already filtered by niche if selected)
        break;
      case 'trending':
        filtered = filtered.sort((a, b) => {
          const aEngagement = (a.metadata.engagement?.likes || 0) + 
                             (a.metadata.engagement?.comments || 0) + 
                             (a.metadata.engagement?.shares || 0);
          const bEngagement = (b.metadata.engagement?.likes || 0) + 
                             (b.metadata.engagement?.comments || 0) + 
                             (b.metadata.engagement?.shares || 0);
          return bEngagement - aEngagement;
        }).slice(0, 100);
        break;
      case 'featured':
        // Featured feeds with most content
        const featuredFeedIds = feeds
          .filter(feed => feed.postCount && feed.postCount > 0)
          .sort((a, b) => (b.postCount || 0) - (a.postCount || 0))
          .slice(0, 10)
          .map(f => f.feedId);
        filtered = filtered.filter(file => 
          file.metadata.feedIds?.some(feedId => featuredFeedIds.includes(feedId))
        );
        break;
      case 'classics':
        filtered = filtered.filter(file => {
          const uploadDate = new Date(file.metadata.uploadDate);
          const daysOld = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysOld > 30; // At least 30 days old
        }).sort((a, b) => {
          const aEngagement = (a.metadata.engagement?.likes || 0) + 
                             (a.metadata.engagement?.comments || 0);
          const bEngagement = (b.metadata.engagement?.likes || 0) + 
                             (b.metadata.engagement?.comments || 0);
          return bEngagement - aEngagement;
        }).slice(0, 100);
        break;
    }
    
    return filtered;
  }, [files, feeds, selectedNiche, activeTopFeed]);

  // Helper to get thumbnail URL for a file
  const getThumbnail = (file: IndexedFile): string => {
    if (thumbnails && thumbnails.has(file.metadata.fileId)) {
      return thumbnails.get(file.metadata.fileId)!;
    }
    return file.thumbnail || '/placeholder-thumbnail.png';
  };

  // Helper to get creator ID from file metadata (prefer pN identifier over DID)
  const getCreatorId = (file: IndexedFile): string => {
    // Try to get pN identifier first, then fall back to DID
    const creatorId = file.metadata.creator?.identifier?.value || 
                      file.metadata.creator?.["@id"] || 
                      file.metadata.author?.did ||
                      'Unknown';
    return creatorId;
  };
  
  // Helper to get creator display name from metadata
  const getCreatorDisplayName = (file: IndexedFile, creatorId: string): string => {
    // First check the cache - this should have the platform name from profile icon editor
    const cachedDisplayName = userState.preferences.userDisplayNames?.[creatorId];
    if (cachedDisplayName) {
      return cachedDisplayName;
    }
    
    // Try to get username from author metadata
    const username = file.metadata.author?.username;
    if (username) {
      const displayName = getDisplayName(creatorId, username);
      // If we got a username and it's different from creatorId, use it
      if (displayName && displayName !== creatorId) {
        return displayName;
      }
      // If username exists but displayName is still creatorId, use username directly
      if (username) {
        return username;
      }
    }
    
    // Try to get name from creator metadata
    const creatorName = (file.metadata.creator as any)?.name || 
                       (file.metadata.creator as any)?.displayName;
    if (creatorName) {
      const displayName = getDisplayName(creatorId, creatorName);
      if (displayName && displayName !== creatorId) {
        return displayName;
      }
      return creatorName;
    }
    
    // Use getDisplayName which will check cache and fallback to creatorId
    const displayName = getDisplayName(creatorId);
    
    // If displayName is still the full DID/creatorId, show a shortened version
    // The platform name should be fetched and cached by the useEffect above
    if (displayName === creatorId && creatorId.length > 20) {
      // Show shortened version while waiting for profile to load
      return creatorId.substring(0, 12) + '...';
    }
    
    return displayName;
  };

  const getDisplayItems = () => {
    // Show new creators in a separate section
    if (activeTopFeed === 'new-creators') {
      return newCreators.map(creator => {
        // Use the same display name logic as media tiles
        const creatorDisplayName = getCreatorDisplayName(creator.file, creator.creatorId);
        const nicheName = creator.primaryNiche 
          ? FEED_CATEGORIES[creator.primaryNiche as keyof typeof FEED_CATEGORIES]?.name || creator.primaryNiche
          : null;
        return {
          type: 'creator' as const,
          id: creator.creatorId,
          item: creator.file,
          thumbnail: getThumbnail(creator.file),
          title: creatorDisplayName,
          subtitle: `${creator.totalViews7Days.toLocaleString()} views (7 days)`,
          metadata: nicheName || 'Creator',
          engagement: {
            likes: creator.file.metadata.engagement?.likes || 0,
            comments: creator.file.metadata.engagement?.comments || 0,
            shares: creator.file.metadata.engagement?.shares || 0,
            saves: (creator.file.metadata.engagement as any)?.saves || 0
          }
        };
      });
    }
    
    // Show filtered files
    return filteredFiles.map(file => {
      const creatorId = getCreatorId(file);
      const displayName = getCreatorDisplayName(file, creatorId);
      return {
        type: 'file' as const,
        id: file.metadata.fileId,
        item: file,
        thumbnail: getThumbnail(file),
        title: file.metadata.name || file.metadata.title || 'Untitled',
        subtitle: displayName,
        metadata: '',
        engagement: {
          likes: file.metadata.engagement?.likes || 0,
          comments: file.metadata.engagement?.comments || 0,
          shares: file.metadata.engagement?.shares || 0,
          saves: (file.metadata.engagement as any)?.saves || 0
        }
      };
    });
  };

  const handleItemClick = (item: any) => {
    if (item.type === 'file') {
      onFileClick(item.item);
    } else if (item.type === 'feed') {
      onFeedClick(item.item);
    } else if (item.type === 'creator') {
      onCreatorClick(item.id);
    }
  };

  // Fetch display names for creators that don't have cached names
  useEffect(() => {
    const uniqueCreatorIds = new Set<string>();
    
    // Collect unique creator IDs from files
    files.forEach(file => {
      const creatorId = getCreatorId(file);
      if (creatorId && creatorId !== 'Unknown') {
        uniqueCreatorIds.add(creatorId);
      }
    });
    
    // Fetch display names for creators that aren't cached and haven't been fetched yet
    uniqueCreatorIds.forEach(creatorId => {
      // Skip if already cached
      if (userState.preferences.userDisplayNames?.[creatorId]) {
        return;
      }
      
      // Skip if already being fetched
      if (fetchedCreators.has(creatorId)) {
        return;
      }
      
      // Skip if it's the current user (they already have their display name)
      if (creatorId === userState.pnIdentifier) {
        return;
      }
      
      // Mark as being fetched
      setFetchedCreators(prev => new Set(prev).add(creatorId));
      
      // Fetch profile asynchronously
      getUserProfile(creatorId)
        .then(profile => {
          if (profile?.displayName) {
            setUserDisplayName(creatorId, profile.displayName);
          }
        })
        .catch((error) => {
          // Silently fail - profile may not exist
          // The profile service might skip DIDs, which is fine
          console.debug('Failed to fetch profile for creator:', creatorId.substring(0, 20) + '...');
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, userState.preferences.userDisplayNames, userState.pnIdentifier, setUserDisplayName]);

  // Ref for top feed railway container
  const topFeedRailRef = React.useRef<HTMLDivElement>(null);
  
  // Center active top feed option on screen
  React.useEffect(() => {
    if (topFeedRailRef.current) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        const activeButton = topFeedRailRef.current?.querySelector(`[data-top-feed="${activeTopFeed}"]`) as HTMLElement;
        if (activeButton && topFeedRailRef.current) {
          const container = topFeedRailRef.current;
          const containerWidth = container.clientWidth;
          const buttonLeft = activeButton.offsetLeft;
          const buttonWidth = activeButton.offsetWidth;
          const screenWidth = window.innerWidth;
          const scrollLeft = buttonLeft - (screenWidth / 2) + (buttonWidth / 2);
          
          container.scrollTo({
            left: Math.max(0, scrollLeft),
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [activeTopFeed]);

  return (
    <div className="h-full overflow-y-auto bg-neutral-900">
      {/* Top Feed Railway - Text only, no backgrounds, active option bold and centered */}
      <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700">
        <div 
          ref={topFeedRailRef}
          className="flex items-center space-x-6 overflow-x-auto scrollbar-hide py-3"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingLeft: '50%',
            paddingRight: '50%'
          }}
        >
          {(['all', 'trending', 'featured', 'classics', 'new-creators'] as TopFeedOption[]).map((option) => {
            const isActive = activeTopFeed === option;
            const label = option === 'all' ? 'All' : 
                         option === 'new-creators' ? 'New Creators' :
                         option.charAt(0).toUpperCase() + option.slice(1);
            return (
              <button
                key={option}
                data-top-feed={option}
                onClick={() => setActiveTopFeed(option)}
                className={`whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? 'font-bold text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
                style={{
                  textAlign: 'center'
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Niche Feed Railway - Separate railway underneath, text only, active centered and underlined */}
        <div className="mt-3 flex items-center space-x-3 sm:space-x-4 overflow-x-auto scrollbar-hide pb-2 px-4">
          {/* All button */}
          <button
            onClick={() => setSelectedNiche(null)}
            className={`whitespace-nowrap transition-all text-xs sm:text-sm flex-shrink-0 px-2 ${
              selectedNiche === null
                ? 'text-white underline'
                : 'text-neutral-400 hover:text-white'
            }`}
            style={{
              textAlign: 'center',
              textDecoration: selectedNiche === null ? 'underline' : 'none',
              textUnderlineOffset: '4px'
            }}
          >
            All
          </button>
          
          {Object.values(FEED_CATEGORIES)
            .filter(cat => cat.id !== 'adults-only' || userState.preferences.ageVerified)
            .map(category => {
              const isActive = selectedNiche === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedNiche(isActive ? null : category.id)}
                  className={`whitespace-nowrap transition-all text-xs sm:text-sm flex-shrink-0 px-2 ${
                    isActive
                      ? 'text-white underline'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                  style={{
                    textAlign: 'center',
                    textDecoration: isActive ? 'underline' : 'none',
                    textUnderlineOffset: '4px'
                  }}
                >
                  {category.name}
                </button>
              );
            })}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {getDisplayItems().map((item) => (
            <div
              key={item.id}
              className="group relative cursor-pointer"
              onClick={() => handleItemClick(item)}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-neutral-800 rounded-lg overflow-hidden mb-2">
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder-thumbnail.png';
                  }}
                />
                
                {/* Info Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInfo(showInfo === item.id ? null : item.id);
                  }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Show info"
                >
                  <Info className="h-4 w-4 text-white" />
                </button>

                {/* Info Tooltip */}
                {showInfo === item.id && (
                  <div className="absolute top-12 right-2 bg-black/90 text-white text-xs rounded-lg p-3 max-w-[200px] z-20">
                    <div className="font-semibold mb-1">{item.title}</div>
                    <div className="text-neutral-300 mb-1">{item.subtitle}</div>
                    {item.metadata && (
                      <div className="text-neutral-400">{item.metadata}</div>
                    )}
                    {item.type === 'file' && (item.item as IndexedFile).metadata.description && (
                      <div className="mt-2 text-neutral-300 line-clamp-2">
                        {(item.item as IndexedFile).metadata.description}
                      </div>
                    )}
                    {item.type === 'feed' && (item.item as Feed).feedDescription && (
                      <div className="mt-2 text-neutral-300 line-clamp-2">
                        {(item.item as Feed).feedDescription}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Title */}
              <h3 className="text-white text-sm font-medium line-clamp-2 mb-1">
                {item.title}
              </h3>

              {/* Subtitle - Platform Name */}
              <p className="text-neutral-400 text-xs line-clamp-1 mt-1">
                {item.subtitle}
              </p>

              {/* Engagement Bar - Icons with numbers overlaid */}
              {item.engagement && (
                <div className="flex items-center justify-start space-x-3 mt-2">
                  <div className="relative flex items-center">
                    <Heart className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="absolute -top-1 -right-1 text-[10px] font-medium text-white bg-neutral-800 rounded-full px-1 min-w-[14px] text-center">
                      {item.engagement.likes > 0 ? (item.engagement.likes > 999 ? '999+' : item.engagement.likes.toLocaleString()) : ''}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <MessageCircle className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="absolute -top-1 -right-1 text-[10px] font-medium text-white bg-neutral-800 rounded-full px-1 min-w-[14px] text-center">
                      {item.engagement.comments > 0 ? (item.engagement.comments > 999 ? '999+' : item.engagement.comments.toLocaleString()) : ''}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <Share2 className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="absolute -top-1 -right-1 text-[10px] font-medium text-white bg-neutral-800 rounded-full px-1 min-w-[14px] text-center">
                      {item.engagement.shares > 0 ? (item.engagement.shares > 999 ? '999+' : item.engagement.shares.toLocaleString()) : ''}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <Bookmark className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="absolute -top-1 -right-1 text-[10px] font-medium text-white bg-neutral-800 rounded-full px-1 min-w-[14px] text-center">
                      {item.engagement.saves > 0 ? (item.engagement.saves > 999 ? '999+' : item.engagement.saves.toLocaleString()) : ''}
                    </span>
                  </div>
                </div>
              )}

              {/* Metadata - For new creators, show niche identifier */}
              {item.metadata && item.type === 'creator' && (
                <p className="text-neutral-500 text-xs mt-1">
                  {item.metadata}
                </p>
              )}
            </div>
          ))}
        </div>

        {getDisplayItems().length === 0 && (
          <div className="text-center py-12">
            <p className="text-neutral-400">No content found in this category</p>
          </div>
        )}
      </div>
    </div>
  );
}

