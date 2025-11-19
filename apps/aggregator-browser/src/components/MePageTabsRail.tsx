/**
 * Me Page Tabs Rail Component
 * Horizontal scrolling tab selector for Me page (similar to FeedRail)
 */

import React, { useRef, useEffect } from 'react';

interface MePageTabsRailProps {
  activeTab: 'all' | 'media' | 'likes' | 'comments' | 'saved' | 'connections';
  onTabSelect: (tab: 'all' | 'media' | 'likes' | 'comments' | 'saved' | 'connections') => void;
  availableTabs?: ('all' | 'media' | 'likes' | 'comments' | 'saved' | 'connections')[];
}

const TABS = ['all', 'media', 'likes', 'comments', 'saved', 'connections'] as const;
const TAB_LABELS: Record<typeof TABS[number], string> = {
  all: 'ALL',
  media: 'MEDIA',
  likes: 'LIKES',
  comments: 'COMMENTS',
  saved: 'SAVED',
  connections: 'CONNECTIONS'
};

export function MePageTabsRail({ activeTab, onTabSelect, availableTabs }: MePageTabsRailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);

  // Filter tabs based on availableTabs prop
  const visibleTabs = availableTabs ? TABS.filter(tab => availableTabs.includes(tab)) : TABS;

  // Center active tab using transform (no scrolling)
  useEffect(() => {
    if (!containerRef.current || !innerContainerRef.current) return;
    const activeElement = innerContainerRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
    if (activeElement && containerRef.current) {
      // Get element position relative to inner container (before any transform)
      const elementLeftRelative = activeElement.offsetLeft;
      const elementWidth = activeElement.offsetWidth;
      const elementCenterRelative = elementLeftRelative + (elementWidth / 2);
      
      // Get inner container's current position (before transform)
      const innerContainerWidth = innerContainerRef.current.offsetWidth;
      const innerContainerLeft = innerContainerRef.current.offsetLeft;
      
      // Calculate screen midpoint (full screen width)
      const screenWidth = window.innerWidth;
      const screenMidpoint = screenWidth / 2;
      
      // Calculate where the element center would be if inner container starts at its natural position
      // The inner container is centered initially, so we need to account for that
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerLeft = containerRect.left;
      
      // Calculate the transform needed:
      // We want: containerLeft + elementCenterRelative + translateX = screenMidpoint
      // So: translateX = screenMidpoint - containerLeft - elementCenterRelative
      const translateX = screenMidpoint - containerLeft - elementCenterRelative;
      
      innerContainerRef.current.style.transform = `translateX(${translateX}px)`;
      innerContainerRef.current.style.transition = 'transform 0.3s ease';
    }
  }, [activeTab]);

  return (
    <div 
      ref={containerRef}
      className="fixed top-0 left-0 h-12 flex items-center z-[100] bg-transparent overflow-hidden" 
      style={{ 
        right: '56px', // Space for lock button (40px button + 12px right-3 + 4px gap)
        background: 'transparent'
      }}
    >
      <div
        ref={innerContainerRef}
        className="flex items-center justify-center space-x-6 py-2 h-full"
        style={{ 
          minWidth: 'max-content'
        }}
      >
        {visibleTabs.map((tab) => {
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

