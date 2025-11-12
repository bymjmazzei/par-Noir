/**
 * Engagement Hook
 * Manages likes, comments, and shares for files
 * Uses backend API when user is authenticated, falls back to localStorage
 */

import { useState, useEffect, useCallback } from 'react';
import { IndexedFile } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

interface EngagementData {
  likes: Set<string>; // Set of file IDs that user has liked
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
  likes?: number;
}

const STORAGE_KEY = 'pn_engagement_data';

function loadEngagementData(): EngagementData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        likes: new Set(parsed.likes || []),
        comments: new Map(Object.entries(parsed.comments || {})),
        shares: new Map(Object.entries(parsed.shares || {}))
      };
    }
  } catch (e) {
    console.warn('Failed to load engagement data:', e);
  }
  return {
    likes: new Set(),
    comments: new Map(),
    shares: new Map()
  };
}

function saveEngagementData(data: EngagementData) {
  try {
    const serializable = {
      likes: Array.from(data.likes),
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

  // Save to localStorage whenever engagement changes (for offline/fallback)
  useEffect(() => {
    saveEngagementData(engagement);
  }, [engagement]);

  // Load engagement stats from backend when user is authenticated
  const loadEngagementStats = useCallback(async (fileId: string) => {
    if (!userState.isUnlocked || !userState.pnIdentifier) return;

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
  }, [userState.isUnlocked, userState.pnIdentifier, loadingStats]);

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
            if (result.liked) {
              newLikes.add(fileId);
            } else {
              newLikes.delete(fileId);
            }
            return { ...prev, likes: newLikes };
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
      if (newLikes.has(fileId)) {
        newLikes.delete(fileId);
      } else {
        newLikes.add(fileId);
      }
      return { ...prev, likes: newLikes };
    });
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const addComment = useCallback(async (fileId: string, content: string, authorId: string, authorName: string) => {
    if (userState.isUnlocked && userState.pnIdentifier) {
      // Use backend API
      try {
        const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userDid: userState.pnIdentifier,
            content,
            authorName
          })
        });

        if (response.ok) {
          const comment = await response.json();
          setEngagement(prev => {
            const newComments = new Map(prev.comments);
            const fileComments = newComments.get(fileId) || [];
            newComments.set(fileId, [...fileComments, comment]);
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
      likes: 0
    };

    setEngagement(prev => {
      const newComments = new Map(prev.comments);
      const fileComments = newComments.get(fileId) || [];
      newComments.set(fileId, [...fileComments, comment]);
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
    try {
      const response = await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/comments`);
      if (response.ok) {
        const result = await response.json();
        const comments = result.comments || [];
        setEngagement(prev => {
          const newComments = new Map(prev.comments);
          newComments.set(fileId, comments);
          return { ...prev, comments: newComments };
        });
        return comments;
      }
    } catch (error) {
      console.warn('Failed to load comments:', error);
    }
    return [];
  }, []);

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
    addComment,
    share,
    getLikeCount,
    isLiked,
    getComments,
    getShareCount,
    loadComments,
    loadLikeStatus,
    loadEngagementStats
  };
}

