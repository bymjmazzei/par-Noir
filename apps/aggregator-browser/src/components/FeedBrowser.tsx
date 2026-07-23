/**
 * Feed Browser Component (Catalogue/Store Interface)
 * Browse feeds organized by categories, trending, new feeds, etc.
 * Like a store with different sections
 */

import { useState, useEffect } from 'react';
import { Search, Plus, Check, Globe, TrendingUp, Clock, Star, Grid } from 'lucide-react';
import { Feed, FeedCategory } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES } from '../constants/feedCategories';
import { FeedService } from '../services/feedService';
import { useToast } from '../hooks/useToast';
import { LoadingSkeleton } from './LoadingSkeleton';

interface FeedBrowserProps {
  feeds: Feed[];
  onClose: () => void;
  onFeedClick?: (feed: Feed) => void;
  onCreateFeed?: () => void;
}

type ViewMode = 'trending' | 'new' | 'categories' | 'recommended';

export function FeedBrowser({ feeds, onClose, onFeedClick, onCreateFeed }: FeedBrowserProps) {
  const { userState, subscribeToFeed, unsubscribeFromFeed, isSubscribedToFeed } = useUserState();
  const { success, error: showError } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FeedCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('trending');
  const [availableFeeds, setAvailableFeeds] = useState<Feed[]>([]);
  const [trendingFeeds, setTrendingFeeds] = useState<Feed[]>([]);
  const [newFeeds, setNewFeeds] = useState<Feed[]>([]);
  const [recommendedFeeds, setRecommendedFeeds] = useState<Feed[]>([]);
  const [categories, setCategories] = useState<Array<{ category: FeedCategory; count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFeeds, setCategoryFeeds] = useState<Map<FeedCategory, Feed[]>>(new Map());

  // Load discovery data
  useEffect(() => {
    const loadDiscoveryData = async () => {
      setIsLoading(true);
      try {
        // Load categories
        const cats = await FeedService.getFeedCategories();
        setCategories(cats);

        // Load trending feeds
        const trending = await FeedService.getTrendingFeeds({ limit: 20 });
        setTrendingFeeds(trending);

        // Load new feeds
        const newFeedsResult = await FeedService.discoverFeeds({ 
          sort: 'new', 
          limit: 20 
        });
        setNewFeeds(newFeedsResult.feeds);

        // Load recommended feeds (if user is unlocked)
        if (userState.isUnlocked && userState.pnIdentifier) {
          try {
            const recommended = await FeedService.getRecommendedFeeds(userState.pnIdentifier, 10);
            setRecommendedFeeds(recommended);
          } catch (err) {
            console.warn('Failed to load recommended feeds:', err);
          }
        }

        // Load feeds by category
        const categoryMap = new Map<FeedCategory, Feed[]>();
        for (const cat of cats) {
          try {
            const result = await FeedService.discoverFeeds({
              category: cat.category,
              limit: 10
            });
            categoryMap.set(cat.category, result.feeds);
          } catch (err) {
            console.warn(`Failed to load feeds for category ${cat.category}:`, err);
          }
        }
        setCategoryFeeds(categoryMap);

        // Combine all feeds for search
        const allFeeds = [
          ...trending,
          ...newFeedsResult.feeds,
          ...Array.from(categoryMap.values()).flat()
        ];
        // Remove duplicates
        const uniqueFeeds = Array.from(
          new Map(allFeeds.map(feed => [feed.feedId, feed])).values()
        );
        setAvailableFeeds(uniqueFeeds);
      } catch (err: any) {
        console.error('Failed to load discovery data:', err);
        showError(err.message || 'Failed to load feeds');
        // Fallback to existing feeds
        setAvailableFeeds(feeds);
      } finally {
        setIsLoading(false);
      }
    };

    loadDiscoveryData();
  }, [userState.isUnlocked, userState.pnIdentifier]);

  // Get feeds based on view mode
  const getDisplayFeeds = (): Feed[] => {
    if (searchQuery) {
      // Search mode - filter all feeds
      return availableFeeds.filter(feed => {
        const matchesSearch = 
          feed.feedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          feed.feedDescription?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || feed.feedCategory === selectedCategory;
        return matchesSearch && matchesCategory;
      });
    }

    switch (viewMode) {
      case 'trending':
        return trendingFeeds.filter(feed => 
          selectedCategory === 'all' || feed.feedCategory === selectedCategory
        );
      case 'new':
        return newFeeds.filter(feed => 
          selectedCategory === 'all' || feed.feedCategory === selectedCategory
        );
      case 'recommended':
        return recommendedFeeds.filter(feed => 
          selectedCategory === 'all' || feed.feedCategory === selectedCategory
        );
      case 'categories':
        if (selectedCategory === 'all') {
          return availableFeeds;
        }
        return categoryFeeds.get(selectedCategory) || [];
      default:
        return availableFeeds;
    }
  };

  const displayFeeds = getDisplayFeeds();

  const handleSubscribe = async (feedId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      showError('Connect your pN to subscribe to feeds');
      return;
    }

    try {
      if (isSubscribedToFeed(feedId)) {
        await FeedService.unsubscribeFromFeed(feedId, userState.pnIdentifier);
        unsubscribeFromFeed(feedId);
        success('Unsubscribed from feed');
      } else {
        await FeedService.subscribeToFeed(feedId, userState.pnIdentifier);
        subscribeToFeed(feedId);
        success('Subscribed to feed');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to update subscription');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Feed Discovery</h2>
            <p className="text-text-secondary text-sm mt-1">Browse feeds organized by category, trending, and more</p>
          </div>
          <div className="flex items-center space-x-3">
            {onCreateFeed && userState.isUnlocked && userState.pnIdentifier && (
              <button
                onClick={onCreateFeed}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Feed
              </button>
            )}
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-white transition-colors text-2xl"
            >
              ✕
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center space-x-2 p-4 border-b border-neutral-700 overflow-x-auto">
          <button
            onClick={() => { setViewMode('trending'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              viewMode === 'trending'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            <TrendingUp className="h-4 w-4 inline mr-2" />
            Trending
          </button>
          <button
            onClick={() => { setViewMode('new'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              viewMode === 'new'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            <Clock className="h-4 w-4 inline mr-2" />
            New
          </button>
          {recommendedFeeds.length > 0 && (
            <button
              onClick={() => { setViewMode('recommended'); setSearchQuery(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                viewMode === 'recommended'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
              }`}
            >
              <Star className="h-4 w-4 inline mr-2" />
              Recommended
            </button>
          )}
          <button
            onClick={() => { setViewMode('categories'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              viewMode === 'categories'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            <Grid className="h-4 w-4 inline mr-2" />
            Categories
          </button>
        </div>

        {/* Search and Category Filter */}
        <div className="p-6 border-b border-neutral-700">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search feeds..."
                className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as FeedCategory | 'all')}
              className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories
                .map(({ category, count }) => {
                  const catInfo = FEED_CATEGORIES[category];
                  return (
                    <option key={category} value={category}>
                      {catInfo?.name || category} ({count})
                    </option>
                  );
                })}
            </select>
          </div>
        </div>

        {/* Feeds List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <LoadingSkeleton key={i} />
              ))}
            </div>
          ) : displayFeeds.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary">
                {searchQuery ? 'No feeds match your search' : `No feeds found in ${viewMode}`}
              </p>
            </div>
          ) : (
            <>
              {/* Category Sections (when viewing categories) */}
              {viewMode === 'categories' && selectedCategory === 'all' && !searchQuery && (
                <div className="space-y-8">
                  {categories
                    .map(({ category, count }) => {
                      const catFeeds = categoryFeeds.get(category) || [];
                      const catInfo = FEED_CATEGORIES[category];
                      if (catFeeds.length === 0) return null;

                      return (
                        <div key={category} className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold text-white flex items-center">
                              {catInfo?.icon && <span className="mr-2">{catInfo.icon}</span>}
                              {catInfo?.name || category}
                              <span className="ml-2 text-text-secondary text-sm font-normal">
                                ({count} feeds)
                              </span>
                            </h3>
                            <button
                              onClick={() => setSelectedCategory(category)}
                              className="text-blue-400 hover:text-blue-300 text-sm"
                            >
                              View All →
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {catFeeds.slice(0, 6).map((feed) => renderFeedCard(feed))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Regular Grid View */}
              {!(viewMode === 'categories' && selectedCategory === 'all' && !searchQuery) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayFeeds.map((feed) => renderFeedCard(feed))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  function renderFeedCard(feed: Feed) {
    const isSubscribed = isSubscribedToFeed(feed.feedId);
    const categoryInfo = FEED_CATEGORIES[feed.feedCategory];

    return (
      <div
        key={feed.feedId}
        className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 hover:bg-neutral-800 transition-colors cursor-pointer group"
        onClick={() => {
          if ((feed.creatorTier === 'feed' || feed.creatorTier === 'self-hosted') && onFeedClick) {
            onFeedClick(feed);
          }
        }}
      >
        <div className="flex flex-col h-full">
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">
                    {feed.feedName}
                  </h3>
                  {categoryInfo?.icon && (
                    <span className="text-text-secondary">{categoryInfo.icon}</span>
                  )}
                </div>
                <p className="text-text-secondary text-sm mb-2 line-clamp-2">
                  {feed.feedDescription || categoryInfo?.description}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs text-text-secondary mb-3">
              <span>{categoryInfo?.name || feed.feedCategory}</span>
              {feed.subscriberCount !== undefined && feed.subscriberCount > 0 && (
                <>
                  <span>•</span>
                  <span>{feed.subscriberCount.toLocaleString()} subscribers</span>
                </>
              )}
              {feed.postCount !== undefined && feed.postCount > 0 && (
                <>
                  <span>•</span>
                  <span>{feed.postCount} posts</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSubscribe(feed.feedId);
            }}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSubscribed
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSubscribed ? (
              <>
                <Check className="h-4 w-4 inline mr-1" />
                Subscribed
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 inline mr-1" />
                Subscribe
              </>
            )}
          </button>
        </div>
      </div>
    );
  }
}

