/**
 * Swipe Gesture Hook
 * Handles touch swipe gestures for mobile navigation
 */

import { useRef, useEffect, RefObject } from 'react';

export interface SwipeGestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // Minimum distance for swipe (default: 50px)
  enabled?: boolean;
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  enabled = true
}: SwipeGestureHandlers): RefObject<HTMLElement> {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart: EventListener = (event) => {
      if (!(event instanceof TouchEvent)) return;
      const e = event;
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    };

    const handleTouchEnd: EventListener = (event) => {
      if (!(event instanceof TouchEvent)) return;
      const e = event;
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;

      // Reset
      touchStartRef.current = null;

      // Ignore if too slow (not a swipe)
      if (deltaTime > 300) return;

      // Determine swipe direction
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Horizontal swipe
      if (absX > absY && absX > threshold) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft();
        }
      }
      // Vertical swipe
      else if (absY > absX && absY > threshold) {
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown();
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp();
        }
      }
    };

    const element = elementRef.current || document;
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return elementRef;
}

