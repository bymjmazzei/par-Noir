/**
 * Profile Service
 * Manages user profile data (display name, profile image)
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

export interface UserProfile {
  displayName?: string;
  profileImageFileId?: string;
}

/**
 * Get user profile (display name and profile image fileId)
 */
export async function getUserProfile(userDid: string): Promise<UserProfile> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/profile/${userDid}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      return { displayName: null, profileImageFileId: null };
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get user profile:', error);
    return { displayName: null, profileImageFileId: null };
  }
}

/**
 * Update display name
 */
export async function updateDisplayName(userDid: string, displayName: string): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/profile/display-name`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid,
        displayName
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update display name' }));
      throw new Error(error.error || 'Failed to update display name');
    }
  } catch (error) {
    console.error('Failed to update display name:', error);
    throw error;
  }
}

