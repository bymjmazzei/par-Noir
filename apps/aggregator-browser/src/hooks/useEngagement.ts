/**
 * Engagement Hook
 * Manages likes, comments, and shares for files
 */

import { useState, useEffect, useCallback } from 'react';
import { IndexedFile } from '../types/aggregator';

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
  const [engagement, setEngagement] = useState<EngagementData>(loadEngagementData);

  // Save to localStorage whenever engagement changes
  useEffect(() => {
    saveEngagementData(engagement);
  }, [engagement]);

  const toggleLike = useCallback((fileId: string) => {
    setEngagement(prev => {
      const newLikes = new Set(prev.likes);
      if (newLikes.has(fileId)) {
        newLikes.delete(fileId);
      } else {
        newLikes.add(fileId);
      }
      return { ...prev, likes: newLikes };
    });
  }, []);

  const addComment = useCallback((fileId: string, content: string, authorId: string, authorName: string) => {
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
  }, []);

  const share = useCallback((fileId: string) => {
    setEngagement(prev => {
      const newShares = new Map(prev.shares);
      const currentCount = newShares.get(fileId) || 0;
      newShares.set(fileId, currentCount + 1);
      return { ...prev, shares: newShares };
    });
  }, []);

  const getLikeCount = useCallback((fileId: string, baseCount: number = 0): number => {
    return baseCount + (engagement.likes.has(fileId) ? 1 : 0);
  }, [engagement.likes]);

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
    getShareCount
  };
}

