/**
 * Saved Feed Service
 * Manages private curated feeds (saved content)
 */

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      return result.feed || null;
    }

    if (response.status === 404) {
      // No saved feed exists yet
      return null;
    }

    throw new Error('Failed to load saved feed');
  } catch (error) {
    console.error('Failed to get saved feed:', error);
    return null;
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
    const response = await fetch(`${API_ENDPOINT}/api/feeds/saved`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userDid,
        fileId
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save to feed');
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userDid,
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

