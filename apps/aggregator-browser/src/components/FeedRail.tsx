/**
 * Feed Rail Component
 * Horizontal scrolling feed selector for TikTok-style navigation
 */

import React, { useRef, useEffect, useCallback } from 'react';
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
  

  // Calculate max scroll position based on last feed at midpoint
  const calculateMaxScroll = useCallback(() => {
    if (!scrollContainerRef.current || !innerContainerRef.current) return null;
    
    const container = scrollContainerRef.current;
    const containerWidth = container.clientWidth;
    const scrollWidth = container.scrollWidth;
    const screenWidth = window.innerWidth;
    const midpoint = screenWidth / 2;
    
    // Get the last feed element
    const allFeedElements = innerContainerRef.current.querySelectorAll('[data-feed-id]');
    const lastFeedElement = allFeedElements[allFeedElements.length - 1] as HTMLElement;
    
    if (!lastFeedElement) return null;
    
    const lastElementLeft = lastFeedElement.offsetLeft;
    const lastElementWidth = lastFeedElement.offsetWidth;
    // Calculate scroll position to center last element at screen midpoint
    const lastElementScrollLeft = lastElementLeft - midpoint + (lastElementWidth / 2);
    
    // Return the maximum allowed scroll (don't allow scrolling beyond midpoint for last feed)
    return Math.min(scrollWidth - containerWidth, lastElementScrollLeft);
  }, []);

  // Enforce scroll limit on manual scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const maxScroll = calculateMaxScroll();
      if (maxScroll !== null && container.scrollLeft > maxScroll) {
        container.scrollTo({
          left: maxScroll,
          behavior: 'auto' // Instant correction
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [calculateMaxScroll]);

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
      
      // Use screen width for midpoint calculation, not container width
      const screenWidth = window.innerWidth;
      const midpoint = screenWidth / 2;
      
      // Center the element: scroll to position where element is centered at the screen midpoint
      const scrollLeft = elementLeft - midpoint + (elementWidth / 2);
      
      // Get max scroll limit
      const maxScroll = calculateMaxScroll();
      
      // Clamp scroll position between 0 and maxScroll
      const clampedScrollLeft = Math.max(0, Math.min(scrollLeft, maxScroll ?? scrollLeft));
      
      container.scrollTo({
        left: clampedScrollLeft,
        behavior: 'smooth'
      });
    }
  }, [activeFeedId, calculateMaxScroll]);

  return (
    <div 
      ref={scrollContainerRef}
      className="w-full overflow-x-auto scrollbar-hide pointer-events-auto" 
      style={{ 
        scrollbarWidth: 'none', 
        msOverflowStyle: 'none'
      }}
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
          const isPublicFeed = feed.feedId === 'public';
          
          return (
            <button
              key={feed.feedId}
              data-feed-id={feed.feedId}
              onClick={() => onFeedSelect(feed.feedId)}
              className="relative whitespace-nowrap text-white/85 hover:text-white transition-colors flex items-center justify-center"
              style={{ opacity: isActive ? 1 : 0.85 }}
            >
              {isPublicFeed ? (
                // White pN icon for public feed
                <img 
                  src="/branding/Par-Noir-Logo-White.png" 
                  alt="pN" 
                  className="w-5 h-5 object-contain"
                />
              ) : (
                <span className="text-base font-medium uppercase tracking-wide">{feed.name}</span>
              )}
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

