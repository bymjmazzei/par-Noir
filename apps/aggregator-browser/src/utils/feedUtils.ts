/**
 * Feed Utilities
 * Helper functions for feed management and tracking
 */

import { IndexedFile } from '../types/aggregator';

/**
 * Check if a feed has new content since last view
 */
export function hasNewContent(
  feedId: string,
  files: IndexedFile[],
  lastViewedTimestamps: Map<string, string>
): boolean {
  const lastViewed = lastViewedTimestamps.get(feedId);
  if (!lastViewed) return true; // Never viewed = has new content

  return files.some(file => {
    const fileDate = new Date(file.metadata.uploadDate || file.metadata.datePublished || '');
    const lastViewedDate = new Date(lastViewed);
    return fileDate > lastViewedDate;
  });
}

/**
 * Get unseen file count for a feed
 */
export function getUnseenCount(
  feedId: string,
  files: IndexedFile[],
  lastViewedTimestamps: Map<string, string>
): number {
  const lastViewed = lastViewedTimestamps.get(feedId);
  if (!lastViewed) return files.length; // Never viewed = all are unseen

  const lastViewedDate = new Date(lastViewed);
  return files.filter(file => {
    const fileDate = new Date(file.metadata.uploadDate || file.metadata.datePublished || '');
    return fileDate > lastViewedDate;
  }).length;
}

/**
 * Mark feed as viewed (update timestamp)
 */
export function markFeedAsViewed(
  feedId: string,
  timestamps: Map<string, string>
): Map<string, string> {
  const newTimestamps = new Map(timestamps);
  newTimestamps.set(feedId, new Date().toISOString());
  
  // Persist to localStorage
  try {
    const stored = Array.from(newTimestamps.entries());
    localStorage.setItem('pn_feed_viewed_timestamps', JSON.stringify(stored));
  } catch (e) {
    console.warn('Failed to save feed viewed timestamps:', e);
  }
  
  return newTimestamps;
}

/**
 * Load feed viewed timestamps from localStorage
 */
export function loadFeedViewedTimestamps(): Map<string, string> {
  try {
    const stored = localStorage.getItem('pn_feed_viewed_timestamps');
    if (stored) {
      const entries = JSON.parse(stored);
      return new Map(entries);
    }
  } catch (e) {
    console.warn('Failed to load feed viewed timestamps:', e);
  }
  return new Map();
}

