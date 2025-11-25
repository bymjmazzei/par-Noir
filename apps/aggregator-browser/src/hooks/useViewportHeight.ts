/**
 * Viewport Height Hook
 * Uses window.innerHeight instead of 100vh to account for mobile browser UI
 * Mobile browsers have dynamic UI (address bar, menu bar) that 100vh doesn't account for
 */

import { useState, useEffect } from 'react';

const BOTTOM_NAV_HEIGHT = 64; // Bottom navigation bar height in pixels

/**
 * Get the actual usable viewport height, accounting for mobile browser UI
 * @param excludeBottomNav - Whether to exclude the bottom nav height (default: true)
 * @returns The usable viewport height in pixels
 */
export function useViewportHeight(excludeBottomNav: boolean = true): number {
  const [height, setHeight] = useState(() => {
    // Initialize with current window height
    if (typeof window !== 'undefined') {
      return excludeBottomNav 
        ? window.innerHeight - BOTTOM_NAV_HEIGHT
        : window.innerHeight;
    }
    return 0;
  });

  useEffect(() => {
    const updateHeight = () => {
      // Use window.innerHeight which excludes browser UI (unlike 100vh)
      const newHeight = excludeBottomNav
        ? window.innerHeight - BOTTOM_NAV_HEIGHT
        : window.innerHeight;
      setHeight(newHeight);
    };

    // Set initial height
    updateHeight();

    // Listen for resize events (browser UI can show/hide dynamically)
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);
    
    // Also listen for visual viewport changes (more accurate for mobile browsers)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight);
      window.visualViewport.addEventListener('scroll', updateHeight);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
        window.visualViewport.removeEventListener('scroll', updateHeight);
      }
    };
  }, [excludeBottomNav]);

  return height;
}

/**
 * Get CSS height value string for use in style objects
 * Falls back to calc() if window is not available (SSR)
 */
export function useViewportHeightCSS(excludeBottomNav: boolean = true): string {
  const height = useViewportHeight(excludeBottomNav);
  
  // Return pixel value if we have a height, otherwise fallback to calc()
  if (height > 0) {
    return `${height}px`;
  }
  
  // Fallback for SSR or initial render
  return excludeBottomNav
    ? 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))'
    : '100vh';
}

