/**
 * Discovery Page Component
 * YouTube-style grid view for discovering creators and content
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { IndexedFile, Feed } from '../types/aggregator';
import { FEED_CATEGORIES } from '../constants/feedCategories';
import { Info, Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { getUserProfile } from '../services/profileService';
import { cleanTitle } from '../utils/cleanTitle';
import { isNSFWContent } from '../constants/contentRatings';
import { ShareToken } from '../utils/tokenDecryption';

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
  thumbnails: externalThumbnails,
  onFileClick,
  onFeedClick,
  onCreatorClick
}: DiscoveryPageProps) {
  const { userState, getDisplayName, setUserDisplayName } = useUserState();
  const [activeTopFeed, setActiveTopFeed] = useState<TopFeedOption>('all');
  const [selectedNiche, setSelectedNiche] = useState<NicheFeedOption>(null);
  const [showInfo, setShowInfo] = useState<string | null>(null);
  // Use ref to track fetched creators to avoid re-fetching (persists across renders)
  const fetchedCreatorsRef = useRef<Set<string>>(new Set());
  // Track blob URLs we create for cleanup
  const createdBlobUrlsRef = useRef<Set<string>>(new Set());
  
  // Local thumbnails state (starts with external thumbnails, can load additional ones)
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(externalThumbnails || new Map());

  // Sync external thumbnails into local state when they change
  useEffect(() => {
    if (externalThumbnails) {
      setThumbnails(prev => {
        const newMap = new Map(prev);
        externalThumbnails.forEach((url, fileId) => {
          newMap.set(fileId, url);
        });
        return newMap;
      });
    }
  }, [externalThumbnails]);

  // Load thumbnails for all thumbnail files in the feed (same logic as FullScreenFeed)
  useEffect(() => {
    const loadThumbnails = async () => {
      // Process ALL files to find thumbnail files
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
          console.warn(`[DiscoveryPage] Thumbnail ${fileId} (${fileName}) has no publicToken - cannot decrypt`);
          return;
        }

        try {
          // Parse publicToken
          let token: ShareToken;
          try {
            token = typeof publicToken === 'string' ? JSON.parse(publicToken) : publicToken;
          } catch (e) {
            console.warn(`[DiscoveryPage] Failed to parse token for thumbnail ${fileId}:`, e);
            return;
          }
          
          // Decrypt using token directly (token contains shareEncrypted data)
          // No need to fetch from API - the token has everything we need
          const { decryptWithToken } = await import('../utils/tokenDecryption');
          const decryptedBlob = await decryptWithToken(token);
          const thumbnailUrlObj = URL.createObjectURL(decryptedBlob);
          
          // Track this blob URL for cleanup
          createdBlobUrlsRef.current.add(thumbnailUrlObj);
          
          setThumbnails(prev => {
            const newMap = new Map(prev);
            newMap.set(fileId, thumbnailUrlObj);
            return newMap;
          });
        } catch (err) {
          console.error(`[DiscoveryPage] Failed to decrypt thumbnail for ${fileId} (${fileName}):`, err);
        }
      }));
    };

    loadThumbnails();
  }, [files, externalThumbnails, thumbnails]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      // Revoke all blob URLs we created when component unmounts
      createdBlobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (err) {
          // Ignore errors during cleanup
        }
      });
      createdBlobUrlsRef.current.clear();
    };
  }, []);

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
      return userState.preferences.hasAgeZKP && 
             userState.preferences.isOver18 && 
             userState.preferences.showNSFW;
    }
    
    // Show public (non-NSFW) content
    return true;
  };

  // Helper to calculate client-side recommendation score
  // For public feed: uses public algorithm only (engagement + recency)
  // For personalized feeds: uses full algorithm (public + user preferences)
  const calculateClientScore = (file: IndexedFile, usePersonalization: boolean = false): number => {
    // Use recommendationScore from metadata if available
    if ((file.metadata as any).recommendationScore !== undefined) {
      return (file.metadata as any).recommendationScore;
    }

    // Fallback: simple client-side calculation
    const engagement = file.metadata.engagement;
    const engagementScore = (engagement?.likes || 0) + 
                            (engagement?.comments || 0) * 2 + 
                            (engagement?.shares || 0) * 1.5;

    // Recency score (decay by 2 points per day)
    const uploadDate = file.metadata.uploadDate 
      ? new Date(file.metadata.uploadDate).getTime()
      : Date.now();
    const daysSinceUpload = (Date.now() - uploadDate) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 100 - (daysSinceUpload * 2));

    // Combine engagement (70%) and recency (30%)
    let score = (engagementScore * 0.7) + (recencyScore * 0.3);

    // Add personalization adjustments if enabled
    if (usePersonalization && userState.isUnlocked) {
      // Boost for subscribed subjects
      const fileSubjects = (file.metadata.subjects || []).map(s => s.toLowerCase().trim());
      const subscribedSubjects = (userState.preferences.subscribedSubjects || []).map(s => s.toLowerCase().trim());
      if (subscribedSubjects.length > 0 && fileSubjects.some(s => subscribedSubjects.includes(s))) {
        score += 15;
      }

      // Penalty for blocked subjects
      const blockedSubjects = (userState.preferences.blockedSubjects || []).map(s => s.toLowerCase().trim());
      if (blockedSubjects.length > 0 && fileSubjects.some(s => blockedSubjects.includes(s))) {
        score -= 30;
      }

      // Boost for subscribed feeds
      const subscribedFeedIds = userState.preferences.subscribedFeedIds || [];
      if (subscribedFeedIds.length > 0 && file.metadata.feedIds?.some(id => subscribedFeedIds.includes(id))) {
        score += 15;
      }
    }

    return Math.max(0, score);
  };

  // Helper to sort files by recommendation score
  const sortByScore = (files: IndexedFile[], usePersonalization: boolean = false): IndexedFile[] => {
    return [...files].sort((a, b) => {
      const scoreA = calculateClientScore(a, usePersonalization);
      const scoreB = calculateClientScore(b, usePersonalization);
      return scoreB - scoreA; // Descending order (highest first)
    });
  };

  // Get trending files (most engagement, using recommendation scores if available)
  const trendingFiles = useMemo(() => {
    return [...files]
      .sort((a, b) => {
        // Use recommendationScore if available (from weighted algorithm), otherwise fallback to simple engagement
        const aScore = (a.metadata as any).recommendationScore || 
          ((a.metadata.engagement?.likes || 0) + 
           (a.metadata.engagement?.comments || 0) + 
           (a.metadata.engagement?.shares || 0));
        const bScore = (b.metadata as any).recommendationScore || 
          ((b.metadata.engagement?.likes || 0) + 
           (b.metadata.engagement?.comments || 0) + 
           (b.metadata.engagement?.shares || 0));
        return bScore - aScore;
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
      // Prefer pnIdentifier from API, then fall back to metadata fields
      const creatorId = file.pnIdentifier ||
                       file.metadata.creator?.identifier?.value || 
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


  // Get files filtered by NSFW, niche, and top feed
  // Filtering order: 1) NSFW filter, 2) Niche filter, 3) Top feed filter, 4) Scoring algorithm
  // Example: "Classics" + "All" → shows all classics (filtered by NSFW and sorted)
  // Example: "Sports & Fitness" + "Classics" → shows only sports & fitness classics (filtered by NSFW and sorted)
  const filteredFiles = useMemo(() => {
    // Step 1: Apply NSFW filtering first
    let filtered = files.filter(file => shouldShowFile(file));
    
    // Step 2: Filter by niche if selected (null means "All" niches)
    if (selectedNiche) {
      filtered = filtered.filter(file => 
        file.metadata.feedCategories?.includes(selectedNiche as any) ||
        file.metadata.feedIds?.some(feedId => {
          const feed = feeds.find(f => f.feedId === feedId);
          return feed?.feedCategory === selectedNiche;
        })
      );
    }
    
    // Step 3: Apply top feed filter (sorts/filters the already niche-filtered results)
    switch (activeTopFeed) {
      case 'all':
        // "All" feed: Show all files (already filtered by NSFW and niche if selected)
        // Apply scoring algorithm based on user lock state
        filtered = sortByScore(filtered, userState.isUnlocked);
        break;
      case 'trending':
        // Trending: Sort by score and take top 100
        filtered = sortByScore(filtered, userState.isUnlocked).slice(0, 100);
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
        // Apply scoring algorithm
        filtered = sortByScore(filtered, userState.isUnlocked);
        break;
      case 'classics':
        filtered = filtered.filter(file => {
          const uploadDate = new Date(file.metadata.uploadDate);
          const daysOld = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysOld > 30; // At least 30 days old
        });
        // Apply scoring algorithm and take top 100
        filtered = sortByScore(filtered, userState.isUnlocked).slice(0, 100);
        break;
    }
    
    return filtered;
  }, [files, feeds, selectedNiche, activeTopFeed, userState.isUnlocked, userState.preferences.showNSFW, userState.preferences.hasAgeZKP, userState.preferences.isOver18, userState.preferences.subscribedSubjects, userState.preferences.blockedSubjects, userState.preferences.subscribedFeedIds]);

  // Helper to check if file is a collection
  const isCollection = (file: IndexedFile): boolean => {
    const collectionData = file.metadata?.collection;
    return file.metadata.fileType === 'collection' && 
           collectionData?.collectionFileIds && 
           Array.isArray(collectionData.collectionFileIds) &&
           collectionData.collectionFileIds.length > 0;
  };

  // Helper to get thumbnail URL for a file
  const getThumbnail = (file: IndexedFile): string => {
    if (thumbnails.has(file.metadata.fileId)) {
      return thumbnails.get(file.metadata.fileId)!;
    }
    return file.thumbnail || '/placeholder-thumbnail.png';
  };

  // Helper to get thumbnails for collection files
  const getCollectionThumbnails = (file: IndexedFile): string[] => {
    const collectionData = file.metadata?.collection;
    if (!collectionData?.collectionFileIds) return [];
    
    return collectionData.collectionFileIds
      .map((fileId: string) => {
        // First try thumbnails map
        if (thumbnails.has(fileId)) {
          return thumbnails.get(fileId)!;
        }
        // Then try to find the file in the files array and use its thumbnail
        const collectionFile = files.find(f => f.metadata.fileId === fileId);
        if (collectionFile) {
          return collectionFile.thumbnail || getThumbnail(collectionFile);
        }
        return null;
      })
      .filter((url): url is string => url !== null);
  };

  // Helper to get creator ID from file metadata (pnIdentifier is primary, others are compatibility fallbacks)
  const getCreatorId = (file: IndexedFile): string => {
    // PRIMARY: Use top-level pnIdentifier field first
    if (file.pnIdentifier) {
      return file.pnIdentifier;
    }
    
    // FALLBACK: Use metadata fields only for compatibility with older data
    const creatorId = file.metadata.creator?.identifier?.value || 
                      file.metadata.creator?.["@id"] || 
                      file.metadata.author?.did ||
                      file.metadata.creatorId ||
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
    
    // If displayName is still the full DID/creatorId, check if we're still loading
    // Don't show shortened version - wait for profile to load
    // The platform name should be fetched and cached by the useEffect above
    if (displayName === creatorId) {
      // Check if this creator is being fetched
      if (fetchedCreatorsRef.current.has(creatorId)) {
        // Still loading - return the DID for now, it will update when profile loads
        return creatorId;
      }
      // Not being fetched yet - return DID (will be fetched soon)
      return creatorId;
    }
    
    return displayName;
  };

  // Force re-render when display names are updated
  const [displayNamesVersion, setDisplayNamesVersion] = useState(0);
  
  // Watch for changes in userDisplayNames to trigger re-render
  useEffect(() => {
    setDisplayNamesVersion(prev => prev + 1);
  }, [userState.preferences.userDisplayNames]);

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
        title: cleanTitle(file.metadata.title || file.metadata.name),
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
    // Batch with delays to avoid rate limiting
    const fetchProfiles = async () => {
      const creatorsToFetch = Array.from(uniqueCreatorIds).filter(creatorId => {
        // Skip if already cached
        if (userState.preferences.userDisplayNames?.[creatorId]) {
          return false;
        }
        
        // Skip if already being fetched (use ref to persist across renders)
        if (fetchedCreatorsRef.current.has(creatorId)) {
          return false;
        }
        
        // Skip if it's the current user (they already have their display name)
        if (creatorId === userState.pnIdentifier) {
          return false;
        }
        
        return true;
      });
      
      // If no creators to fetch, exit early
      if (creatorsToFetch.length === 0) {
        return;
      }
      
      // Fetch profiles with a small delay between each to avoid rate limiting
      for (let i = 0; i < creatorsToFetch.length; i++) {
        const creatorId = creatorsToFetch[i];
        
        // Mark as being fetched (use ref to persist across renders)
        fetchedCreatorsRef.current.add(creatorId);
        
        // Add delay between requests (except first one)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between requests
        }
        
        getUserProfile(creatorId)
          .then(profile => {
            if (profile?.displayName) {
              setUserDisplayName(creatorId, profile.displayName);
              // Force re-render by updating version (but don't include in deps to avoid loop)
              setDisplayNamesVersion(prev => prev + 1);
            }
          })
          .catch((error) => {
            // Silently fail - profile may not exist or API may not be available
            // The DID will be displayed until profile is loaded
          });
      }
    };
    
    fetchProfiles();
    // Only depend on files.length and pnIdentifier - not userDisplayNames to avoid loops
    // setUserDisplayName is stable from context, so we don't need it in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, userState.pnIdentifier]);

  // Ref for top feed railway container
  const topFeedRailRef = React.useRef<HTMLDivElement>(null);
  // Ref for niche feed railway container
  const nicheFeedRailRef = React.useRef<HTMLDivElement>(null);
  
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

  // Center active niche feed option on screen
  React.useEffect(() => {
    if (nicheFeedRailRef.current) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        const activeButton = nicheFeedRailRef.current?.querySelector(`[data-niche-feed="${selectedNiche || 'all'}"]`) as HTMLElement;
        if (activeButton && nicheFeedRailRef.current) {
          const container = nicheFeedRailRef.current;
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
  }, [selectedNiche]);

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
        <div 
          ref={nicheFeedRailRef}
          className="mt-3 flex items-center space-x-3 sm:space-x-4 overflow-x-auto scrollbar-hide pb-2"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingLeft: '50%',
            paddingRight: '50%'
          }}
        >
          {/* All button */}
          <button
            data-niche-feed="all"
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
            .map(category => {
              const isActive = selectedNiche === category.id;
              return (
                <button
                  key={category.id}
                  data-niche-feed={category.id}
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
                {item.type === 'file' && isCollection(item.item as IndexedFile) ? (
                  // Render collection as slideshow of thumbnails
                  (() => {
                    const file = item.item as IndexedFile;
                    const collectionThumbnails = getCollectionThumbnails(file);
                    const collectionData = file.metadata?.collection;
                    const collectionFileIds = collectionData?.collectionFileIds || [];
                    
                    if (collectionThumbnails.length > 0) {
                      return (
                        <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                          {collectionThumbnails.map((thumbnailUrl, idx) => (
                            <div
                              key={`${file.metadata.fileId}-${idx}`}
                              className="flex-shrink-0 w-full h-full snap-start"
                            >
                              <img
                                src={thumbnailUrl}
                                alt={`${item.title} - ${idx + 1}`}
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
                      // Fallback: show placeholder with collection count
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400">
                          <div className="text-4xl mb-2">📚</div>
                          <div className="text-sm">Collection</div>
                          <div className="text-xs mt-1">{collectionFileIds.length} files</div>
                        </div>
                      );
                    }
                  })()
                ) : (
                  // Render regular thumbnail (includes thought thumbnails which are just PNG images)
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder-thumbnail.png';
                    }}
                  />
                )}
                
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

