/**
 * Content Preferences Component
 * Allows users to select niche feeds and content rating preferences
 * Used in upload section settings
 */

import React, { useState, useMemo } from 'react';
import { X, Settings, Globe, Shield } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { RatingPreferences } from './RatingPreferences';
import { FEED_CATEGORIES, FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { Feed } from '../types/aggregator';
import { FeedService } from '../services/feedService';

interface ContentPreferencesProps {
  onClose: () => void;
  feeds: Feed[];
}

export function ContentPreferences({ onClose, feeds }: ContentPreferencesProps) {
  const { userState, subscribeToFeed, unsubscribeFromFeed, isSubscribedToFeed } = useUserState();
  const [isLoading, setIsLoading] = useState(false);

  // Group feeds by category
  const feedsByCategory = useMemo(() => {
    const grouped: Record<string, Feed[]> = {};
    feeds.forEach(feed => {
      const category = feed.feedCategory || 'uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(feed);
    });
    return grouped;
  }, [feeds]);

  // Get feeds for a specific category
  const getFeedsForCategory = (categoryId: string): Feed[] => {
    return feedsByCategory[categoryId] || [];
  };

  // Check if user is subscribed to any feed in a category
  const isCategorySubscribed = (categoryId: string): boolean => {
    const categoryFeeds = getFeedsForCategory(categoryId);
    return categoryFeeds.some(feed => isSubscribedToFeed(feed.feedId));
  };

  // Toggle subscription to all feeds in a category
  const handleCategoryToggle = async (categoryId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      alert('Please unlock your pN to manage feed subscriptions');
      return;
    }

    setIsLoading(true);
    try {
      const categoryFeeds = getFeedsForCategory(categoryId);
      const isSubscribed = isCategorySubscribed(categoryId);

      if (isSubscribed) {
        // Unsubscribe from all feeds in this category
        for (const feed of categoryFeeds) {
          if (isSubscribedToFeed(feed.feedId)) {
            try {
              await FeedService.unsubscribeFromFeed(
                feed.feedId, 
                userState.pnIdentifier!,
                feed.creatorId
              );
              unsubscribeFromFeed(feed.feedId);
            } catch (error) {
              console.error(`Failed to unsubscribe from feed ${feed.feedId}:`, error);
            }
          }
        }
      } else {
        // Subscribe to all feeds in this category
        for (const feed of categoryFeeds) {
          if (!isSubscribedToFeed(feed.feedId)) {
            try {
              await FeedService.subscribeToFeed(
                feed.feedId, 
                userState.pnIdentifier!,
                feed.creatorId
              );
              subscribeToFeed(feed.feedId);
            } catch (error) {
              console.error(`Failed to subscribe to feed ${feed.feedId}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to toggle category subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <div className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Content Preferences</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Niche Feeds Section */}
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Globe className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Niche Feeds</h3>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-4">
              <p className="text-text-secondary text-sm mb-4">
                Select niche feeds to include in your curated feed. Your curated feed will show content from all selected categories.
              </p>
              {!userState.isUnlocked ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm">
                    Please unlock your pN to manage feed subscriptions.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {FEED_CATEGORY_LIST.filter(cat => 
                    cat.id !== 'adults-only' || userState.preferences.ageVerified
                  ).map(category => {
                    const categoryFeeds = getFeedsForCategory(category.id);
                    const isSubscribed = isCategorySubscribed(category.id);
                    const hasFeeds = categoryFeeds.length > 0;

                    return (
                      <label
                        key={category.id}
                        className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          isSubscribed
                            ? 'bg-blue-500/20 border-2 border-blue-500'
                            : 'bg-neutral-800/50 border-2 border-transparent hover:bg-neutral-800'
                        } ${!hasFeeds ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSubscribed}
                          onChange={() => handleCategoryToggle(category.id)}
                          disabled={!hasFeeds || isLoading}
                          className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium">{category.name}</span>
                            {hasFeeds && (
                              <span className="text-xs text-text-secondary">
                                {categoryFeeds.length} feed{categoryFeeds.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mt-1">
                            {category.description}
                          </p>
                          {!hasFeeds && (
                            <p className="text-xs text-yellow-400 mt-1">
                              No feeds available in this category yet
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Content Rating Preferences */}
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Content Rating</h3>
            </div>
            <RatingPreferences />
          </section>
        </div>
      </div>
    </div>
  );
}

