/**
 * Content Preferences Component
 * Allows users to select niche feeds and content rating preferences
 * Used in upload section settings
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Settings, Globe, Shield, ChevronDown } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES, FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { Feed, ContentRating } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { CONTENT_RATINGS, RATING_ORDER } from '../constants/contentRatings';

interface ContentPreferencesProps {
  onClose: () => void;
  feeds: Feed[];
}

export function ContentPreferences({ onClose, feeds }: ContentPreferencesProps) {
  const { userState, subscribeToFeed, unsubscribeFromFeed, isSubscribedToFeed, updateMaxRating, setAgeVerified } = useUserState();
  const [isLoading, setIsLoading] = useState(false);
  const [showRatingDropdown, setShowRatingDropdown] = useState(false);
  const ratingDropdownRef = useRef<HTMLDivElement>(null);

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
    console.log('Category toggle clicked:', categoryId);
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      alert('Please unlock your pN to manage feed subscriptions');
      return;
    }

    setIsLoading(true);
    try {
      const categoryFeeds = getFeedsForCategory(categoryId);
      console.log('Category feeds found:', categoryFeeds.length, categoryFeeds);
      const isSubscribed = isCategorySubscribed(categoryId);
      console.log('Is subscribed:', isSubscribed);

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
        let successCount = 0;
        let errorCount = 0;
        
        for (const feed of categoryFeeds) {
          if (!isSubscribedToFeed(feed.feedId)) {
            try {
              await FeedService.subscribeToFeed(
                feed.feedId, 
                userState.pnIdentifier!,
                feed.creatorId
              );
              // Update UI state even if decentralized attempt failed but API succeeded
              subscribeToFeed(feed.feedId);
              successCount++;
            } catch (error: any) {
              console.error(`Failed to subscribe to feed ${feed.feedId}:`, error);
              // Only count as error if it's not an IPFS error (API fallback should work)
              if (!error?.message?.includes('IPFS') && !error?.message?.includes('decentralized')) {
                errorCount++;
              } else {
                // IPFS failed but API might have succeeded - try to update UI anyway
                // The FeedService should have already tried the API fallback
                subscribeToFeed(feed.feedId);
                successCount++;
              }
            }
          }
        }
        
        if (successCount > 0) {
          console.log(`Successfully subscribed to ${successCount} feed(s) in category ${categoryId}`);
        }
        if (errorCount > 0) {
          console.warn(`Failed to subscribe to ${errorCount} feed(s) in category ${categoryId}`);
        }
      }
    } catch (error) {
      console.error('Failed to toggle category subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Close rating dropdown when clicking outside
  useEffect(() => {
    if (!showRatingDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ratingDropdownRef.current && !ratingDropdownRef.current.contains(event.target as Node)) {
        setShowRatingDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRatingDropdown]);

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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                  {FEED_CATEGORY_LIST.filter(cat => 
                    cat.id !== 'adults-only' || userState.preferences.ageVerified
                  ).map(category => {
                    const categoryFeeds = getFeedsForCategory(category.id);
                    const isSubscribed = isCategorySubscribed(category.id);
                    const hasFeeds = categoryFeeds.length > 0;

                    return (
                      <button
                        key={category.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (hasFeeds && !isLoading && userState.isUnlocked) {
                            handleCategoryToggle(category.id);
                          } else if (!hasFeeds) {
                            console.log('No feeds available for category:', category.id);
                          } else if (!userState.isUnlocked) {
                            alert('Please unlock your pN to manage feed subscriptions');
                          }
                        }}
                        disabled={!hasFeeds || isLoading || !userState.isUnlocked}
                        className={`p-3 rounded-lg transition-all text-left ${
                          isSubscribed
                            ? 'bg-blue-500/20 border-2 border-blue-500 text-white'
                            : 'bg-neutral-800/50 border-2 border-transparent hover:bg-neutral-800 text-white'
                        } ${!hasFeeds || !userState.isUnlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="font-medium text-sm mb-1">{category.name}</div>
                        {hasFeeds && (
                          <div className="text-xs text-text-secondary">
                            {categoryFeeds.length} feed{categoryFeeds.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        {!hasFeeds && (
                          <div className="text-xs text-yellow-400">
                            No feeds yet
                          </div>
                        )}
                      </button>
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
            <div className="bg-neutral-800/50 rounded-lg p-4">
              <div className="relative" ref={ratingDropdownRef}>
                <button
                  onClick={() => setShowRatingDropdown(!showRatingDropdown)}
                  className="w-full flex items-center justify-between p-3 bg-neutral-900 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-medium">
                      {userState.preferences.maxRating}
                    </span>
                    {CONTENT_RATINGS[userState.preferences.maxRating].requiresVerification && (
                      <span className="text-xs text-yellow-400">(Age Verified)</span>
                    )}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${showRatingDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showRatingDropdown && (
                  <div className="absolute z-10 w-full mt-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                    {RATING_ORDER.map((rating) => {
                      const ratingInfo = CONTENT_RATINGS[rating];
                      const isSelected = userState.preferences.maxRating === rating;
                      const isDisabled = ratingInfo.requiresVerification && !userState.preferences.ageVerified;
                      
                      const handleRatingSelect = () => {
                        if (isDisabled) {
                          const age = prompt(`This rating requires age verification. Please enter your age:`);
                          if (age) {
                            const ageNum = parseInt(age, 10);
                            if (ageNum >= ratingInfo.ageRestriction) {
                              setAgeVerified(ageNum);
                              updateMaxRating(rating);
                            } else {
                              alert(`You must be at least ${ratingInfo.ageRestriction} to view ${rating} content.`);
                            }
                          }
                        } else {
                          updateMaxRating(rating);
                        }
                        setShowRatingDropdown(false);
                      };
                      
                      return (
                        <button
                          key={rating}
                          onClick={handleRatingSelect}
                          disabled={isDisabled}
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            isSelected
                              ? 'bg-blue-500/20 text-white font-medium'
                              : 'text-text-secondary hover:bg-neutral-800 hover:text-white'
                          } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{rating}</span>
                            {isSelected && <span className="text-blue-400 text-xs">✓</span>}
                          </div>
                          <p className="text-xs text-text-secondary mt-1">
                            {ratingInfo.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {!userState.preferences.ageVerified && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-xs text-yellow-400">
                    Some ratings require age verification. You'll be prompted when selecting them.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

