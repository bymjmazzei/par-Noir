/**
 * User State Context
 * Manages visitor vs unlocked state, rating preferences, and subscribed feeds
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ContentRating, Feed } from '../types/aggregator';

export interface UserPreferences {
  maxRating: ContentRating;
  ageVerified: boolean;
  verifiedAge?: number;
  subscribedFeedIds: string[]; // Individual feed subscriptions
  subscribedCategories: string[]; // Niche category subscriptions (for curated feed)
  displayName?: string; // User's display name (defaults to nickname)
  profileImageFileId?: string; // FileId of profile image
  userDisplayNames?: Record<string, string>; // Map of creatorId -> displayName (for other users)
}

export interface UserState {
  isUnlocked: boolean;
  pnIdentifier?: string;
  preferences: UserPreferences;
}

interface UserStateContextType {
  userState: UserState;
  setUnlocked: (pnIdentifier: string) => void;
  setLocked: () => void;
  updateMaxRating: (rating: ContentRating) => void;
  setAgeVerified: (age: number) => void;
  subscribeToFeed: (feedId: string) => void;
  unsubscribeFromFeed: (feedId: string) => void;
  isSubscribedToFeed: (feedId: string) => boolean;
  subscribeToCategory: (categoryId: string) => void;
  unsubscribeFromCategory: (categoryId: string) => void;
  isSubscribedToCategory: (categoryId: string) => boolean;
  updateDisplayName: (displayName: string) => void;
  updateProfileImageFileId: (fileId: string) => void;
  setUserDisplayName: (creatorId: string, displayName: string) => void;
  getDisplayName: (creatorId: string, nickname?: string) => string;
}

const defaultPreferences: UserPreferences = {
  maxRating: 'GA',
  ageVerified: false,
  subscribedFeedIds: [],
  subscribedCategories: []
};

const defaultUserState: UserState = {
  isUnlocked: false,
  preferences: defaultPreferences
};

const UserStateContext = createContext<UserStateContextType | undefined>(undefined);

export function UserStateProvider({ children }: { children: ReactNode }) {
  const [userState, setUserState] = useState<UserState>(() => {
    // Load from localStorage on init
    try {
      const stored = localStorage.getItem('pn_user_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure subscribedCategories exists for backward compatibility
        if (!parsed.preferences?.subscribedCategories) {
          parsed.preferences = {
            ...parsed.preferences,
            subscribedCategories: []
          };
        }
        // Migrate old content ratings to new 4-tier system
        if (parsed.preferences?.maxRating) {
          const oldRating = parsed.preferences.maxRating;
          const validRatings: ContentRating[] = ['GA', '18+', 'NSFW', 'X'];
          if (!validRatings.includes(oldRating as ContentRating)) {
            // Map old ratings to new ones
            const ratingMap: Record<string, ContentRating> = {
              'FF': 'GA',
              'T13+': 'GA',
              'YA16+': '18+',
              'M18+': '18+',
              'X18+': 'X'
            };
            parsed.preferences.maxRating = ratingMap[oldRating] || 'GA';
          }
        }
        console.log('Loaded user state from localStorage, subscribedCategories:', parsed.preferences?.subscribedCategories);
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load user state from localStorage:', e);
    }
    console.log('Using default user state');
    return defaultUserState;
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem('pn_user_state', JSON.stringify(userState));
      console.log('Saved user state to localStorage, subscribedCategories:', userState.preferences.subscribedCategories);
    } catch (e) {
      console.warn('Failed to save user state to localStorage:', e);
    }
  }, [userState]);

  // Load preferences from Google Drive when user unlocks (like connections)
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    const loadPreferencesFromDrive = async () => {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          return;
        }

        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const response = await fetch(`${apiEndpoint}/api/users/${userState.pnIdentifier}/preferences`, {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.preferences?.subscribedCategories) {
            setUserState(prev => ({
              ...prev,
              preferences: {
                ...prev.preferences,
                subscribedCategories: data.preferences.subscribedCategories
              }
            }));
            console.log('Loaded preferences from Google Drive:', data.preferences.subscribedCategories);
          }
        } else if (response.status === 404) {
          // Endpoint not deployed yet - just use local state
          console.log('Preferences endpoint not available, using local state');
        }
      } catch (error) {
        console.warn('Failed to load preferences from Google Drive:', error);
      }
    };

    loadPreferencesFromDrive();
  }, [userState.isUnlocked, userState.pnIdentifier]);

  // Check ZKP age verification when user unlocks
  // Also retry after a delay to account for async permission storage
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    // Only check if not already verified
    if (userState.preferences.ageVerified) {
      return;
    }

    const checkZKPAgeVerification = async (retryCount = 0) => {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          // Retry after a delay if no session yet (might be initializing)
          if (retryCount < 3) {
            setTimeout(() => checkZKPAgeVerification(retryCount + 1), 1000 * (retryCount + 1));
          }
          return;
        }

        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        
        // Check if user has granted access to age_attestation ZKP via OAuth endpoint
        // OAuth endpoint only returns ZKP if user has granted access in dashboard
        const zkpResponse = await fetch(
          `${apiEndpoint}/oauth/zkp-data-points?data_points=age_attestation`,
          {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`
            }
          }
        );

        if (zkpResponse.ok) {
          const responseData = await zkpResponse.json();
          console.log('[Age ZKP Check] Response:', responseData);
          const { dataPoints } = responseData;
          console.log('[Age ZKP Check] Data points received:', dataPoints);
          const ageZKP = dataPoints?.find((dp: any) => dp.dataPointId === 'age_attestation');
          console.log('[Age ZKP Check] Age ZKP found:', !!ageZKP, ageZKP);
          
          if (ageZKP) {
            // User has granted access to age ZKP - verify the proof for "age >= 18"
          const verifyResponse = await fetch(
            `${apiEndpoint}/api/users/${userState.pnIdentifier}/zkp-data-points/verify`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.accessToken}`
              },
              body: JSON.stringify({
                dataPointId: 'age_attestation',
                condition: 'age >= 18'
              })
            }
          );

          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            console.log('[Age ZKP Check] Verify response:', verifyData);
            const { verification } = verifyData;
            console.log('[Age ZKP Check] Verification result:', verification);
            
            if (verification && verification.isValid) {
                // Age ZKP is shared and valid (age >= 18) - allow 18+ and NSFW content
                // GA content is always available (no age check needed)
              setUserState(prev => {
                const newState = {
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    ageVerified: true,
                    verifiedAge: 18, // Minimum age, not actual age
                    // Allow 18+ and NSFW if age ZKP is shared and valid
                    // Don't override if user has already set a higher rating
                    maxRating: prev.preferences.maxRating === 'GA' ? 'NSFW' : prev.preferences.maxRating
                  }
                };
                console.log('✅ Age ZKP shared and verified (age >= 18) - 18+ and NSFW content now accessible. New state:', newState);
                return newState;
              });
            } else {
              console.warn('[Age ZKP Check] Verification failed or invalid:', verification);
            }
          } else {
            const errorText = await verifyResponse.text().catch(() => 'Unknown error');
            console.warn('[Age ZKP Check] Verify request failed:', {
              status: verifyResponse.status,
              statusText: verifyResponse.statusText,
              error: errorText
            });
          }
          } else if (retryCount < 2) {
            // Retry after a delay - permissions might still be storing
            console.log(`ℹ️ Age ZKP not found yet, retrying in ${(retryCount + 1) * 2} seconds...`);
            setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000 * (retryCount + 1));
          } else {
            console.log('ℹ️ Age ZKP not shared - only GA content available');
          }
        } else {
          const errorText = await zkpResponse.text().catch(() => 'Unknown error');
          console.warn(`[Age ZKP Check] Failed to check ZKP age verification:`, {
            status: zkpResponse.status,
            statusText: zkpResponse.statusText,
            error: errorText
          });
          
          // Retry on server errors
          if (zkpResponse.status >= 500 && retryCount < 2) {
            setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000 * (retryCount + 1));
          } else if (zkpResponse.status === 404 && retryCount < 1) {
            // User hasn't granted access to age ZKP or doesn't have it
            // Retry once in case permissions are still being stored
            setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000);
          } else {
            console.log('ℹ️ Age ZKP not shared - only GA content available');
          }
        }
      } catch (error) {
        console.error('Error checking ZKP age verification:', error);
        // Retry on error
        if (retryCount < 2) {
          setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000 * (retryCount + 1));
        }
      }
    };

    // Initial check
    checkZKPAgeVerification();
    
    // Also check again after a delay to account for async permission storage
    const delayedCheck = setTimeout(() => {
      if (!userState.preferences.ageVerified) {
        checkZKPAgeVerification(1);
      }
    }, 3000);

    return () => clearTimeout(delayedCheck);
  }, [userState.isUnlocked, userState.pnIdentifier, userState.preferences.ageVerified]);

  const setUnlocked = (pnIdentifier: string) => {
    setUserState(prev => ({
      ...prev,
      isUnlocked: true,
      pnIdentifier
    }));
  };

  const setLocked = () => {
    setUserState(prev => ({
      ...prev,
      isUnlocked: false,
      pnIdentifier: undefined
    }));
  };

  const updateMaxRating = (rating: ContentRating) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        maxRating: rating
      }
    }));
  };

  const setAgeVerified = (age: number) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        ageVerified: true,
        verifiedAge: age
      }
    }));
  };

  const subscribeToFeed = (feedId: string) => {
    setUserState(prev => {
      if (prev.preferences.subscribedFeedIds.includes(feedId)) {
        return prev; // Already subscribed
      }
      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          subscribedFeedIds: [...prev.preferences.subscribedFeedIds, feedId]
        }
      };
    });
  };

  const unsubscribeFromFeed = (feedId: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        subscribedFeedIds: prev.preferences.subscribedFeedIds.filter(id => id !== feedId)
      }
    }));
  };

  const isSubscribedToFeed = (feedId: string): boolean => {
    return userState.preferences.subscribedFeedIds.includes(feedId);
  };

  const subscribeToCategory = (categoryId: string) => {
    setUserState(prev => {
      const currentCategories = prev.preferences.subscribedCategories || [];
      if (currentCategories.includes(categoryId)) {
        console.log('Already subscribed to category:', categoryId);
        return prev; // Already subscribed
      }
      const newCategories = [...currentCategories, categoryId];
      console.log('Subscribing to category:', categoryId, 'New categories:', newCategories);
      const newState = {
        ...prev,
        preferences: {
          ...prev.preferences,
          subscribedCategories: newCategories
        }
      };
      console.log('New user state:', JSON.stringify(newState.preferences.subscribedCategories));
      return newState;
    });
  };

  const unsubscribeFromCategory = (categoryId: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        subscribedCategories: (prev.preferences.subscribedCategories || []).filter(id => id !== categoryId)
      }
    }));
  };

  const isSubscribedToCategory = (categoryId: string): boolean => {
    return (userState.preferences.subscribedCategories || []).includes(categoryId);
  };

  const updateDisplayName = (displayName: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        displayName
      }
    }));
  };

  const updateProfileImageFileId = (fileId: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        profileImageFileId: fileId
      }
    }));
  };

  const setUserDisplayName = (creatorId: string, displayName: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        userDisplayNames: {
          ...(prev.preferences.userDisplayNames || {}),
          [creatorId]: displayName
        }
      }
    }));
  };

  const getDisplayName = (creatorId: string, nickname?: string): string => {
    // If it's the current user, return their display name or nickname or full pN identifier
    if (creatorId === userState.pnIdentifier) {
      return userState.preferences.displayName || nickname || creatorId;
    }

    // Check cache for other users
    const cached = userState.preferences.userDisplayNames?.[creatorId];
    if (cached) {
      return cached;
    }

    // Fallback to nickname or full creatorId (pN identifier)
    return nickname || creatorId;
  };

  return (
    <UserStateContext.Provider
      value={{
        userState,
        setUnlocked,
        setLocked,
        updateMaxRating,
        setAgeVerified,
        subscribeToFeed,
        unsubscribeFromFeed,
        isSubscribedToFeed,
        subscribeToCategory,
        unsubscribeFromCategory,
        isSubscribedToCategory,
        updateDisplayName,
        updateProfileImageFileId,
        setUserDisplayName,
        getDisplayName
      }}
    >
      {children}
    </UserStateContext.Provider>
  );
}

export function useUserState() {
  const context = useContext(UserStateContext);
  if (context === undefined) {
    throw new Error('useUserState must be used within a UserStateProvider');
  }
  return context;
}

