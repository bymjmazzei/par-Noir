/**
 * Feed Rail Component
 * Horizontal scrolling feed selector for TikTok-style navigation
 */

import React, { useRef, useEffect } from 'react';
import { Feed } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { Globe, Sparkles, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

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

  // Auto-scroll to active feed on mount/change (TikTok style: ENTIRE BAR scrolls so active title is CENTERED)
  useEffect(() => {
    if (!scrollContainerRef.current || !activeFeedId) return;
    
    const scrollToActive = () => {
      const container = scrollContainerRef.current;
      if (!container) return;
      
      const activeElement = container.querySelector(`[data-feed-id="${activeFeedId}"]`) as HTMLElement;
      if (!activeElement) {
        console.warn('Could not find active feed element:', activeFeedId);
        return;
      }
      
      // Get the scrollable parent (the one with overflow-x-auto)
      const scrollableParent = container.parentElement;
      if (!scrollableParent) return;
      
      // Get positions - element position relative to the inner container
      const containerWidth = scrollableParent.clientWidth;
      const elementLeft = activeElement.offsetLeft;
      const elementWidth = activeElement.offsetWidth;
      
      // Calculate scroll position to CENTER the active element
      // With paddingLeft: 50%, the element's center should align with container center
      const elementCenter = elementLeft + (elementWidth / 2);
      const containerCenter = containerWidth / 2;
      const scrollLeft = elementCenter - containerCenter;
      
      // Get max scroll (content width - container width)
      const maxScroll = container.scrollWidth - containerWidth;
      
      console.log('SCROLLING BAR TO CENTER ACTIVE FEED:', {
        activeFeedId,
        elementLeft,
        elementWidth,
        containerWidth,
        scrollLeft,
        maxScroll,
        currentScroll: scrollableParent.scrollLeft,
        contentWidth: container.scrollWidth
      });
      
      // Scroll the ENTIRE BAR horizontally so active feed title is CENTERED
      // Clamp between 0 and maxScroll
      scrollableParent.scrollTo({ 
        left: Math.max(0, Math.min(maxScroll, scrollLeft)), 
        behavior: 'smooth' 
      });
    };
    
    // Delay to ensure DOM is updated after feed change
    const timeoutId = setTimeout(scrollToActive, 150);
    
    return () => clearTimeout(timeoutId);
  }, [activeFeedId, feeds]);

  return (
    <div 
      className="w-full h-full flex items-center overflow-x-auto scrollbar-hide bg-transparent" 
      style={{ 
        scrollBehavior: 'smooth',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        background: 'transparent'
      }}
    >
      {/* Feed rail - TikTok style: ENTIRE BAR scrolls horizontally, active feed title CENTERED */}
      {/* Add padding on left/right so we can always center any feed */}
      <div
        ref={scrollContainerRef}
        className="flex space-x-6 py-2 items-center bg-transparent"
        style={{ 
          whiteSpace: 'nowrap',
          minWidth: 'max-content',
          paddingLeft: '50%',
          paddingRight: '50%',
          background: 'transparent'
        }}
      >
        {feeds.map((feed) => {
          const isActive = feed.feedId === activeFeedId;
          
          return (
            <button
              key={feed.feedId}
              data-feed-id={feed.feedId}
              onClick={() => onFeedSelect(feed.feedId)}
              className={`
                whitespace-nowrap transition-all text-base font-semibold relative
                ${isActive
                  ? 'text-white/85'
                  : 'text-white/60 hover:text-white/75'
                }
              `}
            >
              <span>{feed.name}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/85 transition-opacity"></div>
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
  hasNewThirdPartyContent: boolean = false
): FeedRailItem[] {
  const items: FeedRailItem[] = [
    {
      feedId: 'discover',
      name: 'DISCOVER',
      isActive: activeFeedId === 'discover'
    },
    {
      feedId: 'public',
      name: 'PUBLIC',
      isActive: activeFeedId === 'public'
    }
  ];

  // Add popular niche feeds (ARTS, SPORTS, MUSIC) - always show these for swiping
  const nicheFeeds = [
    { feedId: 'arts', name: 'ARTS' },
    { feedId: 'sports', name: 'SPORTS' },
    { feedId: 'music', name: 'MUSIC' }
  ];
  
  nicheFeeds.forEach(niche => {
    // Check if there's a matching feed in the feeds array, or add as default
    const existingFeed = feeds.find(f => 
      f.feedId.toLowerCase() === niche.feedId || 
      f.feedName.toLowerCase() === niche.name.toLowerCase()
    );
    if (existingFeed) {
      items.push({
        feedId: existingFeed.feedId,
        name: existingFeed.feedName.toUpperCase(),
        isActive: activeFeedId === existingFeed.feedId
      });
    } else {
      // Add as placeholder feed (will be created/fetched when selected)
      items.push({
        feedId: niche.feedId,
        name: niche.name,
        isActive: activeFeedId === niche.feedId
      });
    }
  });

  // Add subscribed feeds (only if user is unlocked)
  if (subscribedFeedIds.length > 0) {
    subscribedFeedIds.forEach(feedId => {
      const feed = feeds.find(f => f.feedId === feedId);
      if (feed && !items.find(item => item.feedId === feed.feedId)) {
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

