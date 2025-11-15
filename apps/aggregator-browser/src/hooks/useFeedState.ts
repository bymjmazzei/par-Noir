/**
 * Feed State Hook
 * Manages feed-related state
 */

import { useState } from 'react';
import { Feed } from '../types/aggregator';
import { loadFeedViewedTimestamps } from '../utils/feedUtils';

export function useFeedState() {
  const [activeFeedId, setActiveFeedId] = useState<string>('public');
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [feedViewedTimestamps, setFeedViewedTimestamps] = useState<Map<string, string>>(
    () => loadFeedViewedTimestamps()
  );
  const [hasMore, setHasMore] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  return {
    activeFeedId,
    setActiveFeedId,
    feeds,
    setFeeds,
    feedViewedTimestamps,
    setFeedViewedTimestamps,
    hasMore,
    setHasMore,
    isRefreshing,
    setIsRefreshing
  };
}

