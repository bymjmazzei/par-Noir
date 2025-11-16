/**
 * Feed Rail Component
 * Horizontal scrolling feed selector for TikTok-style navigation
 */

import React, { useRef, useEffect } from 'react';
import { Feed } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { Globe, Sparkles } from 'lucide-react';

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
  onBrowseFeeds?: () => void;
}

export function FeedRail({ feeds, activeFeedId, onFeedSelect, onBrowseFeeds }: FeedRailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const { userState } = useUserState();

  // Auto-scroll to center active feed on mount/change (TikTok style)
  useEffect(() => {
    if (!scrollContainerRef.current || !innerContainerRef.current) return;
    const activeElement = innerContainerRef.current.querySelector(`[data-feed-id="${activeFeedId}"]`) as HTMLElement;
    if (activeElement && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      
      // Calculate scroll position to center the element
      const elementLeft = activeElement.offsetLeft;
      const elementWidth = activeElement.offsetWidth;
      const containerWidth = container.clientWidth;
      
      // Center the element: scroll to position where element is centered
      const scrollLeft = elementLeft - (containerWidth / 2) + (elementWidth / 2);
      
      container.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: 'smooth'
      });
    }
  }, [activeFeedId]);

  return (
    <div 
      ref={scrollContainerRef}
      className="w-full overflow-x-auto scrollbar-hide pointer-events-auto" 
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div
        ref={innerContainerRef}
        className="flex items-center justify-center space-x-8 py-2"
        style={{ 
          minWidth: 'max-content',
          paddingLeft: '50%',
          paddingRight: '50%'
        }}
      >
        {feeds.map((feed) => {
          const isActive = feed.feedId === activeFeedId;
          
          return (
            <button
              key={feed.feedId}
              data-feed-id={feed.feedId}
              onClick={() => onFeedSelect(feed.feedId)}
              className="relative whitespace-nowrap text-white/85 hover:text-white transition-colors"
              style={{ opacity: isActive ? 1 : 0.85 }}
            >
              <span className="text-base font-medium uppercase tracking-wide">{feed.name}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
              )}
            </button>
          );
        })}
      </div>
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
  isUnlocked: boolean,
  hasNewThirdPartyContent: boolean = false
): FeedRailItem[] {
  // Always show DISCOVER, PUBLIC
  const items: FeedRailItem[] = [
    {
      feedId: 'discovery',
      name: 'DISCOVER',
      isActive: activeFeedId === 'discovery'
    },
    {
      feedId: 'public',
      name: 'PUBLIC',
      isActive: activeFeedId === 'public'
    }
  ];

  // Add CURATED feed right after PUBLIC if user is unlocked
  if (isUnlocked) {
    items.push({
      feedId: 'curated',
      name: 'CURATED',
      isActive: activeFeedId === 'curated'
    });
  }

  // Then add ARTS, SPORTS, MUSIC
  items.push(
    {
      feedId: 'arts',
      name: 'ARTS',
      isActive: activeFeedId === 'arts'
    },
    {
      feedId: 'sports',
      name: 'SPORTS',
      isActive: activeFeedId === 'sports'
    },
    {
      feedId: 'music',
      name: 'MUSIC',
      isActive: activeFeedId === 'music'
    }
  );

  // Add subscribed feeds (only if user is unlocked)
  if (isUnlocked && subscribedFeedIds.length > 0) {
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

  return items;
}

