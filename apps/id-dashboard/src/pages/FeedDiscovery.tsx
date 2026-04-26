/**
 * Feed Discovery Page
 * Browse and discover feeds (platform does not sell paid subscriptions to feeds).
 */

import React, { useState, useEffect } from 'react';
import { Search, Grid, List as ListIcon, Users, Star } from 'lucide-react';
import { FeedService, Feed } from '../services/feeds/FeedService';
import type { FeedCategory } from '../types/aggregator';
import { FEED_CATEGORIES } from '../constants/feedCategories';

export const FeedDiscovery: React.FC = () => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FeedCategory | ''>('');

  useEffect(() => {
    loadFeeds();
  }, [selectedCategory, searchQuery]);

  const loadFeeds = async () => {
    setLoading(true);
    try {
      const result = await FeedService.listFeeds({
        search: searchQuery || undefined,
        category: selectedCategory || undefined,
        limit: 50,
      });
      setFeeds(result.feeds);
    } catch (error) {
      console.error('Failed to load feeds:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Discover Feeds</h1>
          <p className="text-neutral-400 mb-2">
            Explore feeds from creators. Subscriber billing and paid access are handled by creators
            with their own tools—not through par Noir.
          </p>
          <p className="text-sm text-neutral-500">
            See docs/business/FEEDS_AND_THIRD_PARTY_MONETIZATION.md in the repo for the policy.
          </p>
        </div>

        <div className="mb-6 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search feeds..."
                className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Grid className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <ListIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                selectedCategory === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-neutral-300'
              }`}
            >
              All
            </button>
            {FEED_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value as FeedCategory)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  selectedCategory === cat.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p className="text-neutral-400">Loading feeds...</p>
          </div>
        ) : feeds.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400">No feeds found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {feeds.map((feed) => (
              <div
                key={feed.feedId}
                className="bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden hover:border-blue-500 transition-colors"
              >
                {feed.branding?.bannerImage && (
                  <div className="h-32 bg-neutral-800">
                    <img
                      src={feed.branding.bannerImage}
                      alt={feed.feedName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start space-x-3 mb-3">
                    {feed.branding?.avatar && (
                      <img
                        src={feed.branding.avatar}
                        alt={feed.feedName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-1">{feed.feedName}</h3>
                      {feed.feedCategory && (
                        <span className="text-xs text-blue-400">
                          {FEED_CATEGORIES.find((c) => c.value === feed.feedCategory)?.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {feed.feedDescription && (
                    <p className="text-sm text-neutral-400 mb-4 line-clamp-2">{feed.feedDescription}</p>
                  )}

                  <div className="flex items-center space-x-4 mb-4 text-sm text-neutral-400">
                    {feed.subscriberCount !== undefined && (
                      <div className="flex items-center space-x-1">
                        <Users className="h-4 w-4" />
                        <span>{feed.subscriberCount}</span>
                      </div>
                    )}
                    {feed.postCount !== undefined && (
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4" />
                        <span>{feed.postCount}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `/feed/${feed.feedId}`;
                    }}
                    className="w-full px-4 py-2 bg-neutral-800 text-neutral-200 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
                  >
                    View feed
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {feeds.map((feed) => (
              <div
                key={feed.feedId}
                className="bg-neutral-900 border border-neutral-700 rounded-lg p-4 hover:border-blue-500 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  {feed.branding?.avatar && (
                    <img
                      src={feed.branding.avatar}
                      alt={feed.feedName}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">{feed.feedName}</h3>
                    {feed.feedDescription && (
                      <p className="text-sm text-neutral-400 mb-2">{feed.feedDescription}</p>
                    )}
                    <div className="flex items-center space-x-4 text-sm text-neutral-400">
                      {feed.feedCategory && (
                        <span>{FEED_CATEGORIES.find((c) => c.value === feed.feedCategory)?.label}</span>
                      )}
                      {feed.subscriberCount !== undefined && (
                        <span>{feed.subscriberCount} subscribers</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `/feed/${feed.feedId}`;
                    }}
                    className="px-4 py-2 bg-neutral-800 text-neutral-200 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
