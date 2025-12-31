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

  // Calculate scroll position to center an element at screen midpoint
  const calculateScrollToCenter = useCallback((element: HTMLElement): number => {
    if (!scrollContainerRef.current) return 0;
    
    const container = scrollContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Calculate the center of the screen (relative to the container)
    const screenCenter = window.innerWidth / 2;
    
    // Calculate where the element currently is relative to the container
    const elementCenter = elementRect.left - containerRect.left + (elementRect.width / 2);
    
    // Calculate how much we need to scroll to center the element
    const currentScroll = container.scrollLeft;
    const scrollNeeded = currentScroll + (elementCenter - screenCenter);
    
    return scrollNeeded;
  }, []);

  // Calculate min and max scroll positions
  // Min: first element can be centered (scroll = 0 centers first element)
  // Max: last element can be centered (but not scrolled past)
  const calculateScrollLimits = useCallback(() => {
    if (!scrollContainerRef.current || !innerContainerRef.current) {
      return { min: 0, max: 0 };
    }
    
    const container = scrollContainerRef.current;
    const allFeedElements = innerContainerRef.current.querySelectorAll('[data-feed-id]') as NodeListOf<HTMLElement>;
    
    if (allFeedElements.length === 0) {
      return { min: 0, max: 0 };
    }
    
    const firstElement = allFeedElements[0];
    const lastElement = allFeedElements[allFeedElements.length - 1];
    const screenCenter = window.innerWidth / 2;
    const containerRect = container.getBoundingClientRect();
    
    // Calculate min scroll (when first element is centered)
    const firstElementRect = firstElement.getBoundingClientRect();
    const firstElementCenter = firstElementRect.left - containerRect.left + (firstElementRect.width / 2);
    const minScroll = Math.max(0, container.scrollLeft + (firstElementCenter - screenCenter));
    
    // Calculate max scroll (when last element is centered)
    const lastElementRect = lastElement.getBoundingClientRect();
    const lastElementCenter = lastElementRect.left - containerRect.left + (lastElementRect.width / 2);
    const maxScroll = container.scrollLeft + (lastElementCenter - screenCenter);
    
    // Ensure we don't scroll beyond the natural scroll limit
    const naturalMaxScroll = container.scrollWidth - container.clientWidth;
    
    return {
      min: 0, // Always allow scrolling to start
      max: Math.min(maxScroll, naturalMaxScroll)
    };
  }, []);

  // Enforce scroll limits on manual scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const limits = calculateScrollLimits();
      if (container.scrollLeft < limits.min) {
        container.scrollTo({
          left: limits.min,
          behavior: 'auto'
        });
      } else if (container.scrollLeft > limits.max) {
        container.scrollTo({
          left: limits.max,
          behavior: 'auto'
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [calculateScrollLimits]);

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
    
    const timeoutId = setTimeout(() => {
      const activeElement = innerContainerRef.current?.querySelector(`[data-feed-id="${activeFeedId}"]`) as HTMLElement;
      if (!activeElement || !scrollContainerRef.current) return;
      
      const scrollPosition = calculateScrollToCenter(activeElement);
      const limits = calculateScrollLimits();
      
      // Clamp scroll position within limits
      const clampedScroll = Math.max(limits.min, Math.min(scrollPosition, limits.max));
      
      scrollContainerRef.current.scrollTo({
        left: clampedScroll,
        behavior: 'smooth'
      });
    }, 100); // Increased timeout to ensure DOM is ready
    
    return () => clearTimeout(timeoutId);
  }, [activeFeedId, calculateScrollToCenter, calculateScrollLimits]);

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
      // Use multiple timeouts to ensure button is rendered
      updatePosition();
      const timeout1 = setTimeout(updatePosition, 50);
      const timeout2 = setTimeout(updatePosition, 150);
      const timeout3 = setTimeout(updatePosition, 300);
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', updatePosition, { passive: true });
      }
      window.addEventListener('resize', updatePosition);
      return () => {
        if (scrollContainer) {
          scrollContainer.removeEventListener('scroll', updatePosition);
        }
        window.removeEventListener('resize', updatePosition);
        clearTimeout(timeout1);
        clearTimeout(timeout2);
        clearTimeout(timeout3);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [isPublicFeedActive, userState.isUnlocked, activeFeedId, feeds.length, getDropdownPosition]);

  return (
    <div className="relative w-full">
      <div 
        ref={scrollContainerRef}
        className="w-full overflow-x-auto scrollbar-hide pointer-events-auto" 
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div
          ref={innerContainerRef}
          className="flex items-center space-x-8 py-2"
          style={{ 
            minWidth: 'max-content',
            paddingLeft: 'calc(50vw - 12px)', // Center first item when scrolled to start
            paddingRight: 'calc(50vw - 12px)' // Center last item when scrolled to end
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

