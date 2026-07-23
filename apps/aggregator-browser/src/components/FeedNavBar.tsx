/**
 * Feed Navigation Bar
 * Sliding top menu bar that shows current feed title and allows navigation
 */

import { useEffect, useRef } from 'react';
import { FeedNavigationItem } from '../hooks/useFeedNavigation';

interface FeedNavBarProps {
  feedHierarchy: FeedNavigationItem[];
  activeFeedId: string;
  onFeedSelect: (feedId: string) => void;
}

export function FeedNavBar({ feedHierarchy, activeFeedId, onFeedSelect }: FeedNavBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeFeed = feedHierarchy.find(item => item.feedId === activeFeedId);

  // Auto-scroll to active feed when it changes
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const activeElement = scrollContainerRef.current.querySelector(`[data-feed-id="${activeFeedId}"]`);
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeFeedId]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-neutral-900/95 backdrop-blur-sm border-b border-neutral-700"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        ref={scrollContainerRef}
        className="flex items-center overflow-x-auto scrollbar-hide px-4 py-3"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {feedHierarchy.map((feed) => {
          const isActive = feed.feedId === activeFeedId;
          
          return (
            <button
              key={feed.feedId}
              data-feed-id={feed.feedId}
              onClick={() => onFeedSelect(feed.feedId)}
              className={`
                flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap transition-all font-medium text-sm
                ${isActive
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                }
              `}
              aria-label={`Switch to ${feed.name} feed`}
            >
              {feed.name}
            </button>
          );
        })}
      </div>
      
      {/* Current feed title indicator */}
      {activeFeed && (
        <div className="px-4 pb-2">
          <h2 className="text-white text-lg font-semibold truncate">
            {activeFeed.name}
          </h2>
        </div>
      )}
    </div>
  );
}

