/**
 * Feed Browser Component
 * Browse and subscribe to available feeds
 */

import React, { useState, useEffect } from 'react';
import { Search, Plus, Check, Globe, Sparkles } from 'lucide-react';
import { Feed, FeedCategory } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES, getAllFeedCategories } from '../constants/feedCategories';
import { FeedRailItem } from './FeedRail';

interface FeedBrowserProps {
  feeds: Feed[];
  onClose: () => void;
  onFeedClick?: (feed: Feed) => void;
}

export function FeedBrowser({ feeds, onClose, onFeedClick }: FeedBrowserProps) {
  const { userState, subscribeToFeed, unsubscribeFromFeed, isSubscribedToFeed } = useUserState();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FeedCategory | 'all'>('all');
  const [availableFeeds, setAvailableFeeds] = useState<Feed[]>([]);

  useEffect(() => {
    // In production, this would fetch feeds from API
    // For now, we'll generate some example feeds from categories
    const categoryFeeds: Feed[] = getAllFeedCategories()
      .filter(cat => cat.id !== 'adults-only' || userState.preferences.ageVerified)
      .map(category => ({
        feedId: `default-${category.id}`,
        feedName: category.name,
        feedCategory: category.id,
        feedDescription: category.description,
        feedRatingRange: category.id === 'adults-only' 
          ? ['M18+', 'NSFW', 'X18+'] as any[]
          : ['GA', 'FF', 'T13+', 'YA16+'] as any[],
        creatorId: 'system',
        creatorTier: 'feed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

    setAvailableFeeds([...feeds, ...categoryFeeds]);
  }, [feeds, userState.preferences.ageVerified]);

  const filteredFeeds = availableFeeds.filter(feed => {
    const matchesSearch = !searchQuery || 
      feed.feedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feed.feedDescription?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || feed.feedCategory === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleSubscribe = (feedId: string) => {
    if (isSubscribedToFeed(feedId)) {
      unsubscribeFromFeed(feedId);
    } else {
      subscribeToFeed(feedId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <h2 className="text-2xl font-bold text-white">Browse Feeds</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b border-neutral-700">
          <div className="flex items-center space-x-4 mb-4">
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
              {getAllFeedCategories()
                .filter(cat => cat.id !== 'adults-only' || userState.preferences.ageVerified)
                .map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Feeds List */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredFeeds.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary">No feeds found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFeeds.map((feed) => {
                const isSubscribed = isSubscribedToFeed(feed.feedId);
                const categoryInfo = FEED_CATEGORIES[feed.feedCategory];

                return (
                  <div
                    key={feed.feedId}
                    className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 hover:bg-neutral-800 transition-colors cursor-pointer"
                    onClick={() => {
                      // Only navigate to branded feed if it's a paid tier feed
                      if ((feed.creatorTier === 'feed' || feed.creatorTier === 'self-hosted') && onFeedClick) {
                        onFeedClick(feed);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-white font-medium">{feed.feedName}</h3>
                          {feed.feedId.startsWith('default-') && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-text-secondary text-sm mb-2">
                          {feed.feedDescription || categoryInfo?.description}
                        </p>
                        <div className="flex items-center space-x-2 text-xs text-text-secondary">
                          <span>{categoryInfo?.name}</span>
                          {feed.subscriberCount !== undefined && (
                            <>
                              <span>•</span>
                              <span>{feed.subscriberCount} subscribers</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSubscribe(feed.feedId);
                        }}
                        className={`ml-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

