/**
 * Feed Rail Component
 * Horizontal scrolling feed selector for TikTok-style navigation
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Feed } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { FEED_CATEGORIES } from '../constants/feedCategories';
import { CuratedFeedDropdown } from './CuratedFeedDropdown';

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

export function FeedRail({ 
  feeds, 
  activeFeedId, 
  onFeedSelect, 
  onBrowseFeeds
}: FeedRailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pNButtonRef = useRef<HTMLButtonElement>(null);
  const { userState } = useUserState();
  const [showDropdown, setShowDropdown] = useState(false);
  const isPublicFeedActive = activeFeedId === 'public';
  
  // Debug: Log feeds to see what's being passed
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[FeedRail] Feeds received:', feeds.map(f => ({ feedId: f.feedId, name: f.name })));
    }
  }, [feeds]);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        innerContainerRef.current &&
        !innerContainerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

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

  // Calculate dropdown position when pN is active
  const getDropdownPosition = useCallback(() => {
    if (!isPublicFeedActive || !userState.isUnlocked || !pNButtonRef.current || !scrollContainerRef.current) {
      return null;
    }
    const buttonRect = pNButtonRef.current.getBoundingClientRect();
    const containerRect = scrollContainerRef.current.getBoundingClientRect();
    return {
      left: buttonRect.left - containerRect.left + (buttonRect.width / 2),
      top: containerRect.height + 4
    };
  }, [isPublicFeedActive, userState.isUnlocked]);
  
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; top: number } | null>(null);
  
  useEffect(() => {
    if (isPublicFeedActive && userState.isUnlocked) {
      const updatePosition = () => {
        const pos = getDropdownPosition();
        setDropdownPosition(pos);
      };
      updatePosition();
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', updatePosition, { passive: true });
      }
      window.addEventListener('resize', updatePosition);
      const timeoutId = setTimeout(updatePosition, 100); // Delay to ensure button is rendered
      return () => {
        if (scrollContainer) {
          scrollContainer.removeEventListener('scroll', updatePosition);
        }
        window.removeEventListener('resize', updatePosition);
        clearTimeout(timeoutId);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [isPublicFeedActive, userState.isUnlocked, activeFeedId, feeds.length, getDropdownPosition]);

  return (
    <div className="relative">
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
              <div key={feed.feedId} className="relative">
                <button
                  ref={isPublicFeed ? pNButtonRef : undefined}
                  data-feed-id={feed.feedId}
                  onClick={() => onFeedSelect(feed.feedId)}
                  className="relative whitespace-nowrap text-white/85 hover:text-white transition-colors flex items-center justify-center"
                  style={{ opacity: isActive ? 1 : 0.85 }}
                >
                  {isPublicFeed ? (
                    // pN text for public feed (lowercase p with line, uppercase N)
                    <svg 
                      width="24" 
                      height="20" 
                      viewBox="0 0 24 20" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-white"
                    >
                      <text 
                        x="0" 
                        y="15" 
                        fontSize="16" 
                        fontFamily="system-ui, -apple-system, sans-serif" 
                        fontWeight="500"
                        fill="currentColor"
                        letterSpacing="0.05em"
                      >
                        pN
                      </text>
                      <line 
                        x1="2" 
                        y1="4" 
                        x2="8" 
                        y2="4" 
                        stroke="currentColor" 
                        strokeWidth="1.5" 
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <span className="text-base font-medium uppercase tracking-wide">{feed.name}</span>
                  )}
                  {isActive && !isPublicFeed && (
                    <span className="absolute left-0 right-0 h-0.5 bg-white" style={{ bottom: '-2px' }} />
                  )}
                  {isPublicFeed && isActive && (
                    <span className="absolute left-0 right-0 h-0.5 bg-white" style={{ bottom: '-2px' }} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {/* Dropdown arrow and menu for pN feed - positioned absolutely below railway, always visible when pN is active */}
      {isPublicFeedActive && userState.isUnlocked && dropdownPosition && (
        <div
          className="absolute pointer-events-auto"
          style={{
            left: `${dropdownPosition.left}px`,
            top: `${dropdownPosition.top}px`,
            transform: 'translateX(-50%)',
            zIndex: 200
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(!showDropdown);
            }}
            className="p-0.5 flex items-center justify-center text-white/60 hover:text-white/85 transition-colors"
            title="Feed options"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showDropdown && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-[200]"
            >
              <CuratedFeedDropdown onClose={() => setShowDropdown(false)} />
            </div>
          )}
        </div>
      )}
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

  // Add Media, Thoughts, and Collections feeds after PUBLIC
  items.push(
    {
      feedId: 'media',
      name: 'MEDIA',
      isActive: activeFeedId === 'media'
    },
    {
      feedId: 'thoughts',
      name: 'THOUGHTS',
      isActive: activeFeedId === 'thoughts'
    },
    {
      feedId: 'collections',
      name: 'COLLECTIONS',
      isActive: activeFeedId === 'collections'
    }
  );


  // Add subscribed niche category feeds (virtual feeds based on categories)
  // Only show categories where user has subscribed to at least one feed
  if (isUnlocked && subscribedFeedIds.length > 0) {
    // Get unique categories from subscribed feeds
    const subscribedCategories = new Set<string>();
    subscribedFeedIds.forEach(feedId => {
      const feed = feeds.find(f => f.feedId === feedId);
      if (feed?.feedCategory) {
        subscribedCategories.add(feed.feedCategory);
      }
    });
    
    // Add niche category feeds to rail (sorted by category name for consistency)
    Array.from(subscribedCategories)
      .sort((a, b) => {
        const catA = FEED_CATEGORIES[a as keyof typeof FEED_CATEGORIES];
        const catB = FEED_CATEGORIES[b as keyof typeof FEED_CATEGORIES];
        return (catA?.name || a).localeCompare(catB?.name || b);
      })
      .forEach(categoryId => {
        const categoryInfo = FEED_CATEGORIES[categoryId as keyof typeof FEED_CATEGORIES];
        if (categoryInfo) {
          items.push({
            feedId: `niche-${categoryId}`, // Use "niche-" prefix to identify category feeds
            name: categoryInfo.name.toUpperCase(),
            isActive: activeFeedId === `niche-${categoryId}`
          });
        }
      });
  }

  // Add individual subscribed feeds (only if user is unlocked)
  // These are feeds that don't belong to a category or are additional feeds
  if (isUnlocked && subscribedFeedIds.length > 0) {
    subscribedFeedIds.forEach(feedId => {
      const feed = feeds.find(f => f.feedId === feedId);
      // Only add if feed doesn't have a category (or category already shown above)
      if (feed && !feed.feedCategory) {
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

