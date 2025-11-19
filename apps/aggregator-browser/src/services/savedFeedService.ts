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
    // No saved posts yet - return empty feed
    return {
      feedId: `saved-${userDid}`,
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

