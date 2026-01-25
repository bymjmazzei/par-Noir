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
import { uploadQueueService } from '../services/uploadQueueService';
import { API_ENDPOINT } from '../config/api';

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

// Format numbers: full numbers up to 999, then one decimal place (e.g., 20.1K, 5.1M)
function formatEngagementCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  } else if (count < 1000000) {
    return (count / 1000).toFixed(1) + 'K';
  } else {
    return (count / 1000000).toFixed(1) + 'M';
  }
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
  const shares = engagement?.shares || 0;
  const saves = engagement?.saves || 0;
  const views = engagement?.views || 0;
  const [isSaved, setIsSaved] = useState(false);
  const [isCheckingSaved, setIsCheckingSaved] = useState(false);
  
  // Get creatorId - pnIdentifier is primary, others are compatibility fallbacks
  const creatorId = (file as any).pnIdentifier ||
                    file.metadata.creator?.identifier?.value || 
                    file.metadata.creator?.["@id"] || 
                    file.metadata.author?.did ||
                    (file.metadata as any).creatorId;
  
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

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }
    
    const fileId = file.metadata.fileId;
    const newIsSaved = !isSaved;
    
    // Optimistically update UI immediately
    setIsSaved(newIsSaved);
    if (newIsSaved) {
      success('Saved to your collection');
    } else {
      success('Removed from saved');
    }

    // Queue background task
    uploadQueueService.addTask({
      type: 'saveToFeed',
      accountId: '', // Not used for saved feed operations
      metadata: {
        fileId,
        userPnIdentifier: userState.pnIdentifier,
        isSaved: isSaved // Current state before toggle
      },
      onComplete: (result) => {
        console.log('✅ [SaveToFeed] Save operation completed:', result);
        // Update state with result
        if (result?.isSaved !== undefined) {
          setIsSaved(result.isSaved);
        }
      },
      onError: (error) => {
        console.error('❌ [SaveToFeed] Failed to save/unsave file:', error);
        error('Failed to save. Please try again.');
        // Rollback optimistic update
        setIsSaved(isSaved);
      }
    });
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const fileId = file.metadata.fileId;
    const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      success('Link copied to clipboard!');
      
      // Record share engagement if user is unlocked
      if (userState.isUnlocked && userState.pnIdentifier) {
        try {
          await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/share`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userPnIdentifier: userState.pnIdentifier })
          });
        } catch (engagementErr) {
          console.warn('Failed to record share engagement:', engagementErr);
        }
      }
      
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
          <span className="absolute -bottom-1 -left-1 text-xs text-white font-medium min-w-[1rem] text-center" style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))' }}>
            {formatEngagementCount(saves)}
          </span>
        </div>
      </button>

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="flex items-center justify-center group"
        title="Share"
      >
        <div className="relative">
          <svg 
            className="h-6 w-6 md:h-7 md:w-7"
            viewBox="0 0 223.87 199.31"
            fill="none"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))' }}
          >
            <path 
              d="M0,90.56c2.45-9.18,8.97-10.47,16.68-13.68C82.51,49.42,150.89,27.58,216.79.2c3.35-.69,7.2.32,7.08,4.26l-69.12,188.52c-4.53,6.91-14.09,7.87-21.04,4.25-20.64-14.84-41-30.05-61.77-44.72-.7-.5-1.69.21-1.23-1.72L207.08,15.94,52.13,137.23,4.07,102.91l-4.07-7.38v-4.98Z" 
              fill="white"
            />
          </svg>
          <span className="absolute -bottom-1 -left-1 text-xs text-white font-medium min-w-[1rem] text-center" style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))' }}>
            {formatEngagementCount(shares)}
          </span>
        </div>
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

      {/* Views Count - At the bottom */}
      <div className="flex flex-col items-center justify-center" style={{ width: '1.75rem' }}>
        <span className="text-sm md:text-base text-white font-medium text-center leading-tight" style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))' }}>
          {formatEngagementCount(views)}
        </span>
        <span 
          className="text-white font-medium text-center leading-tight whitespace-nowrap"
          style={{ 
            filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
            fontSize: 'clamp(0.5rem, 1.5vw, 0.625rem)',
            transform: 'scaleX(0.9)',
            transformOrigin: 'center'
          }}
        >
          VIEWS
        </span>
      </div>
    </div>
  );
}

