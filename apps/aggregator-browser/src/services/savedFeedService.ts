/**
 * Saved Feed Service
 * Manages private curated feeds (saved content)
 */

import { PNOAuthService } from './pnOAuthService';

import { API_ENDPOINT } from '../config/api';

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const session = PNOAuthService.loadSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  
  return headers;
}

export interface SavedFeed {
  feedId: string;
  feedName: string;
  fileIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Get user's saved feed (private curated feed)
 */
export async function getSavedFeed(userPnIdentifier: string): Promise<SavedFeed | null> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/saved?userPnIdentifier=${userPnIdentifier}`, {
      headers: getAuthHeaders()
    });

    if (response.ok) {
      const result = await response.json();
      return result.feed || null;
    }

    if (response.status === 404) {
      // No saved posts yet - return empty feed
      return {
        feedId: `saved-${userPnIdentifier}`,
        feedName: 'Saved',
        fileIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // For 500 or other errors, throw so backoff logic can work
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
  }
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
    const response = await fetch(`${API_ENDPOINT}/api/feeds/saved/add`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier,
        fileId
      })
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
        requestBody
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
    const response = await fetch(`${API_ENDPOINT}/api/feeds/saved`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier,
        fileId
      })
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
    const savedFeed = await getSavedFeed(userPnIdentifier);
    return savedFeed?.fileIds.includes(fileId) || false;
  } catch (error) {
    console.error('Failed to check if file is saved:', error);
    return false;
  }
}

