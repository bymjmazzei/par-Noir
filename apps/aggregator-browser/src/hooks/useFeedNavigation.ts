/**
 * Feed Navigation Hook
 * Manages feed hierarchy and navigation logic based on user state
 */

import { useMemo, useCallback } from 'react';
import { Feed } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES } from '../constants/feedCategories';

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

      // 3. Subscribed Niche Category Feeds (virtual feeds based on categories)
      if (subscribedFeedIds.length > 0) {
        // Get unique categories from subscribed feeds
        const subscribedCategories = new Set<string>();
        subscribedFeedIds.forEach(feedId => {
          const feed = feeds.find(f => f.feedId === feedId);
          if (feed?.feedCategory) {
            subscribedCategories.add(feed.feedCategory);
          }
        });
        
        // Add niche category feeds to hierarchy (sorted by category name for consistency)
        Array.from(subscribedCategories)
          .sort((a, b) => {
            const catA = FEED_CATEGORIES[a as keyof typeof FEED_CATEGORIES];
            const catB = FEED_CATEGORIES[b as keyof typeof FEED_CATEGORIES];
            return (catA?.name || a).localeCompare(catB?.name || b);
          })
          .forEach((categoryId, idx) => {
            const categoryInfo = FEED_CATEGORIES[categoryId as keyof typeof FEED_CATEGORIES];
            if (categoryInfo) {
              hierarchy.push({
                feedId: `niche-${categoryId}`,
                name: categoryInfo.name,
                type: 'niche',
                index: 2 + idx
              });
            }
          });
      }

      // 4. Individual Subscribed Feeds (feeds without categories or additional feeds)
      subscribedFeedIds.forEach((feedId, idx) => {
        const feed = feeds.find(f => f.feedId === feedId);
        // Only add if feed doesn't have a category (or category already shown above)
        if (feed && !feed.feedCategory) {
          hierarchy.push({
            feedId: feed.feedId,
            name: feed.feedName,
            type: 'subscribed',
            index: hierarchy.length
          });
        }
      });

      // 5. Discovery Page
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

