/**
 * Feed Navigation Hook
 * Manages feed hierarchy and navigation logic based on user state
 */

import { useMemo, useCallback } from 'react';
import { Feed } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';

export interface FeedNavigationItem {
  feedId: string;
  name: string;
  type: 'curated' | 'public' | 'subscribed' | 'discovery' | 'niche';
  index: number;
}

export function useFeedNavigation(
  feeds: Feed[],
  subscribedFeedIds: string[]
): {
  feedHierarchy: FeedNavigationItem[];
  getNextFeed: (currentFeedId: string) => string | null;
  getPreviousFeed: (currentFeedId: string) => string | null;
  getFeedIndex: (feedId: string) => number;
} {
  const { userState } = useUserState();

  // Build feed hierarchy based on user state
  const feedHierarchy = useMemo(() => {
    const hierarchy: FeedNavigationItem[] = [];

    if (userState.isUnlocked) {
      // Unlocked users: Curated → Public → Subscribed → Discovery
      
      // 1. Curated Feed (default for unlocked users)
      hierarchy.push({
        feedId: 'curated',
        name: 'Curated',
        type: 'curated',
        index: 0
      });

      // 2. Public Index
      hierarchy.push({
        feedId: 'public',
        name: 'Public',
        type: 'public',
        index: 1
      });

      // 3. Subscribed Feeds
      subscribedFeedIds.forEach((feedId, idx) => {
        const feed = feeds.find(f => f.feedId === feedId);
        if (feed) {
          hierarchy.push({
            feedId: feed.feedId,
            name: feed.feedName,
            type: 'subscribed',
            index: 2 + idx
          });
        }
      });

      // 4. Discovery Page
      hierarchy.push({
        feedId: 'discovery',
        name: 'Discovery',
        type: 'discovery',
        index: hierarchy.length
      });
    } else {
      // Locked users: Public Index → 20 Niche Feeds
      
      // 1. Public Index (default for locked users)
      hierarchy.push({
        feedId: 'public',
        name: 'Public',
        type: 'public',
        index: 0
      });

      // 2. Niche Feeds (up to 20)
      const nicheFeeds = feeds
        .filter(feed => feed.feedCategory && feed.feedCategory !== 'adults-only')
        .slice(0, 20);
      
      nicheFeeds.forEach((feed, idx) => {
        hierarchy.push({
          feedId: feed.feedId,
          name: feed.feedName,
          type: 'niche',
          index: 1 + idx
        });
      });
    }

    return hierarchy;
  }, [userState.isUnlocked, feeds, subscribedFeedIds]);

  const getNextFeed = useCallback((currentFeedId: string): string | null => {
    const currentIndex = feedHierarchy.findIndex(item => item.feedId === currentFeedId);
    if (currentIndex === -1 || currentIndex === feedHierarchy.length - 1) {
      return null; // Already at last feed
    }
    return feedHierarchy[currentIndex + 1].feedId;
  }, [feedHierarchy]);

  const getPreviousFeed = useCallback((currentFeedId: string): string | null => {
    const currentIndex = feedHierarchy.findIndex(item => item.feedId === currentFeedId);
    if (currentIndex <= 0) {
      return null; // Already at first feed
    }
    return feedHierarchy[currentIndex - 1].feedId;
  }, [feedHierarchy]);

  const getFeedIndex = useCallback((feedId: string): number => {
    const item = feedHierarchy.find(item => item.feedId === feedId);
    return item ? item.index : -1;
  }, [feedHierarchy]);

  return {
    feedHierarchy,
    getNextFeed,
    getPreviousFeed,
    getFeedIndex
  };
}

