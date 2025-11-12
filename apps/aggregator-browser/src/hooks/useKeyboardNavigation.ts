/**
 * Keyboard Navigation Hook
 * Handles keyboard shortcuts for feed navigation and media control
 */

import { useEffect, useCallback } from 'react';

export interface KeyboardNavigationHandlers {
  onNextFeed?: () => void;
  onPreviousFeed?: () => void;
  onNextPost?: () => void;
  onPreviousPost?: () => void;
  onTogglePlayPause?: () => void;
  onOpenSettings?: () => void;
  onOpenFeedBrowser?: () => void;
  enabled?: boolean;
}

export function useKeyboardNavigation({
  onNextFeed,
  onPreviousFeed,
  onNextPost,
  onPreviousPost,
  onTogglePlayPause,
  onOpenSettings,
  onOpenFeedBrowser,
  enabled = true
}: KeyboardNavigationHandlers) {
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
        if (event.shiftKey && onNextFeed) {
          event.preventDefault();
          onNextFeed();
        } else if (onNextPost) {
          event.preventDefault();
          onNextPost();
        }
        break;

      case 'ArrowLeft':
        if (event.shiftKey && onPreviousFeed) {
          event.preventDefault();
          onPreviousFeed();
        } else if (onPreviousPost) {
          event.preventDefault();
          onPreviousPost();
        }
        break;

      case 'ArrowUp':
        if (onPreviousPost) {
          event.preventDefault();
          onPreviousPost();
        }
        break;

      case 'ArrowDown':
        if (onNextPost) {
          event.preventDefault();
          onNextPost();
        }
        break;

      case ' ':
        if (onTogglePlayPause) {
          event.preventDefault();
          onTogglePlayPause();
        }
        break;

      case ',':
        if (onPreviousPost) {
          event.preventDefault();
          onPreviousPost();
        }
        break;

      case '.':
        if (onNextPost) {
          event.preventDefault();
          onNextPost();
        }
        break;

      case 's':
      case 'S':
        if (onOpenSettings) {
          event.preventDefault();
          onOpenSettings();
        }
        break;

      case 'b':
      case 'B':
        if (onOpenFeedBrowser) {
          event.preventDefault();
          onOpenFeedBrowser();
        }
        break;

      case 'Escape':
        // Close modals - handled by components
        break;
    }
  }, [
    enabled,
    onNextFeed,
    onPreviousFeed,
    onNextPost,
    onPreviousPost,
    onTogglePlayPause,
    onOpenSettings,
    onOpenFeedBrowser
  ]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyPress);
      return () => {
        window.removeEventListener('keydown', handleKeyPress);
      };
    }
  }, [enabled, handleKeyPress]);
}

