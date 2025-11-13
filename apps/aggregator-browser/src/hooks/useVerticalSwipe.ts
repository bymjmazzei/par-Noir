/**
 * Vertical Swipe Hook
 * Handles vertical swipe gestures with snap behavior for TikTok-style feed navigation
 */

import { useRef, useEffect, RefObject, useCallback } from 'react';

export interface VerticalSwipeHandlers {
  onSwipeUp?: () => void; // Next media
  onSwipeDown?: () => void; // Previous media
  threshold?: number; // Minimum distance for swipe (default: 50px)
  enabled?: boolean;
  snapThreshold?: number; // Percentage of screen height to trigger snap (default: 0.2)
}

export function useVerticalSwipe({
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  enabled = true,
  snapThreshold = 0.2
}: VerticalSwipeHandlers): RefObject<HTMLDivElement> {
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const isScrollingRef = useRef(false);

  const handleSwipe = useCallback((direction: 'up' | 'down') => {
    if (isScrollingRef.current) return;
    
    isScrollingRef.current = true;
    
    if (direction === 'up' && onSwipeUp) {
      onSwipeUp();
    } else if (direction === 'down' && onSwipeDown) {
      onSwipeDown();
    }
    
    // Reset scrolling flag after animation completes
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 300);
  }, [onSwipeUp, onSwipeDown]);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        y: touch.clientY,
        time: Date.now()
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default scrolling during swipe
      if (touchStartRef.current && !isScrollingRef.current) {
        const touch = e.touches[0];
        const deltaY = touch.clientY - touchStartRef.current.y;
        const absDeltaY = Math.abs(deltaY);
        
        // If swipe is significant, prevent default scroll
        if (absDeltaY > threshold * 0.5) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || isScrollingRef.current) {
        touchStartRef.current = null;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const viewportHeight = window.innerHeight;

      // Reset
      touchStartRef.current = null;

      // Ignore if too slow (not a swipe)
      if (deltaTime > 300) return;

      // Check if swipe distance exceeds threshold
      const absDeltaY = Math.abs(deltaY);
      const percentageMoved = absDeltaY / viewportHeight;

      // Determine swipe direction
      if (absDeltaY > threshold && percentageMoved >= snapThreshold) {
        if (deltaY < 0 && onSwipeUp) {
          // Swipe up (negative deltaY) = next media
          handleSwipe('up');
        } else if (deltaY > 0 && onSwipeDown) {
          // Swipe down (positive deltaY) = previous media
          handleSwipe('down');
        }
      }
    };

    const element = elementRef.current || document;
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, snapThreshold, onSwipeUp, onSwipeDown, handleSwipe]);

  return elementRef;
}

