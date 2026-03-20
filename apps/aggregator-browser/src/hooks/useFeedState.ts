/**
 * Hook for feed-related UI state: view mode, active feed, tab, etc.
 */

import { useState } from 'react';
import type { Feed } from '../types/aggregator';
import { loadFeedViewedTimestamps } from '../utils/feedUtils';

export function useFeedState() {
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('feed');
  const [activeFeedId, setActiveFeedId] = useState<string>('public');
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const defaultTab: 'home' | 'search' | 'upload' | 'index' | 'messages' =
    import.meta.env.VITE_DEFAULT_VIEW === 'messaging' ? 'messages' : 'home';
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'search' | 'upload' | 'index' | 'messages'>(defaultTab);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [visibleFileId, setVisibleFileId] = useState<string | null>(null);
  const [feedViewedTimestamps, setFeedViewedTimestamps] = useState<Map<string, string>>(() =>
    loadFeedViewedTimestamps()
  );

  return {
    viewMode,
    setViewMode,
    activeFeedId,
    setActiveFeedId,
    currentFeedIndex,
    setCurrentFeedIndex,
    activeBottomTab,
    setActiveBottomTab,
    feeds,
    setFeeds,
    visibleFileId,
    setVisibleFileId,
    feedViewedTimestamps,
    setFeedViewedTimestamps,
  };
}
