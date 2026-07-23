/**
 * Like/Dislike Swipe Hook
 * Handles horizontal swipe gestures for liking (swipe right) and disliking (swipe left)
 * For collections, requires tap-and-hold (250ms) before swipe is enabled
 */

import { useRef, useEffect, RefObject, useCallback } from 'react';

export interface LikeDislikeSwipeHandlers {
  onSwipeRight?: () => void; // Like
  onSwipeLeft?: () => void; // Dislike
  isCollection?: boolean; // Whether current content is a collection
  threshold?: number; // Minimum distance for swipe (default: 50px)
  enabled?: boolean;
  snapThreshold?: number; // Percentage of screen width to trigger snap (default: 0.2)
  holdDuration?: number; // Duration to hold before enabling swipe for collections (default: 250ms)
}

export function useLikeDislikeSwipe({
  onSwipeRight,
  onSwipeLeft,
  isCollection = false,
  threshold = 50,
  enabled = true,
  snapThreshold = 0.2,
  holdDuration = 250
}: LikeDislikeSwipeHandlers): RefObject<HTMLDivElement> {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const isSwipingRef = useRef(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (isSwipingRef.current) return;
    
    // For collections, require hold before swipe
    if (isCollection && !isHoldingRef.current) {
      return;
    }
    
    isSwipingRef.current = true;
    
    if (direction === 'right' && onSwipeRight) {
      onSwipeRight();
    } else if (direction === 'left' && onSwipeLeft) {
      onSwipeLeft();
    }
    
    // Reset swiping flag after animation completes
    setTimeout(() => {
      isSwipingRef.current = false;
    }, 300);
  }, [isCollection, onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleTouchStart: EventListener = (event) => {
      if (!(event instanceof TouchEvent)) return;
      const e = event;
      const target = e.target as HTMLElement;
      const element = elementRef.current;
      
      if (element && !element.contains(target)) {
        return;
      }
      
      // Don't interfere with button clicks or PDF scrolling
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      const pdfContainer = target.closest('[data-pdf-scroll-container="true"]');
      if (pdfContainer) {
        return;
      }
      
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
      
      // For collections, start hold timer
      if (isCollection) {
        isHoldingRef.current = false;
        holdTimerRef.current = setTimeout(() => {
          isHoldingRef.current = true;
        }, holdDuration);
      } else {
        // For non-collections, enable immediately
        isHoldingRef.current = true;
      }
    };

    const handleTouchMove: EventListener = (event) => {
      if (!(event instanceof TouchEvent)) return;
      const e = event;
      if (!touchStartRef.current || isSwipingRef.current) return;
      
      const target = e.target as HTMLElement;
      const element = elementRef.current;
      
      if (element && !element.contains(target)) {
        return;
      }
      
      const pdfContainer = target.closest('[data-pdf-scroll-container="true"]');
      if (pdfContainer) {
        return;
      }
      
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      
      // Only prevent default if horizontal movement is dominant and hold is active (for collections)
      if (isCollection && !isHoldingRef.current) {
        // Cancel hold timer if user moves before hold completes
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        return;
      }
      
      if (absDeltaX > absDeltaY * 1.5 && absDeltaX > threshold * 0.5) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleTouchEnd: EventListener = (event) => {
      if (!(event instanceof TouchEvent)) return;
      const e = event;
      // Clear hold timer
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      
      if (!touchStartRef.current || isSwipingRef.current) {
        touchStartRef.current = null;
        isHoldingRef.current = false;
        return;
      }

      const target = e.target as HTMLElement;
      
      const pdfContainer = target.closest('[data-pdf-scroll-container="true"]');
      if (pdfContainer) {
        touchStartRef.current = null;
        isHoldingRef.current = false;
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const viewportWidth = window.innerWidth;

      touchStartRef.current = null;
      
      // For collections, require hold before swipe
      if (isCollection && !isHoldingRef.current) {
        isHoldingRef.current = false;
        return;
      }

      // Ignore if too slow (not a swipe)
      if (deltaTime > 300) {
        isHoldingRef.current = false;
        return;
      }

      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      
      // Require horizontal movement to be at least 1.5x the vertical movement
      if (absDeltaX <= absDeltaY * 1.5) {
        isHoldingRef.current = false;
        return;
      }

      const percentageMoved = absDeltaX / viewportWidth;

      if (absDeltaX > threshold && percentageMoved >= snapThreshold) {
        if (deltaX < 0 && onSwipeLeft) {
          // Swipe left = dislike
          handleSwipe('left');
        } else if (deltaX > 0 && onSwipeRight) {
          // Swipe right = like
          handleSwipe('right');
        }
      }
      
      isHoldingRef.current = false;
    };

    const element = elementRef.current || document;
    const useCapture = true;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: true, capture: useCapture });
    element.addEventListener('touchmove', handleTouchMove, { passive: false, capture: useCapture });
    element.addEventListener('touchend', handleTouchEnd, { passive: true, capture: useCapture });

    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      element.removeEventListener('touchstart', handleTouchStart, useCapture);
      element.removeEventListener('touchmove', handleTouchMove, useCapture);
      element.removeEventListener('touchend', handleTouchEnd, useCapture);
    };
  }, [enabled, threshold, snapThreshold, holdDuration, isCollection, onSwipeLeft, onSwipeRight, handleSwipe]);

  return elementRef;
}

