/**
 * Comment Modal Component
 * Shows comments and allows adding new ones with threading, likes, and emoji reactions
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Send, Heart, User, Reply, ChevronDown, ChevronUp } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { useEngagement } from '../hooks/useEngagement';
import { useToast } from '../hooks/useToast';
import { PNConnect } from './PNConnect';

interface CommentModalProps {
  file: IndexedFile;
  onClose: () => void;
}

interface Comment {
  id: string;
  fileId: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  likes: string[]; // Array of user IDs who liked
  replies?: Comment[];
  postReply?: {
    fileId: string;
    thumbnail?: string;
    title?: string;
  };
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯'];

export function CommentModal({ file, onClose }: CommentModalProps) {
  console.log('[CommentModal] Component function called', { fileId: file?.metadata?.fileId });
  
  const { userState } = useUserState();
  const { addComment, getComments, loadComments, likeComment } = useEngagement();
  const { success } = useToast();
  
  // Log when modal is rendered and ensure it's visible
  useEffect(() => {
    console.log('[CommentModal] Modal rendered (useEffect)', { fileId: file.metadata.fileId });
    // Force the modal to be visible by ensuring backdrop and modal are in DOM
    setTimeout(() => {
      if (backdropRef.current) {
        console.log('[CommentModal] Backdrop element exists in DOM');
        const styles = window.getComputedStyle(backdropRef.current);
        console.log('[CommentModal] Backdrop computed styles:', {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          zIndex: styles.zIndex,
          position: styles.position
        });
      }
      if (modalRef.current) {
        console.log('[CommentModal] Modal element exists in DOM');
        const styles = window.getComputedStyle(modalRef.current);
        console.log('[CommentModal] Modal computed styles:', {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          zIndex: styles.zIndex,
          position: styles.position
        });
      }
    }, 100);
  }, [file.metadata.fileId]);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>(getComments(file.metadata.fileId));
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [expandedPostReplies, setExpandedPostReplies] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [commentInputHeight, setCommentInputHeight] = useState(60);

  useEffect(() => {
    // Load comments from backend when modal opens
    const load = async () => {
      setLoading(true);
      const loadedComments = await loadComments(file.metadata.fileId);
      // Normalize comments to ensure likes is always an array
      const normalizeComment = (comment: any): Comment => {
        return {
          ...comment,
          likes: Array.isArray(comment.likes) 
            ? comment.likes 
            : (typeof comment.likes === 'number' ? [] : []), // Convert old number format to empty array
          replies: comment.replies ? comment.replies.map(normalizeComment) : undefined
        };
      };
      const normalized = loadedComments.length > 0 
        ? loadedComments.map(normalizeComment)
        : getComments(file.metadata.fileId).map(normalizeComment);
      setComments(normalized);
      setLoading(false);
    };
    load();
  }, [file.metadata.fileId, loadComments, getComments]);

  useEffect(() => {
    if (inputRef.current) {
      const initialHeight = inputRef.current.scrollHeight;
      const paddedHeight = initialHeight + 32;
      setCommentInputHeight(paddedHeight);
      inputRef.current.focus();
    }
  }, []);

  // Close modal when clicking outside or navigating
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only close if clicking directly on the backdrop
      const target = event.target as HTMLElement;
      // Check if click is on the backdrop itself (not on any child)
      if (backdropRef.current && target === backdropRef.current) {
        console.log('[CommentModal] Clicked on backdrop, closing modal');
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Close on navigation (hashchange, popstate) - but only if actually navigating away
    const handleNavigation = (e: PopStateEvent | HashChangeEvent) => {
      // Don't close if it's just a hash change for the same file
      console.log('[CommentModal] Navigation event', e.type);
      onClose();
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !userState.isUnlocked) return;

    const authorId = userState.pnIdentifier || 'anonymous';
    const authorName = userState.pnIdentifier?.substring(0, 8) || 'Anonymous';
    
    await addComment(file.metadata.fileId, newComment.trim(), authorId, authorName);
    setNewComment('');
    
    // Reload comments from backend
    const loadedComments = await loadComments(file.metadata.fileId);
    setComments(loadedComments.length > 0 ? loadedComments : getComments(file.metadata.fileId));
    
    success('Comment posted!');
  };

  const handleEmojiClick = async (emoji: string) => {
    if (!userState.isUnlocked) return;
    
    const authorId = userState.pnIdentifier || 'anonymous';
    const authorName = userState.pnIdentifier?.substring(0, 8) || 'Anonymous';
    
    await addComment(file.metadata.fileId, emoji, authorId, authorName);
    
    // Reload comments
    const loadedComments = await loadComments(file.metadata.fileId);
    setComments(loadedComments.length > 0 ? loadedComments : getComments(file.metadata.fileId));
    
    success('Reaction posted!');
  };

  const handleReplySubmit = async (parentCommentId: string) => {
    if (!replyContent.trim() || !userState.isUnlocked) return;

    const authorId = userState.pnIdentifier || 'anonymous';
    const authorName = userState.pnIdentifier?.substring(0, 8) || 'Anonymous';
    
    await addComment(file.metadata.fileId, replyContent.trim(), authorId, authorName, parentCommentId);
    setReplyContent('');
    setReplyingTo(null);
    
    // Reload comments
    const loadedComments = await loadComments(file.metadata.fileId);
    setComments(loadedComments.length > 0 ? loadedComments : getComments(file.metadata.fileId));
    
    // Expand replies for this comment
    setExpandedReplies(prev => new Set(prev).add(parentCommentId));
    
    success('Reply posted!');
  };

  const handleLike = async (commentId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;
    
    await likeComment(file.metadata.fileId, commentId, userState.pnIdentifier);
    
    // Reload comments to get updated like status
    const loadedComments = await loadComments(file.metadata.fileId);
    setComments(loadedComments.length > 0 ? loadedComments : getComments(file.metadata.fileId));
  };

  const isLiked = (comment: Comment): boolean => {
    if (!userState.pnIdentifier) return false;
    // Handle both old format (number) and new format (array)
    if (Array.isArray(comment.likes)) {
      return comment.likes.includes(userState.pnIdentifier);
    }
    return false;
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const togglePostReply = (commentId: string) => {
    setExpandedPostReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const renderComment = (comment: Comment, isReply: boolean = false, depth: number = 0) => {
    const hasReplies = comment.replies && comment.replies.length > 0;
    const repliesExpanded = expandedReplies.has(comment.id);
    const postReplyExpanded = expandedPostReplies.has(comment.id);
    const liked = isLiked(comment);
    // Handle both old format (number) and new format (array)
    const likeCount = Array.isArray(comment.likes) ? comment.likes.length : (typeof comment.likes === 'number' ? comment.likes : 0);

    return (
      <div key={comment.id} className={`${isReply ? 'ml-8 mt-3' : ''} ${depth > 0 ? 'border-l-2 border-neutral-700 pl-4' : ''}`}>
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-white font-medium text-sm">{comment.authorName}</span>
              <span className="text-text-secondary text-xs">
                {new Date(comment.timestamp).toLocaleDateString()}
              </span>
            </div>
            <p className="text-white text-sm mb-2">{comment.content}</p>
            
            {/* Actions */}
            <div className="flex items-center space-x-4 mt-2">
              <button
                onClick={() => handleLike(comment.id)}
                disabled={!userState.isUnlocked || liked}
                className={`flex items-center space-x-1 transition-colors ${
                  liked 
                    ? 'text-red-400' 
                    : 'text-text-secondary hover:text-red-400'
                } ${!userState.isUnlocked || liked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                <span className="text-xs">{likeCount > 0 ? likeCount : ''}</span>
              </button>
              
              {!isReply && (
                <button
                  onClick={() => {
                    setReplyingTo(replyingTo === comment.id ? null : comment.id);
                    setTimeout(() => replyInputRef.current?.focus(), 0);
                  }}
                  className="flex items-center space-x-1 text-text-secondary hover:text-white transition-colors"
                >
                  <Reply className="h-3 w-3" />
                  <span className="text-xs">Reply</span>
                </button>
              )}
              
              {comment.postReply && (
                <button
                  onClick={() => togglePostReply(comment.id)}
                  className="flex items-center space-x-1 text-text-secondary hover:text-white transition-colors"
                >
                  {postReplyExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      <span className="text-xs">Hide post</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      <span className="text-xs">Show post</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Reply Input */}
            {replyingTo === comment.id && (
              <div className="mt-3 ml-8">
                {/* Emoji Railway - Above text bar */}
                <div className="mb-2">
                  <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {['😀', '😂', '❤️', '😍', '🤔', '😮', '😢', '🔥', '👏', '💯', '👍', '👎', '🎉', '🙌', '😊', '😎', '🤗', '😴', '🤯', '🥳'].map((emoji, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setReplyContent(prev => prev + emoji);
                        }}
                        className="text-xl hover:scale-110 transition-transform p-1 flex-shrink-0"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-end gap-2">
                  <textarea
                    ref={replyInputRef}
                    value={replyContent}
                    onChange={(e) => {
                      setReplyContent(e.target.value);
                      // Auto-resize textarea
                      if (replyInputRef.current) {
                        replyInputRef.current.style.height = 'auto';
                        const newHeight = Math.min(replyInputRef.current.scrollHeight, 200);
                        replyInputRef.current.style.height = `${newHeight}px`;
                      }
                    }}
                    placeholder="Write a reply..."
                    className="flex-1 bg-neutral-800 text-white rounded-lg p-3 border border-neutral-700 focus:border-blue-500 focus:outline-none resize-none overflow-y-auto"
                    style={{ 
                      minHeight: '44px',
                      maxHeight: '200px',
                      lineHeight: '1.5'
                    }}
                    rows={1}
                    maxLength={500}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (replyContent.trim()) {
                          handleReplySubmit(comment.id);
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyContent('');
                    }}
                    className="p-2 text-text-secondary hover:text-white transition-colors flex items-center justify-center"
                    title="Cancel"
                  >
                    <span className="text-sm">Cancel</span>
                  </button>
                  <button
                    onClick={() => handleReplySubmit(comment.id)}
                    disabled={!replyContent.trim()}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center mb-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Post Reply Preview */}
            {comment.postReply && postReplyExpanded && (
              <div className="mt-3 ml-8 p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                {comment.postReply.thumbnail && (
                  <img 
                    src={comment.postReply.thumbnail} 
                    alt="Post reply"
                    className="w-full rounded mb-2"
                  />
                )}
                {comment.postReply.title && (
                  <p className="text-white text-sm font-medium">{comment.postReply.title}</p>
                )}
                <p className="text-text-secondary text-xs mt-1">Click to view full post</p>
              </div>
            )}

            {/* Nested Replies */}
            {hasReplies && (
              <>
                <button
                  onClick={() => toggleReplies(comment.id)}
                  className="mt-2 flex items-center space-x-1 text-text-secondary hover:text-white transition-colors text-xs"
                >
                  {repliesExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      <span>Hide {comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      <span>Show {comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}</span>
                    </>
                  )}
                </button>
                
                {repliesExpanded && comment.replies && (
                  <div className="mt-2">
                    {comment.replies.map(reply => renderComment(reply, true, depth + 1))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render modal via portal directly to document.body to ensure it's always on top
  // Use inline styles with !important to override any conflicting CSS
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={(e) => {
          // Only close if clicking directly on the backdrop
          if (e.target === e.currentTarget) {
            console.log('[CommentModal] Backdrop clicked, closing');
            onClose();
          }
        }}
        style={{ 
          zIndex: 999999,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          pointerEvents: 'auto',
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          margin: 0,
          padding: 0
        }}
      />

      {/* Slide-up modal - Higher z-index than bottom nav (z-[100]) and Me page tabs (z-[100]) */}
      <div 
        ref={modalRef}
        className="bg-neutral-900 rounded-t-2xl flex flex-col animate-slide-up"
        style={{ 
          zIndex: 999999,
          position: 'fixed',
          bottom: userState.isUnlocked ? `${64 + commentInputHeight}px` : '64px',
          left: 0,
          right: 0,
          width: '100%',
          maxHeight: userState.isUnlocked 
            ? `calc(100vh - ${64 + commentInputHeight}px)` 
            : 'calc(100vh - 64px)',
          pointerEvents: 'auto',
          display: 'flex',
          visibility: 'visible',
          opacity: 1,
          margin: 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-neutral-700 rounded-full" />
        </div>

        {/* Header - Centered title */}
        <div className="flex items-center justify-center px-6 py-4 border-b border-neutral-700 relative">
          <h2 className="text-xl font-bold text-white">Comments</h2>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ paddingBottom: '24px' }}>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-text-secondary">Loading comments...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-secondary">No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            comments.map((comment) => renderComment(comment))
          )}
        </div>

        {/* Comment Input - Thoughts-style sticky bar */}
        {!userState.isUnlocked ? (
          <div className="p-6 border-t border-neutral-700 text-center">
            <p className="text-text-secondary text-sm mb-4">Connect your pN to comment</p>
            <PNConnect compact />
          </div>
        ) : null}
      </div>

      {/* Comment Input Bar - Fixed at bottom, above bottom nav */}
      {userState.isUnlocked && (
        <div 
          className="bg-neutral-900 border-t border-neutral-800" 
          style={{ 
            bottom: '64px', 
            left: 0,
            right: 0,
            width: '100%',
            height: `${commentInputHeight}px`, 
            backgroundColor: 'rgb(23, 23, 23)', // Explicit bg-neutral-900 color to match modal
            zIndex: 1000000,
            position: 'fixed',
            pointerEvents: 'auto',
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            margin: 0,
            padding: 0
          }}
        >
          {/* Emoji Railway - Above text bar */}
          <div className="px-4 pt-2 pb-1">
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {['😀', '😂', '❤️', '😍', '🤔', '😮', '😢', '🔥', '👏', '💯', '👍', '👎', '🎉', '🙌', '😊', '😎', '🤗', '😴', '🤯', '🥳'].map((emoji, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setNewComment(prev => prev + emoji);
                  }}
                  className="text-xl hover:scale-110 transition-transform p-1 flex-shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          
          {/* Text Input Area */}
          <div className="flex items-end gap-2 px-4 pb-4">
            <textarea
              ref={inputRef}
              value={newComment}
              onChange={(e) => {
                setNewComment(e.target.value);
                // Auto-resize textarea
                if (inputRef.current) {
                  inputRef.current.style.height = 'auto';
                  const newHeight = Math.min(inputRef.current.scrollHeight, 200);
                  inputRef.current.style.height = `${newHeight}px`;
                  setCommentInputHeight(newHeight + 32 + 40); // Add padding + emoji railway height
                }
              }}
              placeholder="Add a comment..."
              className="flex-1 bg-neutral-800 text-white rounded-lg p-3 border border-neutral-700 focus:border-blue-500 focus:outline-none resize-none overflow-y-auto"
              style={{ 
                minHeight: '44px',
                maxHeight: '200px',
                lineHeight: '1.5'
              }}
              rows={1}
              maxLength={500}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (newComment.trim()) {
                    handleSubmit(e as any);
                  }
                }
              }}
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                handleSubmit(e as any);
              }}
              className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center mb-0.5"
              disabled={!newComment.trim()}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

