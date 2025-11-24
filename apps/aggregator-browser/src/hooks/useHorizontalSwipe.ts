/**
 * Horizontal Swipe Hook
 * Handles horizontal swipe gestures for feed switching
 */

import { useRef, useEffect, RefObject, useCallback } from 'react';

export interface HorizontalSwipeHandlers {
  onSwipeLeft?: () => void; // Next feed
  onSwipeRight?: () => void; // Previous feed
  threshold?: number; // Minimum distance for swipe (default: 50px)
  enabled?: boolean;
  snapThreshold?: number; // Percentage of screen width to trigger snap (default: 0.2)
}

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  enabled = true,
  snapThreshold = 0.2
}: HorizontalSwipeHandlers): RefObject<HTMLDivElement> {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const isSwipingRef = useRef(false);

  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (isSwipingRef.current) return;
    
    isSwipingRef.current = true;
    
    if (direction === 'left' && onSwipeLeft) {
      onSwipeLeft();
    } else if (direction === 'right' && onSwipeRight) {
      onSwipeRight();
    }
    
    // Reset swiping flag after animation completes
    setTimeout(() => {
      isSwipingRef.current = false;
    }, 300);
  }, [onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default scrolling during horizontal swipe
      if (touchStartRef.current && !isSwipingRef.current) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);
        
        // Only prevent default if horizontal movement is clearly dominant (1.5x vertical)
        if (absDeltaX > absDeltaY * 1.5 && absDeltaX > threshold * 0.5) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || isSwipingRef.current) {
        touchStartRef.current = null;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const viewportWidth = window.innerWidth;

      // Reset
      touchStartRef.current = null;

      // Ignore if too slow (not a swipe)
      if (deltaTime > 300) return;

      // Check if horizontal movement is dominant
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      
      // Require horizontal movement to be at least 1.5x the vertical movement
      // This allows horizontal swipes even when there's some vertical scrolling
      if (absDeltaX <= absDeltaY * 1.5) {
        // Vertical movement is dominant, ignore
        return;
      }

      // Check if swipe distance exceeds threshold
      const percentageMoved = absDeltaX / viewportWidth;

      // Determine swipe direction
      if (absDeltaX > threshold && percentageMoved >= snapThreshold) {
        if (deltaX < 0 && onSwipeLeft) {
          // Swipe left (negative deltaX) = next feed
          handleSwipe('left');
        } else if (deltaX > 0 && onSwipeRight) {
          // Swipe right (positive deltaX) = previous feed
          handleSwipe('right');
        }
      }
    };

    // Use a function to get current element - this ensures we always use the latest ref value
    const attachListeners = () => {
      const element = elementRef.current || document;
      element.addEventListener('touchstart', handleTouchStart, { passive: true });
      element.addEventListener('touchmove', handleTouchMove, { passive: false });
      element.addEventListener('touchend', handleTouchEnd, { passive: true });
      return element;
    };

    const element = attachListeners();

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, snapThreshold, onSwipeLeft, onSwipeRight, handleSwipe]);

  return elementRef;
}

