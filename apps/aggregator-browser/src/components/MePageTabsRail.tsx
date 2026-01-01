/**
 * Me Page Tabs Rail Component
 * Horizontal scrolling tab selector for Me page (similar to FeedRail)
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { MePageDropdown } from './MePageDropdown';

interface MePageTabsRailProps {
  activeTab: 'all' | 'media' | 'thoughts' | 'collections' | 'likes' | 'comments' | 'shares' | 'saved' | 'connections';
  onTabSelect: (tab: 'all' | 'media' | 'thoughts' | 'collections' | 'likes' | 'comments' | 'shares' | 'saved' | 'connections') => void;
  availableTabs?: ('all' | 'media' | 'thoughts' | 'collections' | 'likes' | 'comments' | 'shares' | 'saved' | 'connections')[];
}

const TABS = ['connections', 'all', 'media', 'thoughts', 'collections', 'likes', 'comments', 'shares', 'saved'] as const;
const TAB_LABELS: Record<typeof TABS[number], string> = {
  all: 'ALL',
  media: 'MEDIA',
  thoughts: 'THOUGHTS',
  collections: 'COLLECTIONS',
  likes: 'LIKES',
  comments: 'COMMENTS',
  shares: 'SHARES',
  saved: 'SAVED',
  connections: 'CONNECTIONS'
};

export function MePageTabsRail({ activeTab, onTabSelect, availableTabs }: MePageTabsRailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pNButtonRef = useRef<HTMLButtonElement>(null);
  const { userState } = useUserState();
  const [showDropdown, setShowDropdown] = useState(false);
  const isAllTabActive = activeTab === 'all';

  // Filter tabs based on availableTabs prop
  const visibleTabs = availableTabs ? TABS.filter(tab => availableTabs.includes(tab)) : TABS;

  // Calculate scroll position to center an element at screen midpoint
  const calculateScrollToCenter = useCallback((element: HTMLElement): number => {
    if (!scrollContainerRef.current) return 0;
    
    const container = scrollContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    const screenCenter = window.innerWidth / 2;
    const elementCenter = elementRect.left - containerRect.left + (elementRect.width / 2);
    const currentScroll = container.scrollLeft;
    const scrollNeeded = currentScroll + (elementCenter - screenCenter);
    
    return scrollNeeded;
  }, []);

  // Calculate min and max scroll positions
  const calculateScrollLimits = useCallback(() => {
    if (!scrollContainerRef.current || !innerContainerRef.current) {
      return { min: 0, max: 0 };
    }
    
    const container = scrollContainerRef.current;
    const allTabElements = innerContainerRef.current.querySelectorAll('[data-tab]') as NodeListOf<HTMLElement>;
    
    if (allTabElements.length === 0) {
      return { min: 0, max: 0 };
    }
    
    const firstElement = allTabElements[0];
    const lastElement = allTabElements[allTabElements.length - 1];
    const screenCenter = window.innerWidth / 2;
    const containerRect = container.getBoundingClientRect();
    
    const firstElementRect = firstElement.getBoundingClientRect();
    const firstElementCenter = firstElementRect.left - containerRect.left + (firstElementRect.width / 2);
    const minScroll = Math.max(0, container.scrollLeft + (firstElementCenter - screenCenter));
    
    const lastElementRect = lastElement.getBoundingClientRect();
    const lastElementCenter = lastElementRect.left - containerRect.left + (lastElementRect.width / 2);
    const maxScroll = container.scrollLeft + (lastElementCenter - screenCenter);
    
    const naturalMaxScroll = container.scrollWidth - container.clientWidth;
    
    return {
      min: 0,
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

  // Auto-scroll to center active tab on mount/change
  useEffect(() => {
    if (!scrollContainerRef.current || !innerContainerRef.current) return;
    
    const timeoutId = setTimeout(() => {
      const activeElement = innerContainerRef.current?.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
      if (!activeElement || !scrollContainerRef.current) return;
      
      const scrollPosition = calculateScrollToCenter(activeElement);
      const limits = calculateScrollLimits();
      
      const clampedScroll = Math.max(limits.min, Math.min(scrollPosition, limits.max));
      
      scrollContainerRef.current.scrollTo({
        left: clampedScroll,
        behavior: 'smooth'
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [activeTab, calculateScrollToCenter, calculateScrollLimits]);

  // Calculate dropdown position when "all" tab is active
  const getDropdownPosition = useCallback(() => {
    if (!isAllTabActive || !userState.isUnlocked || !pNButtonRef.current || !scrollContainerRef.current) {
      return null;
    }
    const buttonRect = pNButtonRef.current.getBoundingClientRect();
    const containerRect = scrollContainerRef.current.getBoundingClientRect();
    return {
      left: buttonRect.left - containerRect.left + (buttonRect.width / 2),
      top: containerRect.height + 4
    };
  }, [isAllTabActive, userState.isUnlocked]);
  
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; top: number } | null>(null);
  
  useEffect(() => {
    if (isAllTabActive && userState.isUnlocked) {
      const updatePosition = () => {
        const pos = getDropdownPosition();
        setDropdownPosition(pos);
      };
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
  }, [isAllTabActive, userState.isUnlocked, activeTab, visibleTabs.length, getDropdownPosition]);

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

  return (
    <div 
      className="fixed top-0 left-0 h-12 flex items-center z-[100] bg-transparent"
      style={{ 
        right: '56px', // Space for lock button (40px button + 12px right-3 + 4px gap)
        background: 'transparent'
      }}
    >
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
          className="flex items-center space-x-6 py-2"
          style={{ 
            minWidth: 'max-content',
            paddingLeft: 'calc(50vw - 12px)',
            paddingRight: 'calc(50vw - 12px)'
          }}
        >
          {visibleTabs.map((tab) => {
            const isActive = tab === activeTab;
            const isAllTab = tab === 'all';
            
            return (
              <div key={tab} className="relative">
                <button
                  ref={isAllTab ? pNButtonRef : undefined}
                  data-tab={tab}
                  onClick={() => onTabSelect(tab)}
                  className="relative whitespace-nowrap text-sm font-medium uppercase tracking-wide transition-colors flex items-center justify-center"
                  style={{ opacity: isActive ? 1 : 0.85 }}
                >
                  {isAllTab ? (
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
              </div>
            );
          })}
        </div>
        </div>
        {/* Dropdown arrow and menu for "all" tab - positioned absolutely below railway */}
        {isAllTabActive && userState.isUnlocked && dropdownPosition && (
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
              title="Sort options"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-[200]"
              >
                <MePageDropdown onClose={() => setShowDropdown(false)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

