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
 * Accepts both pN identifiers (pn-{hash}) and DIDs (did:key:...)
 */
export async function getUserProfile(userDid: string): Promise<UserProfile> {
  try {
    // API now handles both pN identifiers and DIDs
    // No need to skip any format - let the API handle the lookup
    const response = await fetch(`${API_ENDPOINT}/api/profile/${encodeURIComponent(userDid)}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      return { displayName: null, profileImageFileId: null };
    }

    return await response.json();
  } catch (error) {
    // Silently return null - profile may not exist
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

