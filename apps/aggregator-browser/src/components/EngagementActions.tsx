/**
 * Engagement Actions Component
 * Like, comment, and share buttons with unlock gating
 */

import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, Lock, Plus } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { PNConnect } from './PNConnect';
import { IndexedFile } from '../types/aggregator';

interface EngagementActionsProps {
  file: IndexedFile;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onAddToFeed?: () => void;
  compact?: boolean;
  isOwner?: boolean;
}

export function EngagementActions({
  file,
  onLike,
  onComment,
  onShare,
  onAddToFeed,
  compact = false,
  isOwner = false
}: EngagementActionsProps) {
  const { userState } = useUserState();
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const engagement = file.metadata.engagement;
  const likes = engagement?.likes || 0;
  const comments = engagement?.comments || 0;

  const handleAction = (action: 'like' | 'comment' | 'share', callback?: () => void) => {
    if (!userState.isUnlocked && (action === 'like' || action === 'comment')) {
      setShowConnectPrompt(true);
      return;
    }
    callback?.();
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-4">
        <button
          onClick={() => handleAction('like', onLike)}
          className="flex items-center space-x-1 text-text-secondary hover:text-red-400 transition-colors"
          title={!userState.isUnlocked ? 'Connect pN to like' : 'Like'}
        >
          {!userState.isUnlocked && <Lock className="h-3 w-3" />}
          <Heart className="h-4 w-4" />
          <span className="text-xs">{likes}</span>
        </button>
        <button
          onClick={() => handleAction('comment', onComment)}
          className="flex items-center space-x-1 text-text-secondary hover:text-blue-400 transition-colors"
          title={!userState.isUnlocked ? 'Connect pN to comment' : 'Comment'}
        >
          {!userState.isUnlocked && <Lock className="h-3 w-3" />}
          <MessageCircle className="h-4 w-4" />
          <span className="text-xs">{comments}</span>
        </button>
        <button
          onClick={() => handleAction('share', onShare)}
          className="flex items-center space-x-1 text-text-secondary hover:text-green-400 transition-colors"
          title="Share"
        >
          <Share2 className="h-4 w-4" />
        </button>
        {isOwner && onAddToFeed && (
          <button
            onClick={onAddToFeed}
            className="flex items-center space-x-1 text-text-secondary hover:text-blue-400 transition-colors"
            title="Add to Feed"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center space-x-6">
        <button
          onClick={() => handleAction('like', onLike)}
          className="flex flex-col items-center space-y-1 group"
          title={!userState.isUnlocked ? 'Connect pN to like' : 'Like'}
        >
          <div className="relative">
            {!userState.isUnlocked && (
              <Lock className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400" />
            )}
            <Heart className={`h-6 w-6 transition-colors ${
              userState.isUnlocked
                ? 'text-text-secondary group-hover:text-red-400'
                : 'text-text-secondary opacity-50'
            }`} />
          </div>
          <span className="text-xs text-text-secondary">{likes}</span>
        </button>
        
        <button
          onClick={() => handleAction('comment', onComment)}
          className="flex flex-col items-center space-y-1 group"
          title={!userState.isUnlocked ? 'Connect pN to comment' : 'Comment'}
        >
          <div className="relative">
            {!userState.isUnlocked && (
              <Lock className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400" />
            )}
            <MessageCircle className={`h-6 w-6 transition-colors ${
              userState.isUnlocked
                ? 'text-text-secondary group-hover:text-blue-400'
                : 'text-text-secondary opacity-50'
            }`} />
          </div>
          <span className="text-xs text-text-secondary">{comments}</span>
        </button>
        
        <button
          onClick={() => handleAction('share', onShare)}
          className="flex flex-col items-center space-y-1 group"
          title="Share"
        >
          <Share2 className="h-6 w-6 text-text-secondary group-hover:text-green-400 transition-colors" />
        </button>
      </div>

      {showConnectPrompt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-xl max-w-md w-full p-6">
            <h3 className="text-white text-xl font-bold mb-4">Connect Your pN</h3>
            <PNConnect compact onConnect={() => setShowConnectPrompt(false)} />
            <button
              onClick={() => setShowConnectPrompt(false)}
              className="mt-4 w-full px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

