/**
 * Add to Feed Modal Component
 * Allows creators to add existing files to their feeds
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Plus, Loader2 } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';
import { Feed } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { IndexedFile } from '../types/aggregator';
import { uploadQueueService } from '../services/uploadQueueService';

interface AddToFeedModalProps {
  file: IndexedFile;
  feeds: Feed[];
  onClose: () => void;
  onAdded?: (feedId: string) => void;
}

export function AddToFeedModal({ file, feeds, onClose, onAdded }: AddToFeedModalProps) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [userFeeds, setUserFeeds] = useState<Feed[]>([]);
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(new Set());
  const [currentFeedMembership, setCurrentFeedMembership] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Load user's feeds and current feed membership
  useEffect(() => {
    const loadData = async () => {
      if (!userState.isUnlocked || !userState.pnIdentifier) {
        setLoading(false);
        return;
      }

      try {
        // Get feeds owned by the user
        const ownedFeeds = feeds.filter(
          feed => feed.creatorDid === userState.pnIdentifier
        );
        setUserFeeds(ownedFeeds);

        // Get current feed membership for this file
        const fileFeedIds = file.metadata.feedIds || [];
        setCurrentFeedMembership(new Set(fileFeedIds));
        
        // Pre-select feeds that already contain this file
        setSelectedFeeds(new Set(fileFeedIds.filter(id => 
          ownedFeeds.some(f => f.feedId === id)
        )));
      } catch (err) {
        console.error('Failed to load feed data:', err);
        showError('Failed to load feeds');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [feeds, userState.isUnlocked, userState.pnIdentifier, file.metadata.feedIds]);

  const handleToggleFeed = (feedId: string) => {
    setSelectedFeeds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(feedId)) {
        newSet.delete(feedId);
      } else {
        newSet.add(feedId);
      }
      return newSet;
    });
  };

  const handleAddToFeeds = () => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      showError('Connect your pN to add files to feeds');
      return;
    }

    if (selectedFeeds.size === 0) {
      showError('Please select at least one feed');
      return;
    }

    const fileId = file.metadata.fileId;
    const addedBy = userState.pnIdentifier;
    
    // Get feeds to add and remove
    const feedsToAdd = Array.from(selectedFeeds).filter(
      feedId => !currentFeedMembership.has(feedId)
    );
    const feedsToRemove = Array.from(currentFeedMembership).filter(
      feedId => !selectedFeeds.has(feedId) && userFeeds.some(f => f.feedId === feedId)
    );

    if (feedsToAdd.length === 0 && feedsToRemove.length === 0) {
      // No changes made
      onClose();
      return;
    }

    // Optimistically update UI - close modal immediately
    if (feedsToAdd.length > 0 && onAdded) {
      onAdded(feedsToAdd[0]); // Call with first added feed
    }
    onClose();

    // Queue background task
    uploadQueueService.addTask({
      type: 'addToFeed',
      accountId: '', // Not used for feed operations
      metadata: {
        fileId,
        feedsToAdd,
        feedsToRemove,
        addedBy
      },
      onComplete: (result) => {
        console.log('✅ [AddToFeed] Feeds updated:', result);
        const added = result?.added || 0;
        const removed = result?.removed || 0;
        if (added > 0 || removed > 0) {
          success(
            added > 0 && removed > 0
              ? `Updated ${added + removed} feeds`
              : added > 0
              ? `Added to ${added} feed${added > 1 ? 's' : ''}`
              : `Removed from ${removed} feed${removed > 1 ? 's' : ''}`
          );
        }
      },
      onError: (error) => {
        console.error('❌ [AddToFeed] Failed to update feeds:', error);
        if (error.message) {
          showError(error.message);
        } else {
          showError('Failed to update feeds. Please try again.');
        }
      }
    });
  };

  if (!userState.isUnlocked || !userState.pnIdentifier) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-900 rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Add to Feed</h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="text-center py-8">
            <p className="text-text-secondary">
              Connect your pN to add files to feeds.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700">
          <div>
            <h2 className="text-xl font-bold text-white">Add to Feed</h2>
            <p className="text-text-secondary text-sm mt-1">
              Select feeds to add "{file.metadata.name || file.metadata.title || 'this file'}" to
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
          ) : userFeeds.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-secondary mb-4">
                You don't have any feeds yet.
              </p>
              <p className="text-text-secondary text-sm">
                Create a feed to add files to it.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {userFeeds.map((feed) => {
                const isSelected = selectedFeeds.has(feed.feedId);
                const wasInFeed = currentFeedMembership.has(feed.feedId);

                return (
                  <button
                    key={feed.feedId}
                    onClick={() => handleToggleFeed(feed.feedId)}
                    className={`w-full p-4 rounded-lg border-2 transition-colors text-left ${
                      isSelected
                        ? 'bg-blue-500/20 border-blue-500'
                        : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="text-white font-medium">{feed.feedName}</h3>
                          {wasInFeed && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                              Already in feed
                            </span>
                          )}
                        </div>
                        {feed.feedDescription && (
                          <p className="text-text-secondary text-sm line-clamp-2">
                            {feed.feedDescription}
                          </p>
                        )}
                        <div className="flex items-center space-x-3 mt-2 text-xs text-text-secondary">
                          {feed.subscriberCount !== undefined && (
                            <span>{feed.subscriberCount.toLocaleString()} subscribers</span>
                          )}
                          {feed.postCount !== undefined && (
                            <span>{feed.postCount} posts</span>
                          )}
                        </div>
                      </div>
                      <div className={`ml-4 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-neutral-600'
                      }`}>
                        {isSelected && <Check className="h-4 w-4 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-neutral-700">
          <button
            onClick={onClose}
            disabled={adding}
            className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAddToFeeds}
            disabled={adding || loading || userFeeds.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Updating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                {selectedFeeds.size === 0
                  ? 'Select Feeds'
                  : `Update ${selectedFeeds.size} Feed${selectedFeeds.size > 1 ? 's' : ''}`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

