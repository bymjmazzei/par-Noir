/**
 * Infinite Scroll Hook
 * Detects when user scrolls near bottom and triggers load more
 */

import { useEffect, useRef, RefObject } from 'react';

export interface InfiniteScrollOptions {
  onLoadMore: () => Promise<void> | void;
  threshold?: number; // Distance from bottom to trigger (default: 200px)
  enabled?: boolean;
  hasMore?: boolean;
  loading?: boolean;
}

export function useInfiniteScroll({
  onLoadMore,
  threshold = 200,
  enabled = true,
  hasMore = true,
  loading = false
}: InfiniteScrollOptions): RefObject<HTMLDivElement> {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !hasMore || loading) return;

    const element = elementRef.current;
    if (!element) return;

    const handleScroll = async () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom <= threshold) {
        await onLoadMore();
      }
    };

    // Throttle scroll events
    let ticking = false;
    const throttledHandleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(async () => {
          await handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    element.addEventListener('scroll', throttledHandleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', throttledHandleScroll);
    };
  }, [enabled, hasMore, loading, threshold, onLoadMore]);

  return elementRef;
}

