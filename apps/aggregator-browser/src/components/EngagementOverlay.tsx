/**
 * Engagement Overlay Component
 * Slide-up overlay for engagement actions (like, comment, share, save)
 */

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, X } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { ShareMenu } from './ShareMenu';

interface EngagementOverlayProps {
  file: IndexedFile;
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave?: () => void;
  onClose: () => void;
  isOpen: boolean;
}

export function EngagementOverlay({
  file,
  isLiked,
  likeCount,
  commentCount,
  shareCount,
  onLike,
  onComment,
  onShare,
  onSave,
  onClose,
  isOpen
}: EngagementOverlayProps) {
  const { userState } = useUserState();
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  // Close overlay when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-engagement-overlay], [data-share-menu]')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[150] transition-opacity"
        onClick={onClose}
      />

      {/* Slide-up overlay - Higher z-index than bottom nav (z-[100]) */}
      <div
        data-engagement-overlay
        className={`fixed bottom-0 left-0 right-0 bg-neutral-900 rounded-t-2xl z-[150] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '80vh', paddingBottom: '64px' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-neutral-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-700 flex items-center justify-between">
          <h3 className="text-white font-semibold text-lg">Engage</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Engagement Actions */}
        <div className="px-6 py-6 space-y-4">
          {/* Like */}
          <button
            onClick={() => {
              onLike();
              onClose();
            }}
            className="w-full flex items-center space-x-4 p-4 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isLiked ? 'bg-red-500/20' : 'bg-neutral-700'
            }`}>
              <Heart className={`h-6 w-6 ${
                isLiked ? 'text-red-500 fill-red-500' : 'text-white'
              }`} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-white font-medium">{isLiked ? 'Unlike' : 'Like'}</div>
              <div className="text-neutral-400 text-sm">{likeCount.toLocaleString()} likes</div>
            </div>
          </button>

          {/* Comment */}
          <button
            onClick={() => {
              onComment();
              onClose();
            }}
            className="w-full flex items-center space-x-4 p-4 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-white font-medium">Comment</div>
              <div className="text-neutral-400 text-sm">{commentCount.toLocaleString()} comments</div>
            </div>
          </button>

          {/* Share */}
          <div className="space-y-2">
            <button
              onClick={() => setShareMenuOpen(true)}
              className="w-full flex items-center space-x-4 p-4 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center">
                <Share2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-medium">Share</div>
                <div className="text-neutral-400 text-sm">{shareCount.toLocaleString()} shares</div>
              </div>
            </button>

            {shareMenuOpen && (
              <ShareMenu
                file={file}
                onClose={() => setShareMenuOpen(false)}
                onShared={() => {
                  onShare();
                  setShareMenuOpen(false);
                  onClose();
                }}
              />
            )}
          </div>

          {/* Save (only for unlocked users) - Private collection, not shown in Me feed */}
          {onSave && userState.isUnlocked && (
            <button
              onClick={() => {
                onSave();
                onClose();
              }}
              className="w-full flex items-center space-x-4 p-4 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center">
                <Bookmark className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-medium">Save</div>
                <div className="text-neutral-400 text-sm">Save to private collection</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

