/**
 * Feed Engagement Sidebar
 * TikTok-style vertical engagement buttons on the right side of feed posts
 */

import React from 'react';
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, Plus } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { Lock } from 'lucide-react';

interface FeedEngagementSidebarProps {
  file: IndexedFile;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onBookmark?: () => void;
  onMore?: () => void;
  onAddToFeed?: () => void;
  isLiked?: boolean;
  isOwner?: boolean;
}

export function FeedEngagementSidebar({
  file,
  onLike,
  onComment,
  onShare,
  onBookmark,
  onMore,
  onAddToFeed,
  isLiked = false,
  isOwner = false
}: FeedEngagementSidebarProps) {
  const { userState } = useUserState();
  const engagement = file.metadata.engagement;
  const likes = engagement?.likes || 0;
  const comments = engagement?.comments || 0;

  const handleAction = (action: 'like' | 'comment' | 'share' | 'bookmark', callback?: () => void) => {
    if (!userState.isUnlocked && (action === 'like' || action === 'comment')) {
      // Show connect prompt - handled by parent
      return;
    }
    callback?.();
  };

  return (
    <div className="absolute right-2 md:right-4 bottom-20 md:bottom-24 flex flex-col items-center space-y-4 md:space-y-6 z-10">
      {/* Like Button */}
      <button
        onClick={() => handleAction('like', onLike)}
        className="flex flex-col items-center space-y-1 group"
        title={!userState.isUnlocked ? 'Connect pN to like' : 'Like'}
      >
        <div className="relative">
          {!userState.isUnlocked && (
            <Lock className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400" />
          )}
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            <Heart className={`h-6 w-6 md:h-7 md:w-7 transition-colors ${
              isLiked
                ? 'text-red-500 fill-red-500'
                : userState.isUnlocked
                ? 'text-white group-hover:text-red-400'
                : 'text-white/50'
            }`} />
          </div>
        </div>
        <span className="text-xs text-white font-medium">{likes.toLocaleString()}</span>
      </button>

      {/* Comment Button */}
      <button
        onClick={() => handleAction('comment', onComment)}
        className="flex flex-col items-center space-y-1 group"
        title={!userState.isUnlocked ? 'Connect pN to comment' : 'Comment'}
      >
        <div className="relative">
          {!userState.isUnlocked && (
            <Lock className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400" />
          )}
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            <MessageCircle className={`h-6 w-6 md:h-7 md:w-7 transition-colors ${
              userState.isUnlocked
                ? 'text-white group-hover:text-blue-400'
                : 'text-white/50'
            }`} />
          </div>
        </div>
        <span className="text-xs text-white font-medium">{comments.toLocaleString()}</span>
      </button>

      {/* Share Button */}
      <button
        onClick={() => handleAction('share', onShare)}
        className="flex flex-col items-center space-y-1 group"
        title="Share"
      >
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
          <Share2 className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-green-400 transition-colors" />
        </div>
        <span className="text-xs text-white font-medium">Share</span>
      </button>

      {/* Bookmark Button */}
      {onBookmark && (
        <button
          onClick={() => handleAction('bookmark', onBookmark)}
          className="flex flex-col items-center space-y-1 group"
          title="Bookmark"
        >
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            <Bookmark className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-yellow-400 transition-colors" />
          </div>
        </button>
      )}

      {/* Add to Feed Button (for owners) */}
      {isOwner && onAddToFeed && (
        <button
          onClick={onAddToFeed}
          className="flex flex-col items-center space-y-1 group"
          title="Add to Feed"
        >
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            <Plus className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-blue-400 transition-colors" />
          </div>
          <span className="text-xs text-white font-medium">Feed</span>
        </button>
      )}

      {/* More Options */}
      {onMore && (
        <button
          onClick={onMore}
          className="flex flex-col items-center space-y-1 group"
          title="More options"
        >
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            <MoreVertical className="h-6 w-6 md:h-7 md:w-7 text-white transition-colors" />
          </div>
        </button>
      )}
    </div>
  );
}

