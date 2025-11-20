/**
 * Saved Feed Service
 * Manages private curated feeds (saved content)
 */

import { PNOAuthService } from './pnOAuthService';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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
export async function getSavedFeed(userDid: string): Promise<SavedFeed | null> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/saved?userDid=${userDid}`, {
      headers: getAuthHeaders()
    });

    if (response.ok) {
      const result = await response.json();
      return result.feed || null;
    }

    if (response.status === 404) {
      // Check local storage as fallback
      const localFeed = getLocalSavedFeed(userDid);
      if (localFeed) {
        return localFeed;
      }
      
      // No saved posts yet - return empty feed
      return {
        feedId: `saved-${userDid}`,
        feedName: 'Saved',
        fileIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // For 500 or other errors, try local storage as fallback
    if (response.status === 500) {
      const localFeed = getLocalSavedFeed(userDid);
      if (localFeed) {
        console.warn('API error, using local saved feed as fallback');
        return localFeed;
      }
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
    // If fetch fails entirely, try local storage
    const localFeed = getLocalSavedFeed(userDid);
    if (localFeed) {
      console.warn('Network error, using local saved feed as fallback');
      return localFeed;
    }
    throw error;
  }
}

/**
 * Get local saved feed from localStorage (fallback when API fails)
 */
function getLocalSavedFeed(userDid: string): SavedFeed | null {
  try {
    const key = `saved_feed_${userDid}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load local saved feed:', e);
  }
  return null;
}

/**
 * Save to local storage (fallback when API fails)
 */
function saveLocalSavedFeed(userDid: string, feed: SavedFeed): void {
  try {
    const key = `saved_feed_${userDid}`;
    localStorage.setItem(key, JSON.stringify(feed));
  } catch (e) {
    console.warn('Failed to save local saved feed:', e);
  }
}

/**
 * Create or update saved feed with a file
 */
export async function saveToFeed(
  userDid: string,
  fileId: string
): Promise<SavedFeed> {
  try {
    // The API expects pnIdentifier (not DID) based on the error
    // userDid parameter is actually the pnIdentifier from userState
    const requestBody = {
      userDid: userDid, // This is the pnIdentifier (e.g., "83c1db813607")
      fileId: fileId
    };
    
    console.log('Saving to feed:', { userDid, fileId, requestBody });
    
    const response = await fetch(`${API_ENDPOINT}/api/feeds/saved`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      // If API fails with JSON error, use local storage as fallback
      if (response.status === 500) {
        const errorText = await response.text().catch(() => '');
        if (errorText.includes('invalid input syntax for type json')) {
          console.warn('API has JSON syntax error, using local storage fallback');
          
          // Get existing local feed or create new one
          let localFeed = getLocalSavedFeed(userDid);
          if (!localFeed) {
            localFeed = {
              feedId: `saved-${userDid}`,
              feedName: 'Saved',
              fileIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
          
          // Add fileId if not already present
          if (!localFeed.fileIds.includes(fileId)) {
            localFeed.fileIds.push(fileId);
            localFeed.updatedAt = new Date().toISOString();
            saveLocalSavedFeed(userDid, localFeed);
          }
          
          return localFeed;
        }
      }
      
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
  userDid: string,
  fileId: string
): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/saved`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid,
        fileId
      })
    });

    if (!response.ok) {
      // If API fails, update local storage as fallback
      if (response.status === 500) {
        const errorText = await response.text().catch(() => '');
        if (errorText.includes('invalid input syntax for type json')) {
          console.warn('API has JSON syntax error, using local storage fallback');
          
          const localFeed = getLocalSavedFeed(userDid);
          if (localFeed) {
            localFeed.fileIds = localFeed.fileIds.filter(id => id !== fileId);
            localFeed.updatedAt = new Date().toISOString();
            saveLocalSavedFeed(userDid, localFeed);
            return;
          }
        }
      }
      throw new Error('Failed to remove from saved feed');
    }
  } catch (error) {
    // If fetch fails, try local storage
    const localFeed = getLocalSavedFeed(userDid);
    if (localFeed) {
      localFeed.fileIds = localFeed.fileIds.filter(id => id !== fileId);
      localFeed.updatedAt = new Date().toISOString();
      saveLocalSavedFeed(userDid, localFeed);
      return;
    }
    console.error('Failed to remove from saved feed:', error);
    throw error;
  }
}

/**
 * Check if file is saved in user's feed
 */
export async function isFileSaved(
  userDid: string,
  fileId: string
): Promise<boolean> {
  try {
    const savedFeed = await getSavedFeed(userDid);
    return savedFeed?.fileIds.includes(fileId) || false;
  } catch (error) {
    console.error('Failed to check if file is saved:', error);
    return false;
  }
}

