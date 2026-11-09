/**
 * useAppContext Hook
 * Manages context switching between pN identity and controlled feed subs (owned + delegated)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Feed } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { PNOAuthService, FeedToken } from '../services/pnOAuthService';
import { PERSONAL_FEED_CHANGE_EVENT } from '../services/personalFeed';

export type AppContext =
  | { type: 'pn'; id: string; name: string; pnIdentifier: string }
  | {
      type: 'feed';
      id: string;
      name: string;
      feedId: string;
      isOwned: boolean;
      isPersonal?: boolean;
      feedToken?: FeedToken;
    };

/** No explicit choice yet: the personal feed, else the pN itself. */
export function pickDefaultContext(contexts: AppContext[], pnContext: AppContext): AppContext {
  return contexts.find((c) => c.type === 'feed' && c.isPersonal) ?? pnContext;
}

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
  const reloadPendingRef = useRef(false);
  const loadContextsRef = useRef<(() => Promise<void>) | null>(null);
  const delegatedLoadedRef = useRef(false);
  const delegatedFeedsRef = useRef<Feed[]>([]);

  const loadContexts = useCallback(async (): Promise<void> => {
    if (!pnIdentifier) {
      setAvailableContexts([]);
      setActiveContext(null);
      return;
    }

    if (isLoadingRef.current) {
      reloadPendingRef.current = true;
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
        isPersonal: f.creatorTier === 'personal',
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
        const fallback = pickDefaultContext(contexts, pnContext);
        if (!prev) return fallback;
        const stillExists = contexts.find((c) => c.type === prev.type && c.id === prev.id);
        return stillExists ?? fallback;
      });
    } catch (error) {
      console.error('Failed to load contexts:', error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      if (reloadPendingRef.current) {
        reloadPendingRef.current = false;
        void loadContextsRef.current?.();
      }
    }
  }, [pnIdentifier, includeDelegated]);
  loadContextsRef.current = loadContexts;

  useEffect(() => {
    if (pnIdentifier && !isLoadingRef.current) {
      void loadContexts();
    }
  }, [pnIdentifier, includeDelegated, loadContexts]);

  useEffect(() => {
    if (!pnIdentifier || typeof window === 'undefined') return;
    const onPersonalFeed = () => {
      void loadContexts();
    };
    window.addEventListener(PERSONAL_FEED_CHANGE_EVENT, onPersonalFeed);
    return () => window.removeEventListener(PERSONAL_FEED_CHANGE_EVENT, onPersonalFeed);
  }, [pnIdentifier, loadContexts]);

  return {
    activeContext,
    setActiveContext,
    availableContexts,
    loadContexts,
    isLoading
  };
}
