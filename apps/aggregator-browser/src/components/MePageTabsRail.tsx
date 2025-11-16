/**
 * Me Page Tabs Rail Component
 * Horizontal scrolling tab selector for Me page (similar to FeedRail)
 */

import React, { useRef, useEffect } from 'react';

interface MePageTabsRailProps {
  activeTab: 'all' | 'media' | 'likes' | 'comments' | 'saved';
  onTabSelect: (tab: 'all' | 'media' | 'likes' | 'comments' | 'saved') => void;
}

const TABS = ['all', 'media', 'likes', 'comments', 'saved'] as const;
const TAB_LABELS: Record<typeof TABS[number], string> = {
  all: 'ALL',
  media: 'MEDIA',
  likes: 'LIKES',
  comments: 'COMMENTS',
  saved: 'SAVED'
};

export function MePageTabsRail({ activeTab, onTabSelect }: MePageTabsRailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to center active tab (TikTok style)
  useEffect(() => {
    if (!scrollContainerRef.current || !innerContainerRef.current) return;
    const activeElement = innerContainerRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
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
  }, [activeTab]);

  return (
    <div 
      ref={scrollContainerRef}
      className="absolute top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm border-b border-neutral-800 h-12 overflow-x-auto scrollbar-hide" 
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div
        ref={innerContainerRef}
        className="flex items-center justify-center space-x-6 py-2 h-full"
        style={{ 
          minWidth: 'max-content',
          paddingLeft: '50%',
          paddingRight: '50%'
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          
          return (
            <button
              key={tab}
              data-tab={tab}
              onClick={() => onTabSelect(tab)}
              className="relative whitespace-nowrap text-sm font-medium uppercase tracking-wide transition-colors"
              style={{ opacity: isActive ? 1 : 0.85 }}
            >
              <span className={isActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-300'}>
                {TAB_LABELS[tab]}
              </span>
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

