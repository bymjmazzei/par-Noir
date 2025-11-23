/**
 * Content Preferences Panel Component
 * Comprehensive preferences UI for categories and subject niches
 * Replaces old ContentPreferences component
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Settings, Globe, Search, TrendingUp, Filter } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES, FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { FeedCategory } from '../types/aggregator';
import { PNOAuthService } from '../services/pnOAuthService';

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

interface ContentPreferencesPanelProps {
  onClose: () => void;
}

export function ContentPreferencesPanel({ onClose }: ContentPreferencesPanelProps) {
  const { 
    userState, 
    subscribeToCategory, 
    unsubscribeFromCategory, 
    isSubscribedToCategory,
    subscribeToSubject,
    unsubscribeFromSubject,
    isSubscribedToSubject,
    blockSubject,
    unblockSubject,
    isBlockedSubject,
    toggleShowNSFW
  } = useUserState();

  // Subject search and browsing
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FeedCategory | ''>('');
  const [popularSubjects, setPopularSubjects] = useState<string[]>([]);
  const [categorySubjects, setCategorySubjects] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  // Load popular subjects on mount
  useEffect(() => {
    const loadPopularSubjects = async () => {
      try {
        const response = await fetch(`${apiEndpoint}/api/aggregator/subjects/popular?limit=30`);
        if (response.ok) {
          const data = await response.json();
          setPopularSubjects(data.subjects || []);
        }
      } catch (error) {
        console.warn('Failed to load popular subjects:', error);
      }
    };
    loadPopularSubjects();
  }, []);

  // Load subjects by category when category is selected
  useEffect(() => {
    if (!selectedCategory) {
      setCategorySubjects([]);
      return;
    }

    const loadCategorySubjects = async () => {
      setIsLoadingSubjects(true);
      try {
        const response = await fetch(`${apiEndpoint}/api/aggregator/subjects/by-category?category=${selectedCategory}`);
        if (response.ok) {
          const data = await response.json();
          setCategorySubjects(data.subjects || []);
        }
      } catch (error) {
        console.warn('Failed to load category subjects:', error);
      } finally {
        setIsLoadingSubjects(false);
      }
    };
    loadCategorySubjects();
  }, [selectedCategory]);

  // Search subjects when query changes
  useEffect(() => {
    if (!subjectSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const searchSubjects = async () => {
      try {
        const response = await fetch(`${apiEndpoint}/api/aggregator/subjects/search?q=${encodeURIComponent(subjectSearchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.subjects || []);
        }
      } catch (error) {
        console.warn('Failed to search subjects:', error);
      }
    };

    const timeoutId = setTimeout(searchSubjects, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [subjectSearchQuery]);

  // Save preferences to Google Drive
  const savePreferences = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    try {
      const session = PNOAuthService.loadSession();
      if (!session?.accessToken) {
        return;
      }

      const response = await fetch(`${apiEndpoint}/api/users/${userState.pnIdentifier}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({
          subscribedCategories: userState.preferences.subscribedCategories || [],
          subscribedSubjects: userState.preferences.subscribedSubjects || [],
          blockedSubjects: userState.preferences.blockedSubjects || [],
          showNSFW: userState.preferences.showNSFW || false
        })
      });

      if (response.ok) {
        console.log('Successfully saved preferences to Google Drive');
      } else if (response.status === 404) {
        console.warn('Preferences endpoint not available yet, keeping local state only');
      } else {
        console.warn('Failed to save preferences to Google Drive:', response.status);
      }
    } catch (error: any) {
      console.warn('Could not save preferences to Google Drive:', error);
    }
  };

  // Handle category toggle
  const handleCategoryToggle = async (categoryId: FeedCategory) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      alert('Please unlock your pN to manage feed subscriptions');
      return;
    }

    const isSubscribed = isSubscribedToCategory(categoryId);
    if (isSubscribed) {
      unsubscribeFromCategory(categoryId);
    } else {
      subscribeToCategory(categoryId);
    }
    await savePreferences();
  };

  // Handle subject subscribe
  const handleSubscribeSubject = async (subject: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      alert('Please unlock your pN to manage subject preferences');
      return;
    }
    subscribeToSubject(subject);
    await savePreferences();
  };

  // Handle subject block
  const handleBlockSubject = async (subject: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      alert('Please unlock your pN to manage subject preferences');
      return;
    }
    blockSubject(subject);
    await savePreferences();
  };

  // Handle subject unsubscribe/unblock
  const handleRemoveSubject = async (subject: string, isBlocked: boolean) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }
    if (isBlocked) {
      unblockSubject(subject);
    } else {
      unsubscribeFromSubject(subject);
    }
    await savePreferences();
  };

  // Get available subjects to display (from search, category, or popular)
  const displaySubjects = useMemo(() => {
    if (subjectSearchQuery.trim() && searchResults.length > 0) {
      return searchResults;
    }
    if (selectedCategory && categorySubjects.length > 0) {
      return categorySubjects;
    }
    return popularSubjects;
  }, [subjectSearchQuery, searchResults, selectedCategory, categorySubjects, popularSubjects]);

  const subscribedSubjects = userState.preferences.subscribedSubjects || [];
  const blockedSubjects = userState.preferences.blockedSubjects || [];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[150] p-4">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
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
          {/* NSFW Content Toggle */}
          <section>
            <div className="bg-neutral-800/50 rounded-lg p-4 space-y-4">
              {userState.preferences.hasAgeZKP && userState.preferences.isOver18 ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium mb-1">Show NSFW Content</p>
                      <p className="text-text-secondary text-xs">
                        Enable to view NSFW (18+) content in your feed
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={userState.preferences.showNSFW || false}
                      onClick={async () => {
                        if (toggleShowNSFW) {
                          await toggleShowNSFW(!(userState.preferences.showNSFW || false));
                          await savePreferences();
                        }
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${userState.preferences.showNSFW 
                          ? 'bg-blue-600' 
                          : 'bg-neutral-700'
                        }
                      `}
                    >
                      <span
                        className={`
                          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                          ${userState.preferences.showNSFW ? 'translate-x-6' : 'translate-x-1'}
                        `}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-white text-sm font-medium mb-2">NSFW Content</p>
                  <p className="text-text-secondary text-xs mb-3">
                    Age verification required to access NSFW content.
                  </p>
                  <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
                    <p className="text-yellow-200 text-xs">
                      Please set up your age ZKP in your dashboard and share it with the browser app to enable NSFW content.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Categories Section */}
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Globe className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Content Categories</h3>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-4">
              <p className="text-text-secondary text-sm mb-4">
                Select content categories to include in your curated feed.
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
                    const isSubscribed = isSubscribedToCategory(category.id);

                    return (
                      <button
                        key={category.id}
                        onClick={() => handleCategoryToggle(category.id)}
                        className={`p-3 rounded-lg transition-all text-left ${
                          isSubscribed
                            ? 'bg-blue-500/20 border-2 border-blue-500 text-white'
                            : 'bg-neutral-800/50 border-2 border-transparent hover:bg-neutral-800 text-white'
                        }`}
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

          {/* Subjects Section */}
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Filter className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Subject Niches</h3>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-4 space-y-4">
              <p className="text-text-secondary text-sm">
                Subscribe to specific subjects to see only content about those topics. Block subjects to exclude them from your feed.
              </p>

              {!userState.isUnlocked ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm">
                    Please unlock your pN to manage subject preferences.
                  </p>
                </div>
              ) : (
                <>
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Search subjects..."
                      value={subjectSearchQuery}
                      onChange={(e) => setSubjectSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-text-secondary focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Browse by Category */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Browse by Category
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value as FeedCategory | '')}
                      className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">All Categories</option>
                      {FEED_CATEGORY_LIST.filter(cat => cat.id !== 'adults-only' || userState.preferences.isOver18).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Display Subjects */}
                  {isLoadingSubjects ? (
                    <div className="text-text-secondary text-sm">Loading subjects...</div>
                  ) : displaySubjects.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {displaySubjects.map(subject => {
                        const isSubscribed = isSubscribedToSubject(subject);
                        const isBlocked = isBlockedSubject(subject);
                        
                        return (
                          <button
                            key={subject}
                            onClick={() => {
                              if (isBlocked) {
                                handleRemoveSubject(subject, true);
                              } else if (isSubscribed) {
                                handleRemoveSubject(subject, false);
                              } else {
                                handleSubscribeSubject(subject);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (!isBlocked && !isSubscribed) {
                                handleBlockSubject(subject);
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-sm transition-all ${
                              isBlocked
                                ? 'bg-red-500/20 border border-red-500 text-red-400'
                                : isSubscribed
                                ? 'bg-blue-500/20 border border-blue-500 text-blue-400'
                                : 'bg-neutral-700 border border-neutral-600 text-white hover:bg-neutral-600'
                            }`}
                            title={isBlocked ? 'Blocked - Right click to unblock' : isSubscribed ? 'Subscribed - Click to unsubscribe' : 'Click to subscribe, Right click to block'}
                          >
                            {subject}
                            {(isSubscribed || isBlocked) && (
                              <span className="ml-1">×</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-text-secondary text-sm">
                      {subjectSearchQuery.trim() ? 'No subjects found' : 'No subjects available'}
                    </div>
                  )}

                  {/* Subscribed Subjects */}
                  {subscribedSubjects.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-white mb-2">Subscribed Subjects</h4>
                      <div className="flex flex-wrap gap-2">
                        {subscribedSubjects.map(subject => (
                          <button
                            key={subject}
                            onClick={() => handleRemoveSubject(subject, false)}
                            className="px-3 py-1 rounded-full text-sm bg-blue-500/20 border border-blue-500 text-blue-400 hover:bg-blue-500/30"
                          >
                            {subject} ×
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Blocked Subjects */}
                  {blockedSubjects.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-white mb-2">Blocked Subjects</h4>
                      <div className="flex flex-wrap gap-2">
                        {blockedSubjects.map(subject => (
                          <button
                            key={subject}
                            onClick={() => handleRemoveSubject(subject, true)}
                            className="px-3 py-1 rounded-full text-sm bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500/30"
                          >
                            {subject} ×
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

