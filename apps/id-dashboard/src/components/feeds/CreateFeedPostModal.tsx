/**
 * Create Feed Post Modal
 * Allows feed owners/delegates to create enhanced posts using EnhancedThoughtCreator
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { FeedService, FeedPost } from '../../services/feeds/FeedService';
import { EnhancedThoughtCreator, EnhancedPostContent } from './EnhancedThoughtCreator';
import { Feed } from '../../services/feeds/FeedService';

interface CreateFeedPostModalProps {
  feed: Feed;
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: (post: FeedPost) => void;
  authenticatedUser: { id: string } | null;
  canCreatePost?: boolean;
  blockedMessage?: string;
}

export const CreateFeedPostModal: React.FC<CreateFeedPostModalProps> = ({
  feed,
  isOpen,
  onClose,
  onPostCreated,
  authenticatedUser,
  canCreatePost = true,
  blockedMessage,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (content: EnhancedPostContent) => {
    if (!authenticatedUser) {
      setError('User not authenticated');
      return;
    }
    if (!canCreatePost) {
      setError(blockedMessage || 'This action requires a keyed device.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Convert EnhancedPostContent to FeedPost format
      const post: Omit<FeedPost, 'id' | 'feedId' | 'createdAt' | 'updatedAt'> = {
        content: content.text,
        media: content.media.map(m => ({
          type: m.type,
          url: m.url,
          thumbnail: m.thumbnail
        })),
        buttons: content.buttons.map(b => ({
          label: b.label,
          url: b.url,
          style: b.style
        })),
        polls: content.polls.map(p => ({
          question: p.question,
          options: p.options
        })),
        forms: content.forms.map(f => ({
          title: f.title,
          fields: f.fields.map(field => ({
            name: field.name,
            type: field.type,
            required: field.required,
            options: field.options
          }))
        })),
        isTopPost: false
      };

      const createdPost = await FeedService.createFeedPost(feed.feedId, post);
      onPostCreated?.(createdPost);
      onClose();
    } catch (err) {
      console.error('Failed to create feed post:', err);
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Create Feed Post</h2>
            <p className="text-sm text-neutral-400 mt-1">{feed.feedName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
            disabled={isCreating}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Enhanced Thought Creator */}
        <EnhancedThoughtCreator
          initialContent={undefined}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isTopPost={false}
        />
      </div>
    </div>
  );
};

