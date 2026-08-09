/**
 * Saved Feed Service
 * Manages private curated feeds (saved content)
 */

import { apiFetch, apiGet } from './ownerApiFetch';

export interface SavedFeed {
  feedId: string;
  feedName: string;
  fileIds: string[];
  createdAt: string;
  updatedAt: string;
}

const SAVED_FEED_TTL_MS = 30_000;
const savedFeedCache = new Map<string, { result: SavedFeed | null; ts: number }>();
const pendingSavedFeed = new Map<string, Promise<SavedFeed | null>>();

/**
 * Get user's saved feed (private curated feed)
 */
export async function getSavedFeed(userPnIdentifier: string): Promise<SavedFeed | null> {
  const cached = savedFeedCache.get(userPnIdentifier);
  if (cached && Date.now() - cached.ts < SAVED_FEED_TTL_MS) {
    return cached.result;
  }

  const pending = pendingSavedFeed.get(userPnIdentifier);
  if (pending) return pending;

  const fetchPromise = (async (): Promise<SavedFeed | null> => {
    try {
      const response = await apiGet(`/api/feeds/saved?userPnIdentifier=${userPnIdentifier}`);

      if (response.ok) {
        const result = await response.json();
        const feed: SavedFeed | null = result.feed || null;
        savedFeedCache.set(userPnIdentifier, { result: feed, ts: Date.now() });
        return feed;
      }

      if (response.status === 404) {
        const empty: SavedFeed = {
          feedId: `saved-${userPnIdentifier}`,
          feedName: 'Saved',
          fileIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        savedFeedCache.set(userPnIdentifier, { result: empty, ts: Date.now() });
        return empty;
      }

      const errorText = await response.text();
      let errorMessage = `Failed to load saved feed: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      throw error;
    } catch (error) {
      throw error;
    } finally {
      pendingSavedFeed.delete(userPnIdentifier);
    }
  })();

  pendingSavedFeed.set(userPnIdentifier, fetchPromise);
  return fetchPromise;
}

/**
 * Create or update saved feed with a file
 */
export async function saveToFeed(
  userPnIdentifier: string,
  fileId: string
): Promise<SavedFeed> {
  try {
    // The API expects pnIdentifier
    const response = await apiFetch('POST', '/api/feeds/saved', {
      userPnIdentifier,
      fileId
    });

    if (!response.ok) {
      // Try to get error message from response
      let errorMessage = `Failed to save to feed: ${response.status}`;
      let errorDetails: any = null;
      try {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
          errorDetails = errorJson;
        } catch {
          errorMessage = errorText || errorMessage;
        }
      } catch {
        // If we can't parse the error, use the status
      }
      console.error('Save to feed error:', {
        status: response.status,
        statusText: response.statusText,
        errorMessage,
        errorDetails,
        requestBody: { userPnIdentifier, fileId }
      });
      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result.feed;
  } catch (error) {
    console.error('Failed to save to feed:', error);
    throw error;
  }
}

/**
 * Remove file from saved feed
 */
export async function removeFromSavedFeed(
  userPnIdentifier: string,
  fileId: string
): Promise<void> {
  try {
    const response = await apiFetch('DELETE', '/api/feeds/saved', {
      userPnIdentifier,
      fileId
    });

    if (!response.ok) {
      throw new Error('Failed to remove from saved feed');
    }
  } catch (error) {
    console.error('Failed to remove from saved feed:', error);
    throw error;
  }
}

/**
 * Check if file is saved in user's feed
 */
export async function isFileSaved(
  userPnIdentifier: string,
  fileId: string
): Promise<boolean> {
  try {
    const cached = savedFeedCache.get(userPnIdentifier);
    if (cached && Date.now() - cached.ts < SAVED_FEED_TTL_MS) {
      return cached.result?.fileIds.includes(fileId) ?? false;
    }
    const savedFeed = await getSavedFeed(userPnIdentifier);
    return savedFeed?.fileIds.includes(fileId) || false;
  } catch (error) {
    console.error('Failed to check if file is saved:', error);
    return false;
  }
}

