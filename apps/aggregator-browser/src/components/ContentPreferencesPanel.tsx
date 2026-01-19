/**
 * Content Preferences Panel Component
 * Simple preferences UI for blocking content categories (negative filter)
 */

import React, { useState } from 'react';
import { X, Settings, Plus } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES, FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { FeedCategory } from '../types/aggregator';
import { PNOAuthService } from '../services/pnOAuthService';

import { API_ENDPOINT } from '../config/api';

interface ContentPreferencesPanelProps {
  onClose: () => void;
}

export function ContentPreferencesPanel({ onClose }: ContentPreferencesPanelProps) {
  const { 
    userState, 
    blockCategory, 
    unblockCategory, 
    isBlockedCategory,
    toggleShowNSFW
  } = useUserState();

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

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

      const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({
          blockedCategories: userState.preferences.blockedCategories || [],
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

  // Handle category block
  const handleBlockCategory = async (categoryId: FeedCategory) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      alert('Please unlock your pN to manage content preferences');
      return;
    }

    if (!isBlockedCategory(categoryId)) {
      blockCategory(categoryId);
      await savePreferences();
    }
    setShowCategoryPicker(false);
  };

  // Handle category unblock
  const handleUnblockCategory = async (categoryId: FeedCategory) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    unblockCategory(categoryId);
    await savePreferences();
  };

  // Get blocked categories
  const blockedCategories = FEED_CATEGORY_LIST.filter(cat => 
    isBlockedCategory(cat.id)
  );

  // Get available categories (not yet blocked)
  const availableCategories = FEED_CATEGORY_LIST.filter(cat => 
    !isBlockedCategory(cat.id)
  );

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

          {/* Blocked Categories Section */}
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <h3 className="text-lg font-semibold text-white">Block Categories</h3>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-4">
              <p className="text-text-secondary text-sm mb-4">
                Block categories you don't want to see. Your curated feed will show all content except blocked categories.
              </p>
              {!userState.isUnlocked ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm">
                    Please unlock your pN to manage content preferences.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Blocked Categories as Tiles */}
                  <div className="flex flex-wrap gap-2">
                    {blockedCategories.map(category => (
                      <div
                        key={category.id}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500 rounded-lg text-white"
                      >
                        <span className="text-sm font-medium">{category.name}</span>
                        <button
                          onClick={() => handleUnblockCategory(category.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          aria-label={`Unblock ${category.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    
                    {/* Block Category Button */}
                    {availableCategories.length > 0 && (
                      <button
                        onClick={() => setShowCategoryPicker(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 rounded-lg text-white transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="text-sm font-medium">Block Category</span>
                      </button>
                    )}
                  </div>

                  {blockedCategories.length === 0 && (
                    <p className="text-text-secondary text-sm">
                      No categories blocked. Your curated feed shows all content.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4">
          <div className="bg-neutral-900 rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col border border-neutral-700">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-neutral-700">
              <h3 className="text-xl font-bold text-white">Block Category</h3>
              <button
                onClick={() => setShowCategoryPicker(false)}
                className="text-text-secondary hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Category Options */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-2">
                {availableCategories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => handleBlockCategory(category.id)}
                    className="p-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-red-500 text-left transition-all"
                  >
                    <div className="font-medium text-white mb-1">{category.name}</div>
                    <div className="text-xs text-text-secondary">{category.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
