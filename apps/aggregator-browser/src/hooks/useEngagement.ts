/**
 * Engagement Hook
 * Manages likes, comments, and shares for files
 * Uses backend API when user is authenticated, falls back to localStorage
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

interface EngagementData {
  likes: Set<string>; // Set of file IDs that user has liked
  dislikes?: Set<string>; // Set of file IDs that user has disliked
  comments: Map<string, Comment[]>; // Map of file ID to comments
  shares: Map<string, number>; // Map of file ID to share count
}

interface Comment {
  id: string;
  fileId: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  likes: string[]; // Array of user IDs who liked
  parentCommentId?: string; // For threaded replies
  replies?: Comment[];
  postReply?: {
    fileId: string;
    thumbnail?: string;
    title?: string;
  };
}

const STORAGE_KEY = 'pn_engagement_data';

function loadEngagementData(): EngagementData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        likes: new Set(parsed.likes || []),
        dislikes: new Set(parsed.dislikes || []),
        comments: new Map(Object.entries(parsed.comments || {})),
        shares: new Map(Object.entries(parsed.shares || {}))
      };
    }
  } catch (e) {
    console.warn('Failed to load engagement data:', e);
  }
  return {
    likes: new Set(),
    dislikes: new Set(),
    comments: new Map(),
    shares: new Map()
  };
}

function saveEngagementData(data: EngagementData) {
  try {
    const serializable = {
      likes: Array.from(data.likes),
      dislikes: Array.from(data.dislikes || []),
      comments: Object.fromEntries(data.comments),
      shares: Object.fromEntries(data.shares)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.warn('Failed to save engagement data:', e);
  }
}

export function useEngagement() {
  const { userState } = useUserState();
  const [engagement, setEngagement] = useState<EngagementData>(loadEngagementData);
  const [loadingStats, setLoadingStats] = useState<Set<string>>(new Set());
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set());
  const commentErrorRef = useRef<Map<string, { timestamp: number; count: number }>>(new Map());
  const lastCommentFetchRef = useRef<Map<string, number>>(new Map());

  // Save to localStorage whenever engagement changes (for offline/fallback)
  useEffect(() => {
    saveEngagementData(engagement);
  }, [engagement]);

  // Load engagement stats from backend when user is authenticated
  const loadEngagementStats = useCallback(async (fileId: string) => {
    if (loadingStats.has(fileId)) return;
    setLoadingStats(prev => new Set(prev).add(fileId));

    try {
      const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/stats`);
      if (response.ok) {
        const stats = await response.json();
        // Update engagement state with backend stats
        setEngagement(prev => {
          const newShares = new Map(prev.shares);
          newShares.set(fileId, stats.shares || 0);
          return { ...prev, shares: newShares };
        });
      }
    } catch (error) {
      console.warn('Failed to load engagement stats:', error);
    } finally {
      setLoadingStats(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  }, [loadingStats]);

  // Load bulk engagement stats for multiple files
  const loadBulkEngagementStats = useCallback(async (fileIds: string[]) => {
    if (fileIds.length === 0) return;

    // Mark files as loading
    setLoadingStats(prev => {
      const next = new Set(prev);
      fileIds.forEach(id => next.add(id));
      return next;
    });

    try {
      const response = await fetch(`${API_ENDPOINT}/api/engagement/bulk-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds,
          userDid: userState.isUnlocked ? userState.pnIdentifier : undefined
        })
      });

      if (response.status === 429) {
        // Rate limited - don't retry immediately, just log and return
        console.warn('Rate limited (429) when loading bulk engagement stats, skipping');
        return;
      }

      if (response.ok) {
        const result = await response.json();
        const { stats, likedFiles } = result;

        // Update engagement state with backend stats
        setEngagement(prev => {
          const newLikes = new Set(prev.likes);
          const newShares = new Map(prev.shares);

          // Update liked files
          if (likedFiles && Array.isArray(likedFiles)) {
            likedFiles.forEach((fileId: string) => {
              newLikes.add(fileId);
            });
          }

          // Update share counts
          Object.entries(stats || {}).forEach(([fileId, fileStats]: [string, any]) => {
            if (fileStats && typeof fileStats.shares === 'number') {
              newShares.set(fileId, fileStats.shares);
            }
          });

          return { ...prev, likes: newLikes, shares: newShares };
        });
      }
    } catch (error) {
      console.warn('Failed to load bulk engagement stats:', error);
    } finally {
      // Remove loading state
      setLoadingStats(prev => {
        const next = new Set(prev);
        fileIds.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const toggleLike = useCallback(async (fileId: string) => {
    if (userState.isUnlocked && userState.pnIdentifier) {
      // Use backend API
      try {
        const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userDid: userState.pnIdentifier })
        });

        if (response.ok) {
          const result = await response.json();
          setEngagement(prev => {
            const newLikes = new Set(prev.likes);
            const newDislikes = new Set(prev.dislikes || []);
            if (result.liked) {
              newLikes.add(fileId);
              newDislikes.delete(fileId); // Remove dislike if exists
            } else {
              newLikes.delete(fileId);
            }
            return { ...prev, likes: newLikes, dislikes: newDislikes };
          });
          return;
        }
      } catch (error) {
        console.error('Failed to toggle like:', error);
      }
    }

    // Fallback to localStorage
    setEngagement(prev => {
      const newLikes = new Set(prev.likes);
      const newDislikes = new Set(prev.dislikes || []);
      if (newLikes.has(fileId)) {
        newLikes.delete(fileId);
      } else {
        newLikes.add(fileId);
        newDislikes.delete(fileId); // Remove dislike if exists
      }
      return { ...prev, likes: newLikes, dislikes: newDislikes };
    });
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const toggleDislike = useCallback(async (fileId: string) => {
    if (userState.isUnlocked && userState.pnIdentifier) {
      // Use backend API
      try {
        const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/dislike`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userDid: userState.pnIdentifier })
        });

        if (response.ok) {
          const result = await response.json();
          setEngagement(prev => {
            const newDislikes = new Set(prev.dislikes || []);
            const newLikes = new Set(prev.likes);
            // Remove from likes if it was liked
            newLikes.delete(fileId);
            
            if (result.disliked) {
              newDislikes.add(fileId);
            } else {
              newDislikes.delete(fileId);
            }
            return { ...prev, likes: newLikes, dislikes: newDislikes };
          });
          return;
        }
      } catch (error) {
        console.error('Failed to toggle dislike:', error);
      }
    }

    // Fallback to localStorage
    setEngagement(prev => {
      const newDislikes = new Set(prev.dislikes || []);
      const newLikes = new Set(prev.likes);
      // Remove from likes if it was liked
      newLikes.delete(fileId);
      
      if (newDislikes.has(fileId)) {
        newDislikes.delete(fileId);
      } else {
        newDislikes.add(fileId);
      }
      return { ...prev, likes: newLikes, dislikes: newDislikes };
    });
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const isDisliked = useCallback((fileId: string): boolean => {
    return engagement.dislikes?.has(fileId) || false;
  }, [engagement.dislikes]);

  const addComment = useCallback(async (
    fileId: string, 
    content: string, 
    authorId: string, 
    authorName: string,
    parentCommentId?: string,
    postReply?: { fileId: string; thumbnail?: string; title?: string }
  ) => {
    if (userState.isUnlocked && userState.pnIdentifier) {
      // Use backend API
      try {
        const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userDid: userState.pnIdentifier,
            content,
            authorName,
            parentCommentId,
            postReply
          })
        });

        if (response.ok) {
          const comment = await response.json();
          setEngagement(prev => {
            const newComments = new Map(prev.comments);
            const fileComments = newComments.get(fileId) || [];
            
            if (parentCommentId) {
              // Add as reply to parent comment
              const updatedComments = fileComments.map(c => {
                if (c.id === parentCommentId) {
                  return {
                    ...c,
                    replies: [...(c.replies || []), comment]
                  };
                }
                // Also check nested replies
                if (c.replies) {
                  const updateNestedReplies = (replies: Comment[]): Comment[] => {
                    return replies.map(r => {
                      if (r.id === parentCommentId) {
                        return {
                          ...r,
                          replies: [...(r.replies || []), comment]
                        };
                      }
                      if (r.replies) {
                        return {
                          ...r,
                          replies: updateNestedReplies(r.replies)
                        };
                      }
                      return r;
                    });
                  };
                  return {
                    ...c,
                    replies: updateNestedReplies(c.replies)
                  };
                }
                return c;
              });
              newComments.set(fileId, updatedComments);
            } else {
              newComments.set(fileId, [...fileComments, comment]);
            }
            
            return { ...prev, comments: newComments };
          });
          return;
        }
      } catch (error) {
        console.error('Failed to add comment:', error);
      }
    }

    // Fallback to localStorage
    const comment: Comment = {
      id: `comment-${Date.now()}-${Math.random()}`,
      fileId,
      authorId,
      authorName,
      content,
      timestamp: new Date().toISOString(),
      likes: [],
      parentCommentId,
      postReply
    };

    setEngagement(prev => {
      const newComments = new Map(prev.comments);
      const fileComments = newComments.get(fileId) || [];
      
      if (parentCommentId) {
        // Add as reply to parent comment
        const updatedComments = fileComments.map(c => {
          if (c.id === parentCommentId) {
            return {
              ...c,
              replies: [...(c.replies || []), comment]
            };
          }
          // Also check nested replies
          if (c.replies) {
            const updateNestedReplies = (replies: Comment[]): Comment[] => {
              return replies.map(r => {
                if (r.id === parentCommentId) {
                  return {
                    ...r,
                    replies: [...(r.replies || []), comment]
                  };
                }
                if (r.replies) {
                  return {
                    ...r,
                    replies: updateNestedReplies(r.replies)
                  };
                }
                return r;
              });
            };
            return {
              ...c,
              replies: updateNestedReplies(c.replies)
            };
          }
          return c;
        });
        newComments.set(fileId, updatedComments);
      } else {
        newComments.set(fileId, [...fileComments, comment]);
      }
      
      return { ...prev, comments: newComments };
    });
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const likeComment = useCallback(async (fileId: string, commentId: string, userId: string) => {
    if (userState.isUnlocked && userState.pnIdentifier) {
      // Use backend API
      try {
        const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/comment/${commentId}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userDid: userState.pnIdentifier })
        });

        if (response.ok) {
          const result = await response.json();
          setEngagement(prev => {
            const newComments = new Map(prev.comments);
            const fileComments = newComments.get(fileId) || [];
            
            const updateCommentLikes = (comments: Comment[]): Comment[] => {
              return comments.map(c => {
                if (c.id === commentId) {
                  const likes = c.likes || [];
                  const hasLiked = likes.includes(userId);
                  return {
                    ...c,
                    likes: hasLiked 
                      ? likes.filter(id => id !== userId)
                      : [...likes, userId]
                  };
                }
                if (c.replies) {
                  return {
                    ...c,
                    replies: updateCommentLikes(c.replies)
                  };
                }
                return c;
              });
            };
            
            newComments.set(fileId, updateCommentLikes(fileComments));
            return { ...prev, comments: newComments };
          });
          return;
        }
      } catch (error) {
        console.error('Failed to like comment:', error);
      }
    }

    // Fallback to localStorage
    setEngagement(prev => {
      const newComments = new Map(prev.comments);
      const fileComments = newComments.get(fileId) || [];
      
      const updateCommentLikes = (comments: Comment[]): Comment[] => {
        return comments.map(c => {
          if (c.id === commentId) {
            const likes = c.likes || [];
            const hasLiked = likes.includes(userId);
            return {
              ...c,
              likes: hasLiked 
                ? likes.filter(id => id !== userId)
                : [...likes, userId]
            };
          }
          if (c.replies) {
            return {
              ...c,
              replies: updateCommentLikes(c.replies)
            };
          }
          return c;
        });
      };
      
      newComments.set(fileId, updateCommentLikes(fileComments));
      return { ...prev, comments: newComments };
    });
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const share = useCallback(async (fileId: string) => {
    if (userState.isUnlocked && userState.pnIdentifier) {
      // Use backend API
      try {
        const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userDid: userState.pnIdentifier })
        });

        if (response.ok) {
          const result = await response.json();
          setEngagement(prev => {
            const newShares = new Map(prev.shares);
            newShares.set(fileId, result.count || 0);
            return { ...prev, shares: newShares };
          });
          return;
        }
      } catch (error) {
        console.error('Failed to record share:', error);
      }
    }

    // Fallback to localStorage
    setEngagement(prev => {
      const newShares = new Map(prev.shares);
      const currentCount = newShares.get(fileId) || 0;
      newShares.set(fileId, currentCount + 1);
      return { ...prev, shares: newShares };
    });
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const getLikeCount = useCallback((fileId: string, baseCount: number = 0): number => {
    return baseCount + (engagement.likes.has(fileId) ? 1 : 0);
  }, [engagement.likes]);

  // Load like status from backend (call when needed)
  const loadLikeStatus = useCallback(async (fileId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

    try {
      const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/like?userDid=${userState.pnIdentifier}`);
      if (response.ok) {
        const result = await response.json();
        setEngagement(prev => {
          const newLikes = new Set(prev.likes);
          if (result.liked) {
            newLikes.add(fileId);
          } else {
            newLikes.delete(fileId);
          }
          return { ...prev, likes: newLikes };
        });
      }
    } catch (error) {
      console.warn('Failed to load like status:', error);
    }
  }, [userState.isUnlocked, userState.pnIdentifier]);

  // Load comments from backend (call when needed)
  const loadComments = useCallback(async (fileId: string) => {
    // Prevent multiple simultaneous calls for the same file
    if (loadingComments.has(fileId)) {
      // Return cached comments if available
      return engagement.comments.get(fileId) || [];
    }

    // Throttling: prevent refetching too quickly after a successful fetch
    const lastFetch = lastCommentFetchRef.current.get(fileId);
    if (lastFetch && Date.now() - lastFetch < 2000) { // 2 seconds throttle
      return engagement.comments.get(fileId) || [];
    }

    // If we've had recent errors, don't retry immediately (exponential backoff)
    const errorInfo = commentErrorRef.current.get(fileId);
    if (errorInfo) {
      const timeSinceError = Date.now() - errorInfo.timestamp;
      const backoffDelay = Math.min(5000 * Math.pow(2, errorInfo.count), 60000); // Max 1 minute
      if (timeSinceError < backoffDelay) {
        // Return cached comments if available, otherwise empty array
        return engagement.comments.get(fileId) || [];
      }
    }

    setLoadingComments(prev => new Set(prev).add(fileId));

    try {
      const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/comments`);
      
      if (response.status === 429) {
        // Rate limited - track error and return cached comments
        const errorInfo = commentErrorRef.current.get(fileId);
        if (errorInfo) {
          errorInfo.count++;
          errorInfo.timestamp = Date.now();
        } else {
          commentErrorRef.current.set(fileId, { timestamp: Date.now(), count: 1 });
        }
        console.warn(`Rate limited loading comments for ${fileId}, using cached data`);
        return engagement.comments.get(fileId) || [];
      }

      if (response.ok) {
        const result = await response.json();
        const comments = result.comments || [];
        
        // Normalize comments to ensure likes is always an array
        const normalizeComment = (comment: any): Comment => {
          const normalized: Comment = {
            id: comment.id,
            fileId: comment.fileId,
            authorId: comment.authorId,
            authorName: comment.authorName,
            content: comment.content,
            timestamp: comment.timestamp,
            likes: Array.isArray(comment.likes) 
              ? comment.likes 
              : (typeof comment.likes === 'number' ? [] : []), // Convert old number format to empty array
            parentCommentId: comment.parentCommentId,
            postReply: comment.postReply,
            replies: comment.replies ? comment.replies.map(normalizeComment) : undefined
          };
          return normalized;
        };
        
        const normalizedComments = comments.map(normalizeComment);
        
        setEngagement(prev => {
          const newComments = new Map(prev.comments);
          newComments.set(fileId, normalizedComments);
          return { ...prev, comments: newComments };
        });
        
        // Clear error ref on success
        commentErrorRef.current.delete(fileId);
        lastCommentFetchRef.current.set(fileId, Date.now());
        
        return normalizedComments;
      } else {
        // Other error status - track but don't backoff as aggressively
        console.warn(`Failed to load comments for ${fileId}: ${response.status}`);
        return engagement.comments.get(fileId) || [];
      }
    } catch (error) {
      console.warn('Failed to load comments:', error);
      // Return cached comments if available
      return engagement.comments.get(fileId) || [];
    } finally {
      setLoadingComments(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  }, [loadingComments, engagement.comments]);

  const isLiked = useCallback((fileId: string): boolean => {
    return engagement.likes.has(fileId);
  }, [engagement.likes]);

  const getComments = useCallback((fileId: string): Comment[] => {
    return engagement.comments.get(fileId) || [];
  }, [engagement.comments]);

  const getShareCount = useCallback((fileId: string, baseCount: number = 0): number => {
    return baseCount + (engagement.shares.get(fileId) || 0);
  }, [engagement.shares]);

  return {
    toggleLike,
    toggleDislike,
    addComment,
    share,
    getLikeCount,
    isLiked,
    isDisliked,
    getComments,
    getShareCount,
    loadComments,
    loadLikeStatus,
    loadEngagementStats,
    loadBulkEngagementStats,
    likeComment // Add this export
  };
}

