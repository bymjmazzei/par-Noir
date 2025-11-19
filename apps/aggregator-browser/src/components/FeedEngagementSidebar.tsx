/**
 * Feed Engagement Sidebar
 * TikTok-style vertical engagement buttons on the right side of feed posts
 */

import React, { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, Plus, Edit, BookmarkCheck } from 'lucide-react';
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
  
  // Debug logging (only for own files to avoid spam)
  if (userState.isUnlocked && userState.pnIdentifier) {
    console.log('🔍 [FeedEngagementSidebar] Ownership check:', {
      creatorId,
      normalizedCreatorId,
      userPnIdentifier: userState.pnIdentifier,
      normalizedUserPnId,
      match: normalizedCreatorId === normalizedUserPnId,
      isOwner,
      finalIsOwner: isOwner || (normalizedCreatorId === normalizedUserPnId)
    });
  }
  
  // Calculate isOwner - normalize both IDs before comparison
  const calculatedIsOwner = isOwner || (userState.isUnlocked && normalizedUserPnId && normalizedCreatorId === normalizedUserPnId);

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
      console.warn(`No handler provided for ${action} action`);
    }
  };

  return (
    <div className="absolute right-2 md:right-4 bottom-20 flex flex-col items-center justify-between z-10 pointer-events-auto" style={{ gap: '12px' }}>
      {/* Creator Profile Icon - Above Like Button */}
      {creatorId && (
        <ProfileActionMenu
          creatorId={creatorId}
          onViewProfile={() => {
            console.log('🔍 ProfileActionMenu onViewProfile called with creatorId:', creatorId);
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
        onClick={(e) => handleAction(e, 'comment', onComment)}
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
        onClick={handleShare}
        className="flex flex-col items-center space-y-1 group"
        title="Share"
      >
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
          <Share2 className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-green-400 transition-colors" />
        </div>
      </button>

      {/* Save Button */}
      {userState.isUnlocked && (
        <button
          onClick={handleSave}
          className="flex flex-col items-center space-y-1 group"
          title={isSaved ? 'Remove from saved' : 'Save'}
          disabled={isCheckingSaved}
        >
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            {isSaved ? (
              <BookmarkCheck className="h-6 w-6 md:h-7 md:w-7 text-yellow-400 fill-yellow-400 transition-colors" />
            ) : (
              <Bookmark className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-yellow-400 transition-colors" />
            )}
          </div>
        </button>
      )}

      {/* Bookmark Button (legacy - only show if onBookmark callback provided) */}
      {onBookmark && (
        <button
          onClick={(e) => handleAction(e, 'bookmark', onBookmark)}
          className="flex flex-col items-center space-y-1 group"
          title="Bookmark"
        >
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            <Bookmark className="h-6 w-6 md:h-7 md:w-7 text-white group-hover:text-yellow-400 transition-colors" />
          </div>
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
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/50 active:bg-black/70 transition-colors touch-manipulation">
            <MoreVertical className="h-6 w-6 md:h-7 md:w-7 text-white transition-colors" />
          </div>
        </button>
      )}
    </div>
  );
}

