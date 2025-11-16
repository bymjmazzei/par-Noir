/**
 * Discovery Page Component
 * YouTube-style grid view for discovering creators and content
 */

import React, { useState, useMemo } from 'react';
import { IndexedFile, Feed } from '../types/aggregator';
import { FEED_CATEGORIES, FeedCategoryInfo } from '../constants/feedCategories';
import { Info, TrendingUp, Sparkles, Star, Clock, Users } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';

interface DiscoveryPageProps {
  files: IndexedFile[];
  feeds: Feed[];
  thumbnails?: Map<string, string>; // Thumbnail URLs by fileId
  onFileClick: (file: IndexedFile) => void;
  onFeedClick: (feed: Feed) => void;
  onCreatorClick: (creatorId: string) => void;
}

type DiscoveryCategory = 'trending' | 'new-creators' | 'featured' | 'classics' | 'niches';

export function DiscoveryPage({
  files,
  feeds,
  thumbnails,
  onFileClick,
  onFeedClick,
  onCreatorClick
}: DiscoveryPageProps) {
  const { userState } = useUserState();
  const [activeCategory, setActiveCategory] = useState<DiscoveryCategory>('trending');
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState<string | null>(null);

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
    const creatorMap = new Map<string, { files: IndexedFile[]; latestUpload: Date }>();
    
    files.forEach(file => {
      const creatorId = file.metadata.creator?.identifier?.value || 
                       file.metadata.creator?.["@id"] || 
                       file.metadata.author?.did;
      if (!creatorId) return;

      const uploadDate = new Date(file.metadata.uploadDate);
      const existing = creatorMap.get(creatorId);
      
      if (!existing || uploadDate > existing.latestUpload) {
        creatorMap.set(creatorId, {
          files: [file],
          latestUpload: uploadDate
        });
      } else {
        existing.files.push(file);
      }
    });

    // Sort by latest upload date (newest first)
    return Array.from(creatorMap.entries())
      .sort((a, b) => b[1].latestUpload.getTime() - a[1].latestUpload.getTime())
      .slice(0, 20)
      .map(([creatorId, data]) => ({
        creatorId,
        file: data.files[0], // Use first file as thumbnail
        fileCount: data.files.length
      }));
  }, [files]);

  // Get featured feeds (subscribed feeds with most content)
  const featuredFeeds = useMemo(() => {
    return [...feeds]
      .filter(feed => feed.postCount && feed.postCount > 0)
      .sort((a, b) => (b.postCount || 0) - (a.postCount || 0))
      .slice(0, 20);
  }, [feeds]);

  // Get classics (oldest files with high engagement)
  const classics = useMemo(() => {
    return [...files]
      .filter(file => {
        const uploadDate = new Date(file.metadata.uploadDate);
        const daysOld = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysOld > 30; // At least 30 days old
      })
      .sort((a, b) => {
        const aEngagement = (a.metadata.engagement?.likes || 0) + 
                           (a.metadata.engagement?.comments || 0);
        const bEngagement = (b.metadata.engagement?.likes || 0) + 
                           (b.metadata.engagement?.comments || 0);
        return bEngagement - aEngagement;
      })
      .slice(0, 20);
  }, [files]);

  // Get files by niche category
  const nicheFiles = useMemo(() => {
    if (!selectedNiche) return [];
    
    return files.filter(file => 
      file.metadata.feedCategories?.includes(selectedNiche as any) ||
      file.metadata.feedIds?.some(feedId => {
        const feed = feeds.find(f => f.feedId === feedId);
        return feed?.feedCategory === selectedNiche;
      })
    );
  }, [files, feeds, selectedNiche]);

  // Helper to get thumbnail URL for a file
  const getThumbnail = (file: IndexedFile): string => {
    if (thumbnails && thumbnails.has(file.metadata.fileId)) {
      return thumbnails.get(file.metadata.fileId)!;
    }
    return file.thumbnail || '/placeholder-thumbnail.png';
  };

  const getDisplayItems = () => {
    switch (activeCategory) {
      case 'trending':
        return trendingFiles.map(file => ({
          type: 'file' as const,
          id: file.metadata.fileId,
          item: file,
          thumbnail: getThumbnail(file),
          title: file.metadata.name || file.metadata.title || 'Untitled',
          subtitle: file.metadata.creator?.identifier?.value || 'Unknown',
          metadata: `${(file.metadata.engagement?.likes || 0).toLocaleString()} likes`
        }));
      
      case 'new-creators':
        return newCreators.map(creator => ({
          type: 'creator' as const,
          id: creator.creatorId,
          item: creator.file,
          thumbnail: getThumbnail(creator.file),
          title: creator.creatorId.substring(0, 16) + '...',
          subtitle: `${creator.fileCount} posts`,
          metadata: 'New Creator'
        }));
      
      case 'featured':
        return featuredFeeds.map(feed => ({
          type: 'feed' as const,
          id: feed.feedId,
          item: feed,
          thumbnail: feed.branding?.avatar || '/placeholder-thumbnail.png',
          title: feed.feedName,
          subtitle: feed.feedDescription || '',
          metadata: `${feed.postCount || 0} posts`
        }));
      
      case 'classics':
        return classics.map(file => ({
          type: 'file' as const,
          id: file.metadata.fileId,
          item: file,
          thumbnail: getThumbnail(file),
          title: file.metadata.name || file.metadata.title || 'Untitled',
          subtitle: file.metadata.creator?.identifier?.value || 'Unknown',
          metadata: new Date(file.metadata.uploadDate).toLocaleDateString()
        }));
      
      case 'niches':
        return nicheFiles.map(file => ({
          type: 'file' as const,
          id: file.metadata.fileId,
          item: file,
          thumbnail: getThumbnail(file),
          title: file.metadata.name || file.metadata.title || 'Untitled',
          subtitle: file.metadata.creator?.identifier?.value || 'Unknown',
          metadata: ''
        }));
      
      default:
        return [];
    }
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

  return (
    <div className="h-full overflow-y-auto bg-neutral-900">
      {/* Category Tabs */}
      <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700 px-4 py-3">
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => {
              setActiveCategory('trending');
              setSelectedNiche(null);
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
              activeCategory === 'trending'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Trending</span>
          </button>
          
          <button
            onClick={() => {
              setActiveCategory('new-creators');
              setSelectedNiche(null);
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
              activeCategory === 'new-creators'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>New Creators</span>
          </button>
          
          <button
            onClick={() => {
              setActiveCategory('featured');
              setSelectedNiche(null);
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
              activeCategory === 'featured'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Star className="h-4 w-4" />
            <span>Featured</span>
          </button>
          
          <button
            onClick={() => {
              setActiveCategory('classics');
              setSelectedNiche(null);
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
              activeCategory === 'classics'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Classics</span>
          </button>
          
          <button
            onClick={() => {
              setActiveCategory('niches');
              setSelectedNiche(null);
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
              activeCategory === 'niches'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Niches</span>
          </button>
        </div>

        {/* Niche Subcategories */}
        {activeCategory === 'niches' && (
          <div className="mt-3 flex items-center space-x-2 overflow-x-auto scrollbar-hide">
            {Object.values(FEED_CATEGORIES)
              .filter(cat => cat.id !== 'adults-only' || userState.preferences.ageVerified)
              .map(category => (
                <button
                  key={category.id}
                  onClick={() => setSelectedNiche(selectedNiche === category.id ? null : category.id)}
                  className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                    selectedNiche === category.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                  }`}
                >
                  {category.name}
                </button>
              ))}
          </div>
        )}
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

              {/* Subtitle */}
              <p className="text-neutral-400 text-xs line-clamp-1">
                {item.subtitle}
              </p>

              {/* Metadata */}
              {item.metadata && (
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

