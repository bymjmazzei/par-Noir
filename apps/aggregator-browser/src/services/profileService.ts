/**
 * Profile Service
 * Manages user profile data (display name, profile image)
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

export interface UserProfile {
  displayName?: string;
  profileImageFileId?: string;
}

// Track ongoing profile requests to prevent duplicate calls
const profileRequestCache = new Map<string, Promise<UserProfile>>();
// Cache successful profile results to avoid re-fetching
const profileResultCache = new Map<string, { profile: UserProfile; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get user profile (display name and profile image fileId)
 * Accepts both pN identifiers (pn-{hash}) and DIDs (did:key:...)
 */
export async function getUserProfile(userDid: string): Promise<UserProfile> {
  // Check if we have a cached result that's still valid
  const cachedResult = profileResultCache.get(userDid);
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_DURATION) {
    return cachedResult.profile;
  }

  // Check if there's already an ongoing request for this user
  const cachedRequest = profileRequestCache.get(userDid);
  if (cachedRequest) {
    return cachedRequest;
  }

  const request = (async () => {
  try {
    // API now handles both pN identifiers and DIDs
    // No need to skip any format - let the API handle the lookup
    const response = await fetch(`${API_ENDPOINT}/api/profile/${encodeURIComponent(userDid)}`, {
      headers: getAuthHeaders()
    });

      if (response.status === 429) {
        // Rate limited - return cached result if available, otherwise empty profile
        if (cachedResult) {
          return cachedResult.profile;
        }
        console.warn('Rate limited (429) when loading profile, skipping');
        return { displayName: undefined, profileImageFileId: undefined };
      }

    if (!response.ok) {
        // Return cached result if available, otherwise empty
        if (cachedResult) {
          return cachedResult.profile;
        }
        return { displayName: undefined, profileImageFileId: undefined };
    }

      const profile = await response.json();
      
      // Cache successful result
      profileResultCache.set(userDid, { profile, timestamp: Date.now() });
      
      return profile;
  } catch (error) {
      // Return cached result if available, otherwise empty
      if (cachedResult) {
        return cachedResult.profile;
      }
      // Silently return empty - profile may not exist
      return { displayName: undefined, profileImageFileId: undefined };
    } finally {
      // Remove from request cache after request completes
      profileRequestCache.delete(userDid);
  }
  })();

  // Cache the request
  profileRequestCache.set(userDid, request);
  return request;
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

