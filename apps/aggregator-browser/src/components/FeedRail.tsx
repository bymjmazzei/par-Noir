/**
 * Feed Rail Component
 * Horizontal scrolling feed selector for TikTok-style navigation
 */

import React, { useRef, useEffect } from 'react';
import { Feed } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { Globe, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

export interface FeedRailItem {
  feedId: string;
  name: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  isNew?: boolean;
  badge?: string;
}

interface FeedRailProps {
  feeds: FeedRailItem[];
  activeFeedId: string;
  onFeedSelect: (feedId: string) => void;
}

export function FeedRail({ feeds, activeFeedId, onFeedSelect }: FeedRailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { userState } = useUserState();

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 300;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Auto-scroll to active feed on mount/change
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const activeElement = scrollContainerRef.current.querySelector(`[data-feed-id="${activeFeedId}"]`);
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeFeedId]);

  return (
    <div className="relative w-full">
      {/* Left scroll button */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-neutral-900 to-transparent flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-6 w-6 text-white" />
      </button>

      {/* Feed rail */}
      <div
        ref={scrollContainerRef}
        className="flex space-x-2 overflow-x-auto scrollbar-hide px-12 py-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {feeds.map((feed) => {
          const isActive = feed.feedId === activeFeedId;
          
          return (
            <button
              key={feed.feedId}
              data-feed-id={feed.feedId}
              onClick={() => onFeedSelect(feed.feedId)}
              className={`
                flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition-all
                ${isActive
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700 hover:text-white'
                }
              `}
            >
              {feed.icon || <Globe className="h-4 w-4" />}
              <span className="font-medium">{feed.name}</span>
              {feed.isNew && (
                <span className="px-2 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded-full">
                  NEW
                </span>
              )}
              {feed.badge && (
                <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                  {feed.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right scroll button */}
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-neutral-900 to-transparent flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-6 w-6 text-white" />
      </button>
    </div>
  );
}

/**
 * Build feed rail items from feeds and user state
 */
export function buildFeedRailItems(
  feeds: Feed[],
  subscribedFeedIds: string[],
  activeFeedId: string,
  hasNewThirdPartyContent: boolean = false
): FeedRailItem[] {
  const items: FeedRailItem[] = [
    {
      feedId: 'public',
      name: 'Public',
      icon: <Globe className="h-4 w-4" />,
      isActive: activeFeedId === 'public'
    }
  ];

  // Add subscribed feeds (only if user is unlocked)
  if (subscribedFeedIds.length > 0) {
    subscribedFeedIds.forEach(feedId => {
      const feed = feeds.find(f => f.feedId === feedId);
      if (feed) {
        items.push({
          feedId: feed.feedId,
          name: feed.feedName,
          isActive: activeFeedId === feed.feedId
        });
      }
    });
  }

  // Add "New" feed for third-party content (only if user is unlocked and has new content)
  if (hasNewThirdPartyContent) {
    items.push({
      feedId: 'new',
      name: 'New',
      icon: <Sparkles className="h-4 w-4" />,
      isActive: activeFeedId === 'new',
      isNew: true
    });
  }

  return items;
}

