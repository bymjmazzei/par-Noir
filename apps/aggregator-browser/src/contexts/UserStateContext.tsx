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

