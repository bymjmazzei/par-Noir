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
    if (!enabled) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      // Only handle if touching the actual element (not a child that might have its own handlers)
      const target = e.target as HTMLElement;
      const element = elementRef.current;
      
      // Check if touch started on the element or its children (but not on buttons/interactive elements)
      if (element && !element.contains(target)) {
        return; // Touch started outside our element
      }
      
      // MOBILE FIX: Don't interfere with PDF horizontal scrolling
      // Check if touch is inside a PDF scroll container
      const pdfContainer = target.closest('[data-pdf-scroll-container="true"]');
      if (pdfContainer) {
        console.log('[useHorizontalSwipe] Touch inside PDF container, ignoring feed navigation');
        return; // Let PDF handle horizontal scrolling
      }
      
      // Don't interfere with button clicks
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || isSwipingRef.current) return;
      
      const target = e.target as HTMLElement;
      const element = elementRef.current;
      
      // Only handle if touching the actual element
      if (element && !element.contains(target)) {
        return;
      }
      
      // MOBILE FIX: Don't interfere with PDF horizontal scrolling
      const pdfContainer = target.closest('[data-pdf-scroll-container="true"]');
      if (pdfContainer) {
        return; // Let PDF handle horizontal scrolling
      }
      
      // Don't interfere with button interactions
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      
      // Only prevent default if horizontal movement is clearly dominant (1.5x vertical)
      // This prevents vertical scrolling when user is swiping horizontally
      if (absDeltaX > absDeltaY * 1.5 && absDeltaX > threshold * 0.5) {
        e.preventDefault();
        e.stopPropagation(); // Stop event from reaching parent scroll container
        e.stopImmediatePropagation(); // Stop ALL other handlers
        console.log('[useHorizontalSwipe] Touch move - preventing default (horizontal swipe detected)', { deltaX, deltaY, absDeltaX, absDeltaY });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || isSwipingRef.current) {
        touchStartRef.current = null;
        return;
      }

      const target = e.target as HTMLElement;
      
      // MOBILE FIX: Don't interfere with PDF horizontal scrolling
      const pdfContainer = target.closest('[data-pdf-scroll-container="true"]');
      if (pdfContainer) {
        console.log('[useHorizontalSwipe] Touch end inside PDF container, ignoring feed navigation');
        touchStartRef.current = null;
        return; // Let PDF handle horizontal scrolling
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const viewportWidth = window.innerWidth;

      console.log('[useHorizontalSwipe] Touch end:', { 
        deltaX, 
        deltaY, 
        deltaTime, 
        absDeltaX: Math.abs(deltaX),
        absDeltaY: Math.abs(deltaY),
        threshold,
        percentageMoved: Math.abs(deltaX) / viewportWidth,
        snapThreshold
      });

      // Reset
      touchStartRef.current = null;

      // Ignore if too slow (not a swipe)
      if (deltaTime > 300) {
        console.log('[useHorizontalSwipe] Swipe too slow, ignoring');
        return;
      }

      // Check if horizontal movement is dominant
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      
      // Require horizontal movement to be at least 1.5x the vertical movement
      // This allows horizontal swipes even when there's some vertical scrolling
      if (absDeltaX <= absDeltaY * 1.5) {
        // Vertical movement is dominant, ignore
        console.log('[useHorizontalSwipe] Vertical movement dominant, ignoring');
        return;
      }

      // Check if swipe distance exceeds threshold
      const percentageMoved = absDeltaX / viewportWidth;

      // Determine swipe direction
      if (absDeltaX > threshold && percentageMoved >= snapThreshold) {
        if (deltaX < 0 && onSwipeLeft) {
          // Swipe left (negative deltaX) = next feed
          console.log('[useHorizontalSwipe] Triggering swipe LEFT');
          handleSwipe('left');
        } else if (deltaX > 0 && onSwipeRight) {
          // Swipe right (positive deltaX) = previous feed
          console.log('[useHorizontalSwipe] Triggering swipe RIGHT');
          handleSwipe('right');
        }
      } else {
        console.log('[useHorizontalSwipe] Swipe threshold not met:', { absDeltaX, threshold, percentageMoved, snapThreshold });
      }
    };

    // Get the current element - check periodically to handle ref changes
    const getElement = () => elementRef.current || document;
    
    const element = getElement();
    
    // Use CAPTURE phase to intercept touches BEFORE parent scroll container gets them
    // This is critical for PDF horizontal swipe - parent has overflow-y-scroll which captures all touches
    const useCapture = true;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: true, capture: useCapture });
    element.addEventListener('touchmove', handleTouchMove, { passive: false, capture: useCapture });
    element.addEventListener('touchend', handleTouchEnd, { passive: true, capture: useCapture });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart, { capture: useCapture } as any);
      element.removeEventListener('touchmove', handleTouchMove, { capture: useCapture } as any);
      element.removeEventListener('touchend', handleTouchEnd, { capture: useCapture } as any);
    };
  }, [enabled, threshold, snapThreshold, onSwipeLeft, onSwipeRight, handleSwipe]);

  return elementRef;
}

