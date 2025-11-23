/**
 * Content Preferences Component
 * Allows users to select niche feeds and content rating preferences
 * Used in upload section settings
 */

import React, { useState, useMemo, useRef } from 'react';
import { X, Settings, Globe } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES, FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { Feed } from '../types/aggregator';
import { PNOAuthService } from '../services/pnOAuthService';

interface ContentPreferencesProps {
  onClose: () => void;
  feeds: Feed[];
}

export function ContentPreferences({ onClose, feeds }: ContentPreferencesProps) {
  const { userState, subscribeToCategory, unsubscribeFromCategory, isSubscribedToCategory } = useUserState();
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

  // Check if user is subscribed to a category
  const isCategorySubscribed = (categoryId: string): boolean => {
    return isSubscribedToCategory(categoryId);
  };

  // Toggle subscription to a niche category - saves to Google Drive like connections
  const handleCategoryToggle = async (categoryId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      alert('Please unlock your pN to manage feed subscriptions');
      return;
    }

    setIsLoading(true);
    try {
      const isSubscribed = isCategorySubscribed(categoryId);
      const session = PNOAuthService.loadSession();
      
      if (!session?.accessToken) {
        alert('Please authenticate to save preferences');
        return;
      }

      // Update local state first
      if (isSubscribed) {
        unsubscribeFromCategory(categoryId);
      } else {
        subscribeToCategory(categoryId);
      }

      // Save to Google Drive via API (like connections)
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const currentCategories = userState.preferences.subscribedCategories || [];
      const updatedCategories = isSubscribed
        ? currentCategories.filter(id => id !== categoryId)
        : [...currentCategories, categoryId];

      const response = await fetch(`${apiEndpoint}/api/users/${userState.pnIdentifier}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({
          subscribedCategories: updatedCategories
        })
      });

      if (response.ok) {
        console.log('Successfully saved preferences to Google Drive');
      } else if (response.status === 404) {
        // Endpoint not deployed yet - just log, keep local state
        console.warn('Preferences endpoint not available yet, keeping local state only');
      } else {
        // Other error - log but don't revert (like connections)
        console.warn('Failed to save preferences to Google Drive:', response.status);
      }
    } catch (error: any) {
      // Log error but don't revert - keep local state (like connections)
      console.warn('Could not save preferences to Google Drive:', error);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4 pb-20">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[calc(100vh-8rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700 flex-shrink-0">
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-6">
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
                    cat.id !== 'adults-only' || userState.preferences.isOver18
                  ).map(category => {
                    const isSubscribed = isCategorySubscribed(category.id);

                    return (
                      <button
                        key={category.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isLoading && userState.isUnlocked) {
                            handleCategoryToggle(category.id);
                          } else if (!userState.isUnlocked) {
                            alert('Please unlock your pN to manage feed subscriptions');
                          }
                        }}
                        disabled={isLoading || !userState.isUnlocked}
                        className={`p-3 rounded-lg transition-all text-left ${
                          isSubscribed
                            ? 'bg-blue-500/20 border-2 border-blue-500 text-white'
                            : 'bg-neutral-800/50 border-2 border-transparent hover:bg-neutral-800 text-white'
                        } ${!userState.isUnlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="font-medium text-sm mb-1">{category.name}</div>
                        <div className="text-xs text-text-secondary">
                          {isSubscribed ? 'Subscribed' : 'Click to subscribe'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

