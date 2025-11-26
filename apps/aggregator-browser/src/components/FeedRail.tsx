/**
 * Feed Rail Component
 * Horizontal scrolling feed selector for TikTok-style navigation
 * pN feed button: tap to go to pN feed, tap and hold to open context menu
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Feed } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { Globe, Sparkles, User, Rss } from 'lucide-react';
import { FEED_CATEGORIES } from '../constants/feedCategories';
import { AppContext } from '../hooks/useAppContext';

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
  // Context switching props (for pN feed button)
  currentContext?: AppContext | null;
  availableContexts?: AppContext[];
  onContextChange?: (context: AppContext) => void;
}

export function FeedRail({ 
  feeds, 
  activeFeedId, 
  onFeedSelect, 
  onBrowseFeeds,
  currentContext,
  availableContexts = [],
  onContextChange
}: FeedRailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const { userState } = useUserState();
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const pnButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current && 
        !contextMenuRef.current.contains(event.target as Node) &&
        pnButtonRef.current &&
        !pnButtonRef.current.contains(event.target as Node)
      ) {
        setShowContextMenu(false);
        setContextMenuPosition(null);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  // Handle long press on pN feed button
  const handlePnButtonPressStart = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!userState.isUnlocked || !currentContext || !availableContexts.length) return;

    const startTime = Date.now();
    const buttonElement = pnButtonRef.current;
    if (!buttonElement) return;

    // Get button position for menu placement
    const rect = buttonElement.getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 8; // Position below button

    longPressTimerRef.current = setTimeout(() => {
      setContextMenuPosition({ x, y });
      setShowContextMenu(true);
    }, 500); // 500ms long press
  }, [userState.isUnlocked, currentContext, availableContexts]);

  const handlePnButtonPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleContextSelect = useCallback((context: AppContext) => {
    onContextChange?.(context);
    setShowContextMenu(false);
    setContextMenuPosition(null);
  }, [onContextChange]);

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
              ref={isPublicFeed ? pnButtonRef : undefined}
              data-feed-id={feed.feedId}
              onClick={() => {
                if (isPublicFeed && showContextMenu) {
                  // If context menu is open, clicking closes it
                  setShowContextMenu(false);
                  setContextMenuPosition(null);
                } else {
                  onFeedSelect(feed.feedId);
                }
              }}
              onMouseDown={isPublicFeed ? handlePnButtonPressStart : undefined}
              onMouseUp={isPublicFeed ? handlePnButtonPressEnd : undefined}
              onMouseLeave={isPublicFeed ? handlePnButtonPressEnd : undefined}
              onTouchStart={isPublicFeed ? handlePnButtonPressStart : undefined}
              onTouchEnd={isPublicFeed ? handlePnButtonPressEnd : undefined}
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
              {isActive && (
                <span className="absolute left-0 right-0 h-0.5 bg-white" style={{ bottom: '-2px' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Context Menu - Shows when pN feed button is long-pressed */}
      {showContextMenu && contextMenuPosition && userState.isUnlocked && currentContext && availableContexts.length > 0 && (
        <div
          ref={contextMenuRef}
          className="fixed bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[200] max-h-[400px] overflow-y-auto"
          style={{
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
            minWidth: '240px',
            maxWidth: '280px'
          }}
        >
          {/* pN Identity */}
          {availableContexts.find(c => c.type === 'pn') && (
            <div className="p-2">
              <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
                Identity
              </div>
              {availableContexts
                .filter(c => c.type === 'pn')
                .map(context => (
                  <button
                    key={context.id}
                    onClick={() => handleContextSelect(context)}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      currentContext.id === context.id && currentContext.type === context.type
                        ? 'bg-blue-900/30 text-blue-300'
                        : 'hover:bg-neutral-800 text-white'
                    }`}
                  >
                    <User className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <span className="text-sm truncate">{context.name}</span>
                  </button>
                ))}
            </div>
          )}

          {/* Owned Feeds */}
          {availableContexts.filter(c => c.type === 'feed' && c.isOwned).length > 0 && (
            <div className="p-2 border-t border-neutral-700">
              <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
                My Feeds
              </div>
              {availableContexts
                .filter(c => c.type === 'feed' && c.isOwned)
                .map(context => (
                  <button
                    key={context.id}
                    onClick={() => handleContextSelect(context)}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      currentContext.id === context.id && currentContext.type === context.type
                        ? 'bg-purple-900/30 text-purple-300'
                        : 'hover:bg-neutral-800 text-white'
                    }`}
                  >
                    <Rss className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <span className="text-sm truncate">{context.name}</span>
                  </button>
                ))}
            </div>
          )}

          {/* Delegated Feeds */}
          {availableContexts.filter(c => c.type === 'feed' && !c.isOwned).length > 0 && (
            <div className="p-2 border-t border-neutral-700">
              <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
                Delegated Feeds
              </div>
              {availableContexts
                .filter(c => c.type === 'feed' && !c.isOwned)
                .map(context => (
                  <button
                    key={context.id}
                    onClick={() => handleContextSelect(context)}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      currentContext.id === context.id && currentContext.type === context.type
                        ? 'bg-purple-900/30 text-purple-300'
                        : 'hover:bg-neutral-800 text-white'
                    }`}
                  >
                    <Rss className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <span className="text-sm truncate">{context.name}</span>
                    <span className="text-xs text-neutral-500 ml-auto">Delegated</span>
                  </button>
                ))}
            </div>
          )}

          {/* Empty State */}
          {availableContexts.filter(c => c.type === 'feed').length === 0 && (
            <div className="p-4 text-center text-neutral-400 text-sm">
              No feeds available
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

  // Add CURATED feed right after PUBLIC if user is unlocked
  if (isUnlocked) {
    items.push({
      feedId: 'curated',
      name: 'CURATED',
      isActive: activeFeedId === 'curated'
    });
  }

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

