/**
 * Feed Engagement Sidebar
 * TikTok-style vertical engagement buttons on the right side of feed posts
 */

import React, { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, Plus, Edit, Send } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { Lock } from 'lucide-react';
import { ProfileActionMenu } from './ProfileActionMenu';
import { useToast } from '../hooks/useToast';
import { isFileSaved, saveToFeed, removeFromSavedFeed } from '../services/savedFeedService';

interface FeedEngagementSidebarProps {
  file: IndexedFile;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onBookmark?: () => void;
  onMore?: () => void;
  onAddToFeed?: () => void;
  onEdit?: () => void;
  isLiked?: boolean;
  isOwner?: boolean;
  onCreatorClick?: (creatorId: string) => void;
  onMessage?: (creatorId: string) => void;
  indexedFiles?: IndexedFile[]; // For loading profile images
}

export function FeedEngagementSidebar({
  file,
  onLike,
  onComment,
  onShare,
  onBookmark,
  onMore,
  onAddToFeed,
  onEdit,
  isLiked = false,
  isOwner = false,
  onCreatorClick,
  onMessage,
  indexedFiles = []
}: FeedEngagementSidebarProps) {
  const { userState } = useUserState();
  const { success, error } = useToast();
  const engagement = file.metadata.engagement;
  const likes = engagement?.likes || 0;
  const comments = engagement?.comments || 0;
  const [isSaved, setIsSaved] = useState(false);
  const [isCheckingSaved, setIsCheckingSaved] = useState(false);
  
  // Get creatorId - this is now the pN identifier (set from entry.pnIdentifier during conversion)
  const creatorId = (file.metadata as any).creatorId || 
                    file.metadata.creator?.identifier?.value || 
                    file.metadata.creator?.["@id"] || 
                    file.metadata.author?.did;
  
  // Normalize identifiers for comparison (remove "pn-" prefix if present)
  const normalizeId = (id: string | undefined | null): string => {
    if (!id) return '';
    return id.startsWith('pn-') ? id.substring(3) : id;
  };
  
  const normalizedCreatorId = normalizeId(creatorId);
  const normalizedUserPnId = normalizeId(userState.pnIdentifier);
  
  // Calculate isOwner - normalize both IDs before comparison
  const calculatedIsOwner = isOwner || (userState.isUnlocked && !!normalizedUserPnId && normalizedCreatorId === normalizedUserPnId);

  // Check if file is saved when component mounts or user unlocks
  useEffect(() => {
    if (userState.isUnlocked && userState.pnIdentifier && file.metadata.fileId) {
      setIsCheckingSaved(true);
      isFileSaved(userState.pnIdentifier, file.metadata.fileId)
        .then(saved => {
          setIsSaved(saved);
          setIsCheckingSaved(false);
        })
        .catch(err => {
          console.error('Failed to check if file is saved:', err);
          setIsCheckingSaved(false);
        });
    } else {
      setIsSaved(false);
    }
  }, [userState.isUnlocked, userState.pnIdentifier, file.metadata.fileId]);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }
    
    const fileId = file.metadata.fileId;
    
    try {
      if (isSaved) {
        await removeFromSavedFeed(userState.pnIdentifier, fileId);
        setIsSaved(false);
        success('Removed from saved');
      } else {
        await saveToFeed(userState.pnIdentifier, fileId);
        setIsSaved(true);
        success('Saved to your collection');
      }
    } catch (err) {
      console.error('Failed to save/unsave file:', err);
      error('Failed to save. Please try again.');
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const fileId = file.metadata.fileId;
    const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      success('Link copied to clipboard!');
      
      // Call optional callback for additional actions (like recording share)
      if (onShare) {
        onShare();
      }
    } catch (err) {
      console.error('Failed to copy link:', err);
      error('Failed to copy link. Please try again.');
    }
  };

  const handleAction = (e: React.MouseEvent, action: 'like' | 'comment' | 'bookmark', callback?: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!userState.isUnlocked && (action === 'like' || action === 'comment')) {
      // Show connect prompt - handled by parent
      return;
    }
    
    if (callback) {
      callback();
    } else {
      console.warn(`[FeedEngagementSidebar] No handler provided for ${action} action`);
    }
  };

  return (
    <div 
      className="absolute right-2 md:right-4 flex flex-col items-center z-20 pointer-events-auto" 
      style={{ 
        gap: '16px',
        // Position just a few pixels above the bottom bar (caption bar)
        // Minimal gap - accounts for bottom bar height plus small separation
        bottom: 'calc(32px + env(safe-area-inset-bottom, 0px) + 8px)'
      }}
    >
      {/* Creator Profile Icon - Above Like Button */}
      {creatorId && (
        <ProfileActionMenu
          creatorId={creatorId}
          onViewProfile={() => {
            onCreatorClick?.(creatorId);
          }}
          onMessage={onMessage}
          indexedFiles={indexedFiles}
          isOwner={calculatedIsOwner}
        />
      )}

      {/* Like Button */}
      <button
        onClick={(e) => handleAction(e, 'like', onLike)}
        className="flex items-center justify-center group"
        title={!userState.isUnlocked ? 'Connect pN to like' : 'Like'}
      >
        <div className="relative">
          {!userState.isUnlocked && (
            <Lock className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400 z-10" />
          )}
          <Heart 
            className={`h-6 w-6 md:h-7 md:w-7 transition-colors ${
              isLiked
                ? 'text-red-500'
                : 'text-white'
            }`} 
            fill={isLiked ? 'red' : 'white'}
            style={{ 
              fill: isLiked ? 'red' : 'white', 
              filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))'
            }}
          />
          <span className="absolute -bottom-1 -left-1 text-xs text-white font-medium min-w-[1rem] text-center" style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))' }}>
            {likes.toLocaleString()}
          </span>
        </div>
      </button>

      {/* Comment Button */}
      <button
        onClick={(e) => {
          console.log('[FeedEngagementSidebar] Comment button clicked', { 
            onComment: !!onComment, 
            onCommentType: typeof onComment,
            isUnlocked: userState.isUnlocked,
            hasCallback: typeof onComment === 'function'
          });
          if (onComment && typeof onComment === 'function') {
            handleAction(e, 'comment', onComment);
          } else {
            console.warn('[FeedEngagementSidebar] onComment is not a function:', onComment);
          }
        }}
        className="flex items-center justify-center group"
        title={!userState.isUnlocked ? 'Connect pN to comment' : 'Comment'}
      >
        <div className="relative">
          {!userState.isUnlocked && (
            <Lock className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400 z-10" />
          )}
          <MessageCircle 
            className="h-6 w-6 md:h-7 md:w-7 text-white transition-colors" 
            fill="white"
            style={{ 
              fill: 'white', 
              transform: 'scaleX(-1)', 
              filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))'
            }}
          />
          <span className="absolute -bottom-1 -left-1 text-xs text-white font-medium min-w-[1rem] text-center" style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))' }}>
            {comments.toLocaleString()}
          </span>
        </div>
      </button>

      {/* Save Button - Always show, but require unlock to function */}
      <button
        onClick={handleSave}
        className="flex items-center justify-center group"
        title={userState.isUnlocked ? (isSaved ? 'Remove from saved' : 'Save') : 'Connect pN to save'}
        disabled={isCheckingSaved || !userState.isUnlocked}
      >
        <div className="relative">
          {!userState.isUnlocked && (
            <Lock className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400 z-10" />
          )}
          <Bookmark 
            className={`h-6 w-6 md:h-7 md:w-7 transition-colors ${
              isSaved
                ? 'text-yellow-400'
                : 'text-white'
            }`} 
            fill={isSaved ? 'yellow' : 'white'}
            style={{ 
              fill: isSaved ? 'yellow' : 'white', 
              filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))'
            }}
          />
        </div>
      </button>

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="flex items-center justify-center group"
        title="Share"
      >
        <svg 
          className="h-6 w-6 md:h-7 md:w-7"
          viewBox="0 0 24 24"
          fill="none"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))' }}
        >
          <defs>
            <mask id="send-icon-mask">
              <rect width="24" height="24" fill="white"/>
              {/* Cutout triangle - black in mask means transparent */}
              <path d="M 3 20 L 5.5 17.5 L 4.5 19 Z" fill="black"/>
            </mask>
          </defs>
          <Send 
            className="h-6 w-6 md:h-7 md:w-7 text-white transition-colors" 
            fill="white"
            style={{ fill: 'white', mask: 'url(#send-icon-mask)', WebkitMask: 'url(#send-icon-mask)' }}
          />
        </svg>
      </button>

      {/* Bookmark Button (legacy - only show if onBookmark callback provided) */}
      {onBookmark && (
        <button
          onClick={(e) => handleAction(e, 'bookmark', onBookmark)}
          className="flex flex-col items-center space-y-1 group"
          title="Bookmark"
        >
          <Bookmark 
            className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-yellow-400 transition-colors" 
            fill="white"
            style={{ fill: 'white' }}
          />
        </button>
      )}



      {/* More Options */}
      {onMore && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onMore();
          }}
          className="flex flex-col items-center space-y-1 group"
          title="More options"
        >
          <MoreVertical 
            className="h-6 w-6 md:h-7 md:w-7 text-white transition-colors" 
            fill="white"
            style={{ fill: 'white' }}
          />
        </button>
      )}
    </div>
  );
}

