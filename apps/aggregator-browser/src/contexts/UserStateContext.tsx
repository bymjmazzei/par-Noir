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
  subscribedFeedIds: string[];
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
}

const defaultPreferences: UserPreferences = {
  maxRating: 'T13+',
  ageVerified: false,
  subscribedFeedIds: []
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
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load user state from localStorage:', e);
    }
    return defaultUserState;
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem('pn_user_state', JSON.stringify(userState));
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
        isSubscribedToFeed
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

