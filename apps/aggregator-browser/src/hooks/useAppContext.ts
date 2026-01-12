/**
 * useAppContext Hook
 * Manages context switching between pN identity and feeds
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FeedService } from '../services/feedService';
import { PNOAuthService, FeedToken } from '../services/pnOAuthService';

export type AppContext = 
  | { type: 'pn', id: string, name: string, pnIdentifier: string }
  | { type: 'feed', id: string, name: string, feedId: string, isOwned: boolean, feedToken?: FeedToken };

export function useAppContext(pnIdentifier?: string) {
  const [activeContext, setActiveContext] = useState<AppContext | null>(null);
  const [availableContexts, setAvailableContexts] = useState<AppContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false); // Prevent concurrent loads

  const loadContexts = useCallback(async () => {
    if (!pnIdentifier) {
      setAvailableContexts([]);
      setActiveContext(null);
      return;
    }

    // Prevent concurrent loads
    if (isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      
      // Load pN identity context
      const session = PNOAuthService.loadSession();
      const displayName = session?.nickname || 'My pN';
      const pnContext: AppContext = {
        type: 'pn',
        id: pnIdentifier,
        name: displayName,
        pnIdentifier: pnIdentifier
      };

      // Load owned feeds and match with feed tokens from session
      let ownedFeedContexts: AppContext[] = [];
      try {
        const ownedFeedsResult = await FeedService.listFeeds({ 
          creatorId: pnIdentifier,
          limit: 100 
        });
        
        // Removed verbose logging
        
        // Get feed tokens from session
        const feedTokens = session?.feedTokens || [];
        const feedTokensMap = new Map(feedTokens.map(ft => [ft.feedId, ft]));
        
        ownedFeedContexts = ownedFeedsResult.feeds.map(f => ({
          type: 'feed' as const,
          id: f.feedId,
          name: f.feedName,
          feedId: f.feedId,
          isOwned: true,
          feedToken: feedTokensMap.get(f.feedId) // Include feed token if available
        }));
      } catch (err) {
        console.error('❌ [useAppContext] Failed to load owned feeds:', err);
      }

      // Load delegated feeds - only if user has a valid session
      let delegatedFeedContexts: AppContext[] = [];
      if (session?.accessToken) {
        try {
          const delegatedFeeds = await FeedService.getDelegatedFeeds(pnIdentifier);
          delegatedFeedContexts = delegatedFeeds.map(f => ({
            type: 'feed' as const,
            id: f.feedId,
            name: f.feedName,
            feedId: f.feedId,
            isOwned: false
          }));
        } catch (err: any) {
          // Handle 401/403 gracefully - endpoint might not be available or user might not have delegated feeds
          if (err.message?.includes('Not authorized') || err.message?.includes('Invalid token') || err.message?.includes('403') || err.message?.includes('401')) {
            // Silently skip - user might not have delegated feeds or endpoint not available
          } else {
            // Only log unexpected errors
            if (process.env.NODE_ENV === 'development') {
              console.error('❌ [useAppContext] Failed to load delegated feeds:', err);
            }
          }
        }
      }

      const contexts = [
        pnContext,
        ...ownedFeedContexts,
        ...delegatedFeedContexts
      ];

      // Removed verbose logging - only log errors

      setAvailableContexts(contexts);

      // Set active context - only update if it doesn't exist or if current context is no longer available
      setActiveContext(prev => {
        if (!prev) {
          return pnContext;
        }
        // Check if current context still exists in new contexts
        const stillExists = contexts.find(c => 
          c.type === prev.type && c.id === prev.id
        );
        if (stillExists) {
          return prev; // Keep current context
        } else {
          return pnContext; // Fallback to pN if current context no longer exists
        }
      });
    } catch (error) {
      console.error('Failed to load contexts:', error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [pnIdentifier]); // Removed activeContext from dependencies to prevent infinite loop

  useEffect(() => {
    if (pnIdentifier && !isLoadingRef.current) {
      loadContexts();
    }
  }, [pnIdentifier, loadContexts]);

  // Persist active context to localStorage
  useEffect(() => {
    if (activeContext) {
      localStorage.setItem('pn_active_context', JSON.stringify(activeContext));
    }
  }, [activeContext]);

  // Load persisted context on mount
  useEffect(() => {
    if (!activeContext && pnIdentifier) {
      try {
        const stored = localStorage.getItem('pn_active_context');
        if (stored) {
          const parsed = JSON.parse(stored);
          // Verify context still exists in available contexts
          if (parsed.type === 'pn' && parsed.pnIdentifier === pnIdentifier) {
            setActiveContext(parsed);
          }
        }
      } catch (error) {
        console.error('Failed to load persisted context:', error);
      }
    }
  }, [activeContext, pnIdentifier]);

  return {
    activeContext,
    setActiveContext,
    availableContexts,
    loadContexts,
    isLoading
  };
}

