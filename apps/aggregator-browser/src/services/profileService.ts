/**
 * Profile Service
 * Manages user profile data (display name, profile image)
 */

import { apiGet, ownerFetch } from './ownerApiFetch';

export interface UserProfile {
  displayName?: string;
  profileImageFileId?: string;
  mlKemPublicKey?: string;
}

// Track ongoing profile requests to prevent duplicate calls
const profileRequestCache = new Map<string, Promise<UserProfile>>();
// Cache successful profile results to avoid re-fetching
const profileResultCache = new Map<string, { profile: UserProfile; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/** Drop cached profile so the next fetch is fresh (e.g. after missing mlKemPublicKey). */
export function invalidateUserProfileCache(userPnIdentifier: string): void {
  profileResultCache.delete(userPnIdentifier);
  profileRequestCache.delete(userPnIdentifier);
}

/**
 * Get user profile (display name and profile image fileId)
 * Uses pn identifier
 */
export async function getUserProfile(userPnIdentifier: string): Promise<UserProfile> {
  // Check if we have a cached result that's still valid
  const cachedResult = profileResultCache.get(userPnIdentifier);
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_DURATION) {
    return cachedResult.profile;
  }

  // Check if there's already an ongoing request for this user
  const cachedRequest = profileRequestCache.get(userPnIdentifier);
  if (cachedRequest) {
    return cachedRequest;
  }

  const request = (async () => {
  try {
    // API uses pn identifier
    // Drive enrichment is optional here: the API falls back to the stored
    // profile, so this must not fail closed on a missing cloud token.
    const response = await apiGet(`/api/profile/${encodeURIComponent(userPnIdentifier)}`);

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
      profileResultCache.set(userPnIdentifier, { profile, timestamp: Date.now() });
      
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
      profileRequestCache.delete(userPnIdentifier);
  }
  })();

  // Cache the request
  profileRequestCache.set(userPnIdentifier, request);
  return request;
}

/**
 * Update display name
 */
export async function updateDisplayName(userPnIdentifier: string, displayName: string): Promise<void> {
  try {
    const response = await ownerFetch('POST', '/api/profile/display-name', {
      userPnIdentifier,
      displayName
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

