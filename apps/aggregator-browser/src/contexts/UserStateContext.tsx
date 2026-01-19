/**
 * User State Context
 * Manages visitor vs unlocked state, rating preferences, and subscribed feeds
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Feed } from '../types/aggregator';
import { accountsCacheService } from '../services/accountsCacheService';
import { TagNormalizationService } from '../services/tagNormalizationService';
import { API_ENDPOINT } from '../config/api';

export interface CuratedFeedPreferences {
  sortOrder: 'time' | 'recommended'; // Default: 'recommended'
  connectionFilter: 'all' | 'connections' | 'not_connections'; // Default: 'all'
}

export interface UserPreferences {
  // Age verification (for NSFW access)
  hasAgeZKP: boolean; // User has age attestation ZKP set up
  isOver18: boolean; // Age ZKP verified to be over 18
  showNSFW: boolean; // User preference to show NSFW content (default: false)
  
  // Feed subscriptions
  subscribedFeedIds: string[]; // Individual feed subscriptions
  subscribedCategories: string[]; // Legacy: Niche category subscriptions (deprecated, use blockedCategories)
  blockedCategories: string[]; // Categories to exclude from curated feed (negative filter)
  
  // Subject niche preferences
  subscribedSubjects: string[]; // Subjects user wants to see (e.g., ["cowboy", "horses"])
  blockedSubjects: string[]; // Subjects user wants to block (e.g., ["football", "sports"])
  
  // Profile
  displayName?: string; // User's display name (defaults to nickname)
  profileImageFileId?: string; // FileId of profile image
  userDisplayNames?: Record<string, string>; // Map of creatorId -> displayName (for other users)
  
  // Curated feed preferences (applies to all public feeds)
  curatedFeedPreferences?: CuratedFeedPreferences;
  
  // Me page sort order
  mePageSortOrder?: 'time' | 'recommended' | 'most_viewed'; // Default: 'recommended'
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
  setAgeZKPStatus: (hasAgeZKP: boolean, isOver18: boolean) => Promise<void>;
  toggleShowNSFW: (show: boolean) => Promise<void>;
  subscribeToFeed: (feedId: string) => void;
  unsubscribeFromFeed: (feedId: string) => void;
  isSubscribedToFeed: (feedId: string) => boolean;
  subscribeToCategory: (categoryId: string) => void; // Legacy function
  unsubscribeFromCategory: (categoryId: string) => void; // Legacy function
  isSubscribedToCategory: (categoryId: string) => boolean; // Legacy function
  blockCategory: (categoryId: string) => void;
  unblockCategory: (categoryId: string) => void;
  isBlockedCategory: (categoryId: string) => boolean;
  subscribeToSubject: (subject: string) => void;
  unsubscribeFromSubject: (subject: string) => void;
  isSubscribedToSubject: (subject: string) => boolean;
  blockSubject: (subject: string) => void;
  unblockSubject: (subject: string) => void;
  isBlockedSubject: (subject: string) => boolean;
  updateDisplayName: (displayName: string) => void;
  updateProfileImageFileId: (fileId: string) => void;
  setUserDisplayName: (creatorId: string, displayName: string) => void;
  getDisplayName: (creatorId: string, nickname?: string) => string;
  updateCuratedFeedPreferences: (preferences: CuratedFeedPreferences) => Promise<void>;
  updateMePageSortOrder: (sortOrder: 'time' | 'recommended' | 'most_viewed') => Promise<void>;
}

const defaultPreferences: UserPreferences = {
  hasAgeZKP: false,
  isOver18: false,
  showNSFW: false,
  subscribedFeedIds: [],
  subscribedCategories: [],
  blockedCategories: [],
  subscribedSubjects: [],
  blockedSubjects: [],
  curatedFeedPreferences: {
    sortOrder: 'recommended',
    connectionFilter: 'all'
  }
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
        // Ensure subject preferences exist for backward compatibility
        if (!parsed.preferences?.subscribedSubjects) {
          parsed.preferences = {
            ...parsed.preferences,
            subscribedSubjects: []
          };
        }
        if (!parsed.preferences?.blockedSubjects) {
          parsed.preferences = {
            ...parsed.preferences,
            blockedSubjects: []
          };
        }
        // Ensure blockedCategories exists for backward compatibility
        if (!parsed.preferences?.blockedCategories) {
          parsed.preferences = {
            ...parsed.preferences,
            blockedCategories: []
          };
        }
        // Ensure curatedFeedPreferences exists for backward compatibility
        if (!parsed.preferences?.curatedFeedPreferences) {
          parsed.preferences = {
            ...parsed.preferences,
            curatedFeedPreferences: {
              sortOrder: 'recommended',
              connectionFilter: 'all'
            }
          };
        }
        // Ensure mePageSortOrder exists for backward compatibility
        if (parsed.preferences?.mePageSortOrder === undefined) {
          parsed.preferences = {
            ...parsed.preferences,
            mePageSortOrder: 'recommended'
          };
        }
        // Migrate old rating preferences to new NSFW system
        // Remove old maxRating, ageVerified, verifiedAge if they exist
        if (parsed.preferences) {
          // Initialize new fields if not present
          if (parsed.preferences.hasAgeZKP === undefined) {
            parsed.preferences.hasAgeZKP = false;
          }
          if (parsed.preferences.isOver18 === undefined) {
            parsed.preferences.isOver18 = false;
          }
          if (parsed.preferences.showNSFW === undefined) {
            parsed.preferences.showNSFW = false;
          }
          // Remove old fields
          delete parsed.preferences.maxRating;
          delete parsed.preferences.ageVerified;
          delete parsed.preferences.verifiedAge;
        }
        // Debug logging removed for cleaner console
        // console.log('Loaded user state from localStorage, subscribedCategories:', parsed.preferences?.subscribedCategories);
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load user state from localStorage:', e);
    }
    // Debug logging removed for cleaner console
    // console.log('Using default user state');
    return defaultUserState;
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem('pn_user_state', JSON.stringify(userState));
      // Debug logging removed for cleaner console
      // console.log('Saved user state to localStorage, subscribedCategories:', userState.preferences.subscribedCategories);
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

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/preferences`, {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.preferences) {
            setUserState(prev => {
              const localBlockedCategories = prev.preferences.blockedCategories || [];
              const apiBlockedCategories = data.preferences.blockedCategories;
              
              // Preserve local blockedCategories if API doesn't provide it or returns empty array
              // Only use API value if it's a non-empty array
              const finalBlockedCategories = (apiBlockedCategories !== undefined && Array.isArray(apiBlockedCategories) && apiBlockedCategories.length > 0)
                ? apiBlockedCategories
                : localBlockedCategories; // Preserve local state
              
              const updatedPreferences = {
                ...prev.preferences,
                // Only update if API provides these values (preserve local state if not provided)
                ...(data.preferences.subscribedCategories !== undefined && { subscribedCategories: data.preferences.subscribedCategories }),
                blockedCategories: finalBlockedCategories, // Always set (either from API or preserve local)
                ...(data.preferences.subscribedSubjects !== undefined && { subscribedSubjects: data.preferences.subscribedSubjects }),
                ...(data.preferences.blockedSubjects !== undefined && { blockedSubjects: data.preferences.blockedSubjects }),
                ...(data.preferences.hasAgeZKP !== undefined && { hasAgeZKP: data.preferences.hasAgeZKP }),
                ...(data.preferences.isOver18 !== undefined && { isOver18: data.preferences.isOver18 }),
                ...(data.preferences.showNSFW !== undefined && { showNSFW: data.preferences.showNSFW }),
                ...(data.preferences.curatedFeedPreferences !== undefined && { curatedFeedPreferences: data.preferences.curatedFeedPreferences }),
                ...(data.preferences.mePageSortOrder !== undefined && { mePageSortOrder: data.preferences.mePageSortOrder })
              };
              
              
              return {
                ...prev,
                preferences: updatedPreferences
              };
            });
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

  // Load tag preferences from backend when user unlocks
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    const loadTagPreferences = async () => {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/tag-preferences`, {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.preferences && Array.isArray(data.preferences)) {
            // Extract subscribed and blocked subjects from tag preferences
            const subscribedTags: string[] = [];
            const blockedTags: string[] = [];

            data.preferences.forEach((pref: any) => {
              if (pref.preference === 'like' || pref.preference === 'subscribe') {
                subscribedTags.push(pref.tagId);
              } else if (pref.preference === 'dislike' || pref.preference === 'block') {
                blockedTags.push(pref.tagId);
              }
            });

            // Update local state with loaded preferences
            setUserState(prev => ({
              ...prev,
              preferences: {
                ...prev.preferences,
                subscribedSubjects: [...new Set([...prev.preferences.subscribedSubjects, ...subscribedTags])],
                blockedSubjects: [...new Set([...prev.preferences.blockedSubjects, ...blockedTags])]
              }
            }));

          }
        } else if (response.status === 404) {
          // Endpoint not deployed yet - just use local state
          console.log('Tag preferences endpoint not available, using local state');
        }
      } catch (error) {
        console.warn('Failed to load tag preferences from backend:', error);
      }
    };

    loadTagPreferences();
  }, [userState.isUnlocked, userState.pnIdentifier]);

  // Check ZKP age verification when user unlocks
  // Also retry after a delay to account for async permission storage
  useEffect(() => {
    if (!userState.isUnlocked || !userState.pnIdentifier) {
      return;
    }

    // Only check if not already checked
    if (userState.preferences.hasAgeZKP) {
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

        // Check if user has granted access to age_attestation ZKP via OAuth endpoint
        // OAuth endpoint only returns ZKP if user has granted access in dashboard
        const zkpResponse = await fetch(
          `${API_ENDPOINT}/oauth/zkp-data-points?data_points=age_attestation`,
          {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`
            }
          }
        );

        if (zkpResponse.ok) {
          const responseData = await zkpResponse.json();
          const { dataPoints } = responseData;
          const ageZKP = dataPoints?.find((dp: any) => dp.dataPointId === 'age_attestation');
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[Age ZKP Check] Response:', responseData);
            console.log('[Age ZKP Check] Data points received:', dataPoints);
            console.log('[Age ZKP Check] Age ZKP found:', !!ageZKP, ageZKP);
          }
          
          if (ageZKP) {
            // User has granted access to age ZKP - verify the proof for "age >= 18"
          const verifyResponse = await fetch(
            `${API_ENDPOINT}/api/users/${userState.pnIdentifier}/zkp-data-points/verify`,
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
            const { verification } = verifyData;
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[Age ZKP Check] Verify response:', verifyData);
              console.log('[Age ZKP Check] Verification result:', verification);
            }
            
            if (verification && verification.isValid) {
                // Age ZKP is shared and valid (age >= 18) - user can access NSFW content
              setUserState(prev => {
                const newState = {
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    hasAgeZKP: true,
                    isOver18: true,
                    // showNSFW defaults to false even if eligible - user must toggle it
                    showNSFW: prev.preferences.showNSFW || false
                  }
                };
                if (process.env.NODE_ENV === 'development') {
                  console.log('✅ Age ZKP shared and verified (age >= 18) - NSFW content now accessible. New state:', newState);
                }
                return newState;
              });
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[Age ZKP Check] Verification failed or invalid:', verification);
              }
            }
          } else {
            const errorText = await verifyResponse.text().catch(() => 'Unknown error');
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Age ZKP Check] Verify request failed:', {
                status: verifyResponse.status,
                statusText: verifyResponse.statusText,
                error: errorText
              });
            }
          }
          } else if (retryCount < 2) {
            // Retry after a delay - permissions might still be storing
            if (process.env.NODE_ENV === 'development') {
              console.log(`ℹ️ Age ZKP not found yet, retrying in ${(retryCount + 1) * 2} seconds...`);
            }
            setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000 * (retryCount + 1));
          }
          // Age ZKP not shared - silently continue
        } else {
          // Handle 401/403 as expected - user not authenticated or token expired
          if (zkpResponse.status === 401 || zkpResponse.status === 403) {
            // Silently handle - user is not authenticated or token expired
            if (retryCount === 0) {
              // Only log once, not on retries
              if (process.env.NODE_ENV === 'development') {
                console.log('ℹ️ Age ZKP check skipped - user not authenticated or token expired');
              }
            }
            // Age ZKP not available - user not authenticated
            setUserState(prev => ({
              ...prev,
              preferences: {
                ...prev.preferences,
                hasAgeZKP: false,
                isOver18: false
              }
            }));
            return;
          }
          
          // Retry on server errors (500+)
          if (zkpResponse.status >= 500 && retryCount < 2) {
            if (process.env.NODE_ENV === 'development') {
              const errorText = await zkpResponse.text().catch(() => 'Unknown error');
              console.warn(`[Age ZKP Check] Server error, retrying:`, {
                status: zkpResponse.status,
                error: errorText
              });
            }
            setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000 * (retryCount + 1));
          } else if (zkpResponse.status === 404 && retryCount < 1) {
            // User hasn't granted access to age ZKP or doesn't have it
            // Retry once in case permissions are still being stored
            setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000);
          } else {
            // Age ZKP not shared
            setUserState(prev => ({
              ...prev,
              preferences: {
                ...prev.preferences,
                hasAgeZKP: false,
                isOver18: false,
                showNSFW: false
              }
            }));
          }
        }
      } catch (error) {
        console.error('Error checking ZKP age verification:', error);
        // Retry on error
        if (retryCount < 2) {
          setTimeout(() => checkZKPAgeVerification(retryCount + 1), 2000 * (retryCount + 1));
        } else {
          // Final retry failed - assume no age ZKP
          setUserState(prev => ({
            ...prev,
            preferences: {
              ...prev.preferences,
              hasAgeZKP: false,
              isOver18: false,
              showNSFW: false
            }
          }));
        }
      }
    };

    // Initial check
    checkZKPAgeVerification();
    
    // Also check again after a delay to account for async permission storage
    const delayedCheck = setTimeout(() => {
      if (!userState.preferences.hasAgeZKP) {
        checkZKPAgeVerification(1);
      }
    }, 3000);

    return () => clearTimeout(delayedCheck);
  }, [userState.isUnlocked, userState.pnIdentifier, userState.preferences.hasAgeZKP]);

  const setUnlocked = (pnIdentifier: string) => {
    setUserState(prev => ({
      ...prev,
      isUnlocked: true,
      pnIdentifier
    }));
  };

  const setLocked = () => {
    // Clear accounts cache on logout
    accountsCacheService.clearAll();
    setUserState(prev => ({
      ...prev,
      isUnlocked: false,
      pnIdentifier: undefined
    }));
  };

  const setAgeZKPStatus = async (hasAgeZKP: boolean, isOver18: boolean) => {
    // Update local state immediately
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        hasAgeZKP,
        isOver18,
        // Reset showNSFW if user is not over 18
        showNSFW: isOver18 ? prev.preferences.showNSFW : false
      }
    }));

    // Save to Google Drive if user is unlocked
    if (userState.isUnlocked && userState.pnIdentifier) {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          console.warn('No access token, cannot save age ZKP status to Google Drive');
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            hasAgeZKP,
            isOver18
          })
        });

        if (response.ok) {
          console.log('✅ Saved age ZKP status to Google Drive:', { hasAgeZKP, isOver18 });
        } else if (response.status === 404) {
          console.warn('Preferences endpoint not available, keeping local state only');
        } else {
          console.warn('Failed to save age ZKP status to Google Drive:', response.status);
        }
      } catch (error) {
        console.warn('Error saving age ZKP status to Google Drive:', error);
      }
    }
  };

  const toggleShowNSFW = async (show: boolean) => {
    // Only allow toggling if user has age ZKP and is over 18
    if (!userState.preferences.hasAgeZKP || !userState.preferences.isOver18) {
      console.warn('Cannot toggle NSFW - user does not have age ZKP or is not over 18');
      return;
    }

    // Update local state immediately
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        showNSFW: show
      }
    }));

    // Save to Google Drive if user is unlocked
    if (userState.isUnlocked && userState.pnIdentifier) {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          console.warn('No access token, cannot save showNSFW preference to Google Drive');
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            showNSFW: show
          })
        });

        if (response.ok) {
          console.log('✅ Saved showNSFW preference to Google Drive:', show);
        } else if (response.status === 404) {
          console.warn('Preferences endpoint not available, keeping local state only');
        } else {
          console.warn('Failed to save showNSFW preference to Google Drive:', response.status);
        }
      } catch (error) {
        console.warn('Error saving showNSFW preference to Google Drive:', error);
      }
    }
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

  const blockCategory = (categoryId: string) => {
    setUserState(prev => {
      const currentBlocked = prev.preferences.blockedCategories || [];
      if (currentBlocked.includes(categoryId)) {
        return prev; // Already blocked
      }
      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          blockedCategories: [...currentBlocked, categoryId]
        }
      };
    });
  };

  const unblockCategory = (categoryId: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        blockedCategories: (prev.preferences.blockedCategories || []).filter(id => id !== categoryId)
      }
    }));
  };

  const isBlockedCategory = (categoryId: string): boolean => {
    return (userState.preferences.blockedCategories || []).includes(categoryId);
  };

  const subscribeToSubject = async (subject: string) => {
    // Normalize tag
    const normalizedTag = TagNormalizationService.normalizeTagWithProvenance(
      subject,
      'user',
      'preference_tile_yes',
      userState.pnIdentifier
    );
    const normalizedSubject = normalizedTag.id;

    // Update local state immediately
    setUserState(prev => {
      const currentSubjects = prev.preferences.subscribedSubjects || [];
      if (currentSubjects.includes(normalizedSubject)) {
        return prev; // Already subscribed
      }
      // Remove from blocked if it's there
      const updatedBlocked = (prev.preferences.blockedSubjects || []).filter(s => s !== normalizedSubject);
      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          subscribedSubjects: [...currentSubjects, normalizedSubject],
          blockedSubjects: updatedBlocked
        }
      };
    });

    // Persist to backend if user is unlocked
    if (userState.isUnlocked && userState.pnIdentifier) {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          console.warn('No access token, cannot save tag preference to backend');
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/tag-preferences`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            tagId: normalizedSubject,
            preference: 'subscribe',
            action: 'preference_tile_yes',
            confidence: 0.8
          })
        });

        if (response.ok) {
          console.log('✅ Saved tag preference to backend:', normalizedSubject);
        } else if (response.status === 404) {
          console.warn('Tag preferences endpoint not available, keeping local state only');
        } else {
          console.warn('Failed to save tag preference to backend:', response.status);
        }
      } catch (error) {
        console.warn('Error saving tag preference to backend:', error);
      }
    }
  };

  const unsubscribeFromSubject = (subject: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        subscribedSubjects: (prev.preferences.subscribedSubjects || []).filter(s => s !== subject.toLowerCase().trim())
      }
    }));
  };

  const isSubscribedToSubject = (subject: string): boolean => {
    return (userState.preferences.subscribedSubjects || []).includes(subject.toLowerCase().trim());
  };

  const blockSubject = async (subject: string) => {
    // Normalize tag
    const normalizedTag = TagNormalizationService.normalizeTagWithProvenance(
      subject,
      'user',
      'preference_tile_no',
      userState.pnIdentifier
    );
    const normalizedSubject = normalizedTag.id;

    // Update local state immediately
    setUserState(prev => {
      const currentBlocked = prev.preferences.blockedSubjects || [];
      if (currentBlocked.includes(normalizedSubject)) {
        return prev; // Already blocked
      }
      // Remove from subscribed if it's there
      const updatedSubscribed = (prev.preferences.subscribedSubjects || []).filter(s => s !== normalizedSubject);
      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          blockedSubjects: [...currentBlocked, normalizedSubject],
          subscribedSubjects: updatedSubscribed
        }
      };
    });

    // Persist to backend if user is unlocked
    if (userState.isUnlocked && userState.pnIdentifier) {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          console.warn('No access token, cannot save tag preference to backend');
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/tag-preferences`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            tagId: normalizedSubject,
            preference: 'block',
            action: 'preference_tile_no',
            confidence: 0.8
          })
        });

        if (response.ok) {
          console.log('✅ Saved tag preference to backend:', normalizedSubject);
        } else if (response.status === 404) {
          console.warn('Tag preferences endpoint not available, keeping local state only');
        } else {
          console.warn('Failed to save tag preference to backend:', response.status);
        }
      } catch (error) {
        console.warn('Error saving tag preference to backend:', error);
      }
    }
  };

  const unblockSubject = (subject: string) => {
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        blockedSubjects: (prev.preferences.blockedSubjects || []).filter(s => s !== subject.toLowerCase().trim())
      }
    }));
  };

  const isBlockedSubject = (subject: string): boolean => {
    return (userState.preferences.blockedSubjects || []).includes(subject.toLowerCase().trim());
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

  const updateCuratedFeedPreferences = async (preferences: CuratedFeedPreferences) => {
    // Update local state immediately
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        curatedFeedPreferences: preferences
      }
    }));

    // Save to Google Drive if user is unlocked
    if (userState.isUnlocked && userState.pnIdentifier) {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          console.warn('No access token, cannot save curated feed preferences to Google Drive');
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            curatedFeedPreferences: preferences
          })
        });

        if (response.ok) {
          console.log('Successfully saved curated feed preferences to Google Drive');
        } else if (response.status === 404) {
          console.warn('Preferences endpoint not available yet, keeping local state only');
        } else {
          console.warn('Failed to save curated feed preferences to Google Drive:', response.status);
        }
      } catch (error: any) {
        console.warn('Could not save curated feed preferences to Google Drive:', error);
      }
    }
  };

  const updateMePageSortOrder = async (sortOrder: 'time' | 'recommended' | 'most_viewed') => {
    // Update local state immediately
    setUserState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        mePageSortOrder: sortOrder
      }
    }));

    // Save to Google Drive if user is unlocked
    if (userState.isUnlocked && userState.pnIdentifier) {
      try {
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) {
          console.warn('No access token, cannot save me page sort order to Google Drive');
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/users/${userState.pnIdentifier}/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            mePageSortOrder: sortOrder
          })
        });

        if (response.ok) {
          console.log('Successfully saved me page sort order to Google Drive');
        } else if (response.status === 404) {
          console.warn('Preferences endpoint not available yet, keeping local state only');
        } else {
          console.warn('Failed to save me page sort order to Google Drive:', response.status);
        }
      } catch (error: any) {
        console.warn('Could not save me page sort order to Google Drive:', error);
      }
    }
  };

  return (
    <UserStateContext.Provider
      value={{
        userState,
        setUnlocked,
        setLocked,
        setAgeZKPStatus,
        toggleShowNSFW,
        subscribeToFeed,
        unsubscribeFromFeed,
        isSubscribedToFeed,
        subscribeToCategory,
        unsubscribeFromCategory,
        isSubscribedToCategory,
        blockCategory,
        unblockCategory,
        isBlockedCategory,
        subscribeToSubject,
        unsubscribeFromSubject,
        isSubscribedToSubject,
        blockSubject,
        unblockSubject,
        isBlockedSubject,
        updateDisplayName,
        updateProfileImageFileId,
        setUserDisplayName,
        getDisplayName,
        updateCuratedFeedPreferences,
        updateMePageSortOrder
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

