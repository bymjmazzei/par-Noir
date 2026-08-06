/**
 * useAppContext Hook
 * Manages context switching between pN identity and controlled feed subs (owned + delegated)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Feed } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { PNOAuthService, FeedToken } from '../services/pnOAuthService';

export type AppContext =
  | { type: 'pn'; id: string; name: string; pnIdentifier: string }
  | { type: 'feed'; id: string; name: string; feedId: string; isOwned: boolean; feedToken?: FeedToken };

export interface UseAppContextOptions {
  /** Kept for call-site compatibility; controlled feeds no longer use catalog as lock-menu source. */
  catalogReady?: boolean;
  /** Load delegated feed contexts (deferred until context menu opens). */
  includeDelegated?: boolean;
}

export function useAppContext(
  pnIdentifier?: string,
  _catalogFeeds?: Feed[],
  options: UseAppContextOptions = {}
) {
  const { includeDelegated = false } = options;
  const [activeContext, setActiveContext] = useState<AppContext | null>(null);
  const [availableContexts, setAvailableContexts] = useState<AppContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const delegatedLoadedRef = useRef(false);
  const delegatedFeedsRef = useRef<Feed[]>([]);

  const loadContexts = useCallback(async () => {
    if (!pnIdentifier) {
      setAvailableContexts([]);
      setActiveContext(null);
      return;
    }

    if (isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const session = PNOAuthService.loadSession();
      const displayName = session?.nickname || 'My pN';
      const pnContext: AppContext = {
        type: 'pn',
        id: pnIdentifier,
        name: displayName,
        pnIdentifier
      };

      const feedTokens = session?.feedTokens || [];
      const feedTokensMap = new Map(feedTokens.map((ft) => [ft.feedId, ft]));

      let ownedFeeds: Feed[] = [];
      let delegatedFeeds: Feed[] = [];

      try {
        const controlled = await FeedService.getControlledFeeds(pnIdentifier);
        ownedFeeds = controlled.owned;
        if (includeDelegated) {
          delegatedFeeds = controlled.delegated;
          delegatedLoadedRef.current = true;
          delegatedFeedsRef.current = controlled.delegated;
        } else if (delegatedLoadedRef.current) {
          delegatedFeeds = delegatedFeedsRef.current;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          !message.includes('Not authorized') &&
          !message.includes('Invalid token') &&
          !message.includes('403') &&
          !message.includes('401') &&
          process.env.NODE_ENV === 'development'
        ) {
          console.error('❌ [useAppContext] Failed to load controlled feeds:', err);
        }
      }

      const ownedFeedContexts: AppContext[] = ownedFeeds.map((f) => ({
        type: 'feed' as const,
        id: f.feedId,
        name: f.feedName,
        feedId: f.feedId,
        isOwned: true,
        feedToken: feedTokensMap.get(f.feedId)
      }));

      const delegatedFeedContexts: AppContext[] = delegatedFeeds.map((f) => ({
        type: 'feed' as const,
        id: f.feedId,
        name: f.feedName,
        feedId: f.feedId,
        isOwned: false
      }));

      const contexts = [pnContext, ...ownedFeedContexts, ...delegatedFeedContexts];

      setAvailableContexts(contexts);

      setActiveContext((prev) => {
        if (!prev) return pnContext;
        const stillExists = contexts.find((c) => c.type === prev.type && c.id === prev.id);
        return stillExists ? prev : pnContext;
      });
    } catch (error) {
      console.error('Failed to load contexts:', error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [pnIdentifier, includeDelegated]);

  useEffect(() => {
    if (pnIdentifier && !isLoadingRef.current) {
      void loadContexts();
    }
  }, [pnIdentifier, includeDelegated, loadContexts]);

  useEffect(() => {
    if (activeContext) {
      localStorage.setItem('pn_active_context', JSON.stringify(activeContext));
    }
  }, [activeContext]);

  useEffect(() => {
    if (!activeContext && pnIdentifier) {
      try {
        const stored = localStorage.getItem('pn_active_context');
        if (stored) {
          const parsed = JSON.parse(stored);
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
