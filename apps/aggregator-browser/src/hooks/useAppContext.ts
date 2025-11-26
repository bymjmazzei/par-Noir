/**
 * useAppContext Hook
 * Manages context switching between pN identity and feeds
 */

import { useState, useEffect, useCallback } from 'react';
import { FeedService } from '../services/feedService';
import { PNOAuthService, FeedToken } from '../services/pnOAuthService';

export type AppContext = 
  | { type: 'pn', id: string, name: string, pnIdentifier: string }
  | { type: 'feed', id: string, name: string, feedId: string, isOwned: boolean, feedToken?: FeedToken };

export function useAppContext(pnIdentifier?: string) {
  const [activeContext, setActiveContext] = useState<AppContext | null>(null);
  const [availableContexts, setAvailableContexts] = useState<AppContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadContexts = useCallback(async () => {
    if (!pnIdentifier) {
      setAvailableContexts([]);
      setActiveContext(null);
      return;
    }

    setIsLoading(true);
    try {
      console.log('🔄 [useAppContext] Loading contexts for pN:', pnIdentifier);
      
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
        
        console.log('📊 [useAppContext] Loaded owned feeds:', ownedFeedsResult.feeds.length);
        
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

      // Load delegated feeds
      let delegatedFeedContexts: AppContext[] = [];
      try {
        const delegatedFeeds = await FeedService.getDelegatedFeeds(pnIdentifier);
        console.log('📊 [useAppContext] Loaded delegated feeds:', delegatedFeeds.length);
        delegatedFeedContexts = delegatedFeeds.map(f => ({
          type: 'feed' as const,
          id: f.feedId,
          name: f.feedName,
          feedId: f.feedId,
          isOwned: false
        }));
      } catch (err) {
        console.error('❌ [useAppContext] Failed to load delegated feeds:', err);
      }

      const contexts = [
        pnContext,
        ...ownedFeedContexts,
        ...delegatedFeedContexts
      ];

      console.log('✅ [useAppContext] Total contexts loaded:', contexts.length, {
        pn: 1,
        ownedFeeds: ownedFeedContexts.length,
        delegatedFeeds: delegatedFeedContexts.length
      });

      setAvailableContexts(contexts);

      // Set active context to pN if not already set
      if (!activeContext) {
        setActiveContext(pnContext);
      } else {
        // Update active context if it still exists
        const updatedContext = contexts.find(c => 
          c.type === activeContext.type && c.id === activeContext.id
        );
        if (updatedContext) {
          setActiveContext(updatedContext);
        } else {
          // Fallback to pN if active context no longer exists
          setActiveContext(pnContext);
        }
      }
    } catch (error) {
      console.error('Failed to load contexts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pnIdentifier, activeContext]);

  useEffect(() => {
    loadContexts();
  }, [loadContexts]);

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

