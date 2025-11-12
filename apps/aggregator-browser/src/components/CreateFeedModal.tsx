/**
 * Create Feed Modal Component
 * Allows paid-tier creators to create new feeds
 */

import React, { useState } from 'react';
import { X, Plus, Image as ImageIcon, Sparkles, AlertCircle, Check } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';
import { FeedCategory, ContentRating } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { FEED_CATEGORIES, getAllFeedCategories } from '../constants/feedCategories';
import { ContentRatingBadge } from './ContentRatingBadge';

interface CreateFeedModalProps {
  onClose: () => void;
  onFeedCreated?: (feed: any) => void;
}

export function CreateFeedModal({ onClose, onFeedCreated }: CreateFeedModalProps) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [feedName, setFeedName] = useState('');
  const [feedDescription, setFeedDescription] = useState('');
  const [feedCategory, setFeedCategory] = useState<FeedCategory | ''>('');
  const [ratingRange, setRatingRange] = useState<ContentRating[]>(['GA', 'FF', 'T13+', 'YA16+']);
  const [bannerImage, setBannerImage] = useState<string>('');
  const [avatar, setAvatar] = useState<string>('');
  const [bio, setBio] = useState('');
  const [creating, setCreating] = useState(false);

  // Check if user is paid tier (in production, check actual tier)
  const isPaidTier = userState.isUnlocked && userState.pnIdentifier; // Simplified check

  const handleRatingToggle = (rating: ContentRating) => {
    if (ratingRange.includes(rating)) {
      setRatingRange(ratingRange.filter(r => r !== rating));
    } else {
      setRatingRange([...ratingRange, rating].sort((a, b) => {
        const order: ContentRating[] = ['GA', 'FF', 'T13+', 'YA16+', 'M18+', 'NSFW', 'X18+'];
        return order.indexOf(a) - order.indexOf(b);
      }));
    }
  };

  const handleCreateFeed = async () => {
    if (!feedName.trim()) {
      showError('Feed name is required');
      return;
    }

    if (!userState.isUnlocked || !userState.pnIdentifier) {
      showError('Connect your pN to create feeds');
      return;
    }

    if (!isPaidTier) {
      showError('Feed creation requires a paid tier. Upgrade to create feeds.');
      return;
    }

    setCreating(true);

    try {
      const feed = await FeedService.createFeed({
        feedName: feedName.trim(),
        feedDescription: feedDescription.trim() || undefined,
        feedCategory: feedCategory || undefined,
        creatorDid: userState.pnIdentifier,
        creatorTier: 'feed', // In production, get actual tier
        feedRatingRange: ratingRange,
        branding: {
          bannerImage: bannerImage || undefined,
          avatar: avatar || undefined,
          bio: bio.trim() || undefined
        }
      });

      success('Feed created successfully!');
      onFeedCreated?.(feed);
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to create feed');
    } finally {
      setCreating(false);
    }
  };

  if (!isPaidTier) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-neutral-900 rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Create Feed</h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Upgrade Required</h3>
            <p className="text-text-secondary mb-4">
              Feed creation is available for paid-tier creators only.
            </p>
            <p className="text-text-secondary text-sm">
              Upgrade to the Feed tier or Self-Hosted tier to create branded feeds.
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
            <h2 className="text-xl font-bold text-white">Create New Feed</h2>
            <p className="text-text-secondary text-sm mt-1">Create a branded feed for your content</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Feed Name */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Feed Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={feedName}
              onChange={(e) => setFeedName(e.target.value)}
              placeholder="My Awesome Feed"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={255}
            />
          </div>

          {/* Feed Description */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Description
            </label>
            <textarea
              value={feedDescription}
              onChange={(e) => setFeedDescription(e.target.value)}
              placeholder="Describe your feed..."
              rows={3}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Category
            </label>
            <select
              value={feedCategory}
              onChange={(e) => setFeedCategory(e.target.value as FeedCategory | '')}
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a category (optional)</option>
              {getAllFeedCategories()
                .filter(cat => cat.id !== 'adults-only' || userState.preferences.ageVerified)
                .map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Content Rating Range */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Content Rating Range
            </label>
            <p className="text-text-secondary text-sm mb-3">
              Select which content ratings your feed will accept
            </p>
            <div className="flex flex-wrap gap-2">
              {(['GA', 'FF', 'T13+', 'YA16+', 'M18+', 'NSFW', 'X18+'] as ContentRating[]).map((rating) => {
                const isSelected = ratingRange.includes(rating);
                return (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => handleRatingToggle(rating)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                    <ContentRatingBadge rating={rating} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Branding Section */}
          <div className="border-t border-neutral-700 pt-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Sparkles className="h-5 w-5 mr-2" />
              Branding (Optional)
            </h3>

            {/* Banner Image URL */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Banner Image URL
              </label>
              <input
                type="url"
                value={bannerImage}
                onChange={(e) => setBannerImage(e.target.value)}
                placeholder="https://example.com/banner.jpg"
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Avatar URL */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Avatar URL
              </label>
              <input
                type="url"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about your feed..."
                rows={3}
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-neutral-700">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateFeed}
            disabled={creating || !feedName.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {creating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Feed
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

