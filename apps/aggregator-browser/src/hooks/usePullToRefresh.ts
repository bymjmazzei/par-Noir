/**
 * Pull to Refresh Hook
 * Handles pull-to-refresh gesture for refreshing feed content
 */

import { useRef, useEffect, RefObject } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // Distance to pull before triggering refresh (default: 80px)
  enabled?: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true
}: PullToRefreshOptions): RefObject<HTMLDivElement> {
  const elementRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only trigger if at top of scroll
      if (element.scrollTop === 0) {
        const touch = e.touches[0];
        touchStartRef.current = {
          y: touch.clientY,
          scrollTop: element.scrollTop
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || isRefreshingRef.current) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Only allow pull down when at top
      if (element.scrollTop === 0 && deltaY > 0) {
        // Prevent default scrolling
        e.preventDefault();
      }
    };

    const handleTouchEnd = async (e: TouchEvent) => {
      if (!touchStartRef.current || isRefreshingRef.current) return;

      const touch = e.changedTouches[0];
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Reset
      touchStartRef.current = null;

      // Check if pull distance exceeds threshold
      if (deltaY >= threshold && element.scrollTop === 0) {
        isRefreshingRef.current = true;
        try {
          await onRefresh();
        } finally {
          // Small delay before allowing another refresh
          setTimeout(() => {
            isRefreshingRef.current = false;
          }, 1000);
        }
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, onRefresh]);

  return elementRef;
}

