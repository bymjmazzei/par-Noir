/**
 * useAppContext Hook
 * Manages context switching between pN identity and feeds
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Feed } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { PNOAuthService, FeedToken } from '../services/pnOAuthService';

export type AppContext =
  | { type: 'pn'; id: string; name: string; pnIdentifier: string }
  | { type: 'feed'; id: string; name: string; feedId: string; isOwned: boolean; feedToken?: FeedToken };

export interface UseAppContextOptions {
  /** App catalog fetch finished — owned feeds come from catalogFeeds only (no second listFeeds). */
  catalogReady?: boolean;
  /** Load delegated feed contexts (deferred until context menu opens). */
  includeDelegated?: boolean;
}

export function useAppContext(
  pnIdentifier?: string,
  catalogFeeds?: Feed[],
  options: UseAppContextOptions = {}
) {
  const { catalogReady = false, includeDelegated = false } = options;
  const [activeContext, setActiveContext] = useState<AppContext | null>(null);
  const [availableContexts, setAvailableContexts] = useState<AppContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const delegatedLoadedRef = useRef(false);
  const delegatedContextsRef = useRef<AppContext[]>([]);

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
        pnIdentifier,
      };

      const feedTokens = session?.feedTokens || [];
      const feedTokensMap = new Map(feedTokens.map((ft) => [ft.feedId, ft]));

      const ownedFeeds = catalogReady
        ? (catalogFeeds ?? []).filter((f) => f.creatorId === pnIdentifier)
        : [];

      const ownedFeedContexts: AppContext[] = ownedFeeds.map((f) => ({
        type: 'feed' as const,
        id: f.feedId,
        name: f.feedName,
        feedId: f.feedId,
        isOwned: true,
        feedToken: feedTokensMap.get(f.feedId),
      }));

      let delegatedFeedContexts: AppContext[] = [];
      if (includeDelegated && session?.accessToken && !delegatedLoadedRef.current) {
        try {
          const delegatedFeeds = await FeedService.getDelegatedFeeds(pnIdentifier);
          delegatedLoadedRef.current = true;
          delegatedFeedContexts = delegatedFeeds.map((f) => ({
            type: 'feed' as const,
            id: f.feedId,
            name: f.feedName,
            feedId: f.feedId,
            isOwned: false,
          }));
          delegatedContextsRef.current = delegatedFeedContexts;
        } catch (err: any) {
          if (
            !err.message?.includes('Not authorized') &&
            !err.message?.includes('Invalid token') &&
            !err.message?.includes('403') &&
            !err.message?.includes('401') &&
            process.env.NODE_ENV === 'development'
          ) {
            console.error('❌ [useAppContext] Failed to load delegated feeds:', err);
          }
        }
      } else if (delegatedLoadedRef.current) {
        delegatedFeedContexts = delegatedContextsRef.current;
      }

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
  }, [pnIdentifier, catalogFeeds, catalogReady, includeDelegated]);

  useEffect(() => {
    if (pnIdentifier && !isLoadingRef.current) {
      loadContexts();
    }
  }, [pnIdentifier, catalogReady, includeDelegated, catalogFeeds, loadContexts]);

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
    isLoading,
  };
}
