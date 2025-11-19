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
          const isAllTab = tab === 'all';
          
          return (
            <button
              key={tab}
              data-tab={tab}
              onClick={() => onTabSelect(tab)}
              className="relative whitespace-nowrap text-sm font-medium uppercase tracking-wide transition-colors flex items-center justify-center"
              style={{ opacity: isActive ? 1 : 0.85 }}
            >
              {isAllTab ? (
                // pN text for all tab (lowercase p with line, uppercase N)
                <svg 
                  width="24" 
                  height="20" 
                  viewBox="0 0 24 20" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className={isActive ? 'text-white' : 'text-neutral-400'}
                >
                  <text 
                    x="0" 
                    y="15" 
                    fontSize="14" 
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
                <span className={isActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-300'}>
                  {TAB_LABELS[tab]}
                </span>
              )}
              {isActive && (
                <span className="absolute left-0 right-0 h-0.5 bg-white" style={{ bottom: '-2px' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

