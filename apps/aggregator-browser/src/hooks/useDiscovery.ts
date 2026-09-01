/**
 * Discovery: load content-type indices, paginate, re-discover on feed/NSFW, token-driven refresh.
 * Isolates when and how we fetch. useDiscoverFiles holds the state; pass discoverState from the consumer.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { IndexedFile } from '../types/aggregator';
import type { MetadataFilters } from '../types/aggregator';
import type { ContentType } from '../types/contentTypes';
import { getMetadataIndexService } from '../services/metadata/MetadataIndexService';
import { ContentTypeIndexService } from '../services/contentTypeIndexService';
import { useDiscoverFiles } from './useDiscoverFiles';
import {
  CONTENT_CLASS_BY_TYPE,
  contentClassToContentType,
  getContentTypesForFeed,
} from '../utils/feedContentTypes';
import { parseCommunityFeedId } from '../utils/communityFeed';
import {
  isDiscoverySeededForUnlock,
  markDiscoverySeededForUnlock,
} from '../services/unlockSessionCoordinator';
import { MESSAGING_ONLY } from '../config/buildFlags';

const PAGE_SIZE = 50;

export interface UseDiscoveryParams {
  discoverState: ReturnType<typeof useDiscoverFiles>;
  cleanupThumbnailsForFiles: (fileIds: string[]) => void;
  hasMoreRef: React.MutableRefObject<boolean>;
  activeFeedId: string;
  discoveryEnabled: boolean;
  userState: { preferences: { hasAgeZKP?: boolean; isOver18?: boolean; showNSFW?: boolean }; [k: string]: any };
}

export function useDiscovery({
  discoverState,
  cleanupThumbnailsForFiles,
  hasMoreRef,
  activeFeedId,
  discoveryEnabled,
  userState,
}: UseDiscoveryParams) {
  const {
    setMediaFiles,
    setThoughtsFiles,
    setCollectionsFiles,
    setError,
    setCurrentPage,
    setHasMore,
    setFilters,
    setIsLoading,
    mediaFiles,
    thoughtsFiles,
    collectionsFiles,
    filters,
  } = discoverState;

  const metadataIndexService = getMetadataIndexService();
  const discoverFilesRef = useRef<((a?: MetadataFilters, b?: boolean, c?: number, d?: boolean) => Promise<void>) | null>(null);
  const isDiscoveringRef = useRef(false);
  const initialDiscoveryCompleteRef = useRef(false);
  const lastBootstrappedFeedKeyRef = useRef<string | null>(null);
  const discoverFilesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryEnabledRef = useRef(discoveryEnabled);
  const prevDiscoveryEnabledRef = useRef(discoveryEnabled);
  const prevShowNsfwRef = useRef(userState.preferences.showNSFW);
  const nsfwRefreshInflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    discoveryEnabledRef.current = discoveryEnabled;
  }, [discoveryEnabled]);

  const resolveContentTypes = useCallback(
    (searchFilters?: MetadataFilters): ContentType[] => {
      if (searchFilters?.contentClass) {
        return [contentClassToContentType(searchFilters.contentClass)];
      }
      return getContentTypesForFeed(activeFeedId);
    },
    [activeFeedId]
  );

  const mergeNsfwFiles = useCallback(
    async (
      contentTypes: ContentType[],
      searchFilters?: MetadataFilters,
      page: number = 0,
      forceRefresh = false
    ) => {
      if (
        !userState.preferences?.hasAgeZKP ||
        !userState.preferences?.isOver18 ||
        !userState.preferences?.showNSFW
      ) {
        return;
      }
      const { CentralMetadataAggregator } = await import('../services/storage/CentralMetadataAggregator');
      const f = searchFilters ?? filters;
      const nsfwResult = await CentralMetadataAggregator.fetchNSFWIndex(
        { tags: f?.tags, authorDid: f?.authorDid, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        forceRefresh
      );
      const nsfwEntries = nsfwResult.files || [];
      const nsfwFiles: IndexedFile[] = nsfwEntries
        .filter((entry: any) => {
          const m = entry.metadata || {};
          return (m.isPublic !== false || m.publicToken != null) && m.isNSFW === true;
        })
        .map((entry: any) => {
          const pnId = entry.pnIdentifier;
          const normalizedPnId = pnId && pnId.startsWith('pn-') ? pnId.substring(3) : pnId;
          const m = entry.metadata || {};
          return {
            metadata: {
              ...m,
              textPost: m.textPost || m.thought,
              thought: m.thought || m.textPost,
              creatorId: normalizedPnId || m.creatorId,
              creator:
                m.creator ||
                (entry.pnIdentifier
                  ? {
                      '@type': 'Person',
                      '@id': entry.pnIdentifier,
                      identifier: { '@type': 'PropertyValue', name: 'DID', value: entry.pnIdentifier },
                    }
                  : undefined),
              author: m.author || (entry.pnIdentifier ? { did: entry.pnIdentifier } : undefined),
              publicToken: entry.publicToken || m.publicToken,
            },
            thumbnail: m.thumbnail,
            publicToken: entry.publicToken || m.publicToken,
            pnIdentifier: entry.pnIdentifier || normalizedPnId,
          };
        });
      const nsfwByClass: Partial<Record<ContentType, IndexedFile[]>> = {
        media: nsfwFiles.filter((f) => (f.metadata as any).contentClass === 'media'),
        thoughts: nsfwFiles.filter((f) => (f.metadata as any).contentClass === 'thought'),
        collections: nsfwFiles.filter((f) => (f.metadata as any).contentClass === 'collection'),
      };
      const mergeNsfw = (
        type: ContentType,
        setter: (value: IndexedFile[] | ((prev: IndexedFile[]) => IndexedFile[])) => void
      ) => {
        if (!contentTypes.includes(type)) return;
        const batch = nsfwByClass[type] ?? [];
        setter((prev) => {
          const existingIds = new Set(prev.map((f) => f.metadata.fileId));
          const newFiles = batch.filter((f) => !existingIds.has(f.metadata.fileId));
          return [...prev, ...newFiles];
        });
      };
      mergeNsfw('media', setMediaFiles);
      mergeNsfw('thoughts', setThoughtsFiles);
      mergeNsfw('collections', setCollectionsFiles);
    },
    [filters, userState.preferences, setMediaFiles, setThoughtsFiles, setCollectionsFiles]
  );

  const refreshNsfwIndexOnly = useCallback(async () => {
    if (nsfwRefreshInflightRef.current) {
      await nsfwRefreshInflightRef.current;
      return;
    }
    const contentTypes = resolveContentTypes();
    const work = mergeNsfwFiles(contentTypes, filters, 0, false).finally(() => {
      nsfwRefreshInflightRef.current = null;
    });
    nsfwRefreshInflightRef.current = work;
    await work;
  }, [filters, mergeNsfwFiles, resolveContentTypes]);

  const loadContentTypeIndices = useCallback(
    async (_searchFilters?: MetadataFilters, forceRefresh: boolean = false, page: number = 0) => {
      const contentTypes = resolveContentTypes(_searchFilters);
      if (contentTypes.length === 0) return;

      if (page === 0) {
        initialDiscoveryCompleteRef.current = false;
      }

      try {
        setError(null);
        if (page === 0) setIsLoading(true);
        await metadataIndexService.initialize();
        const contentTypeService = new ContentTypeIndexService();
        const limit = PAGE_SIZE;
        const offset = page * PAGE_SIZE;
        const communityIndexerId = parseCommunityFeedId(activeFeedId);

        const results = await Promise.all(
          contentTypes.map((type) =>
            contentTypeService.loadContentTypeIndex(
              type,
              {
                contentClass: CONTENT_CLASS_BY_TYPE[type],
                limit,
                offset,
                ...(communityIndexerId ? { indexerId: communityIndexerId } : {}),
              },
              forceRefresh
            )
          )
        );

        const loaded: Partial<Record<ContentType, { files: IndexedFile[]; hasMore: boolean }>> = {};
        contentTypes.forEach((type, i) => {
          loaded[type] = results[i];
        });

        setHasMore(results.some((r) => r.hasMore));

        if (page === 0) {
          const oldIds = new Set<string>();
          const newIds = new Set<string>();
          if (contentTypes.includes('media')) {
            mediaFiles.forEach((f) => oldIds.add(f.metadata.fileId));
            (loaded.media?.files ?? []).forEach((f) => newIds.add(f.metadata.fileId));
          }
          if (contentTypes.includes('thoughts')) {
            thoughtsFiles.forEach((f) => oldIds.add(f.metadata.fileId));
            (loaded.thoughts?.files ?? []).forEach((f) => newIds.add(f.metadata.fileId));
          }
          if (contentTypes.includes('collections')) {
            collectionsFiles.forEach((f) => oldIds.add(f.metadata.fileId));
            (loaded.collections?.files ?? []).forEach((f) => newIds.add(f.metadata.fileId));
          }
          const removed = [...oldIds].filter((id) => !newIds.has(id));
          if (removed.length > 0) cleanupThumbnailsForFiles(removed);

          if (contentTypes.includes('media') && loaded.media) setMediaFiles(loaded.media.files);
          if (contentTypes.includes('thoughts') && loaded.thoughts) setThoughtsFiles(loaded.thoughts.files);
          if (contentTypes.includes('collections') && loaded.collections) {
            setCollectionsFiles(loaded.collections.files);
          }
        } else {
          if (contentTypes.includes('media') && loaded.media) {
            setMediaFiles((prev) => {
              const existingIds = new Set(prev.map((f) => f.metadata.fileId));
              const newFiles = loaded.media!.files.filter((f) => !existingIds.has(f.metadata.fileId));
              return [...prev, ...newFiles];
            });
          }
          if (contentTypes.includes('thoughts') && loaded.thoughts) {
            setThoughtsFiles((prev) => {
              const existingIds = new Set(prev.map((f) => f.metadata.fileId));
              const newFiles = loaded.thoughts!.files.filter((f) => !existingIds.has(f.metadata.fileId));
              return [...prev, ...newFiles];
            });
          }
          if (contentTypes.includes('collections') && loaded.collections) {
            setCollectionsFiles((prev) => {
              const existingIds = new Set(prev.map((f) => f.metadata.fileId));
              const newFiles = loaded.collections!.files.filter((f) => !existingIds.has(f.metadata.fileId));
              return [...prev, ...newFiles];
            });
          }
        }

        if (
          userState.preferences?.hasAgeZKP &&
          userState.preferences?.isOver18 &&
          userState.preferences?.showNSFW
        ) {
          try {
            await mergeNsfwFiles(contentTypes, _searchFilters, page, forceRefresh);
          } catch (e) {
            console.warn('Failed to fetch NSFW index:', e);
          }
        }

        if (page === 0) {
          initialDiscoveryCompleteRef.current = true;
        }
      } catch (err: any) {
        console.error('Failed to load content-type indices:', err);
        setError(err.message || 'Failed to load files');
        throw err;
      } finally {
        if (page === 0) setIsLoading(false);
      }
    },
    [
      resolveContentTypes,
      filters,
      activeFeedId,
      userState.preferences,
      mergeNsfwFiles,
      metadataIndexService,
      mediaFiles,
      thoughtsFiles,
      collectionsFiles,
      cleanupThumbnailsForFiles,
      setError,
      setIsLoading,
      setMediaFiles,
      setThoughtsFiles,
      setCollectionsFiles,
      setHasMore,
    ]
  );

  const discoverFiles = useCallback(
    async (searchFilters?: MetadataFilters, forceRefresh: boolean = false, page: number = 0, append?: boolean) => {
      // Messaging build must never hit aggregator discovery endpoints.
      if (MESSAGING_ONLY) return;
      if (!discoveryEnabledRef.current && !forceRefresh) return;

      const contentTypes = resolveContentTypes(searchFilters);
      const feedKey = `${activeFeedId}:${contentTypes.slice().sort().join(',')}`;
      if (
        page === 0 &&
        !forceRefresh &&
        !append &&
        initialDiscoveryCompleteRef.current &&
        lastBootstrappedFeedKeyRef.current === feedKey &&
        isDiscoverySeededForUnlock()
      ) {
        return;
      }

      if (isDiscoveringRef.current && !forceRefresh && !append) return;
      isDiscoveringRef.current = true;
      try {
        await loadContentTypeIndices(searchFilters, forceRefresh, page);
        if (page === 0) {
          lastBootstrappedFeedKeyRef.current = feedKey;
          markDiscoverySeededForUnlock();
        }
      } finally {
        isDiscoveringRef.current = false;
      }
    },
    [loadContentTypeIndices, activeFeedId, resolveContentTypes]
  );

  const refreshContentType = useCallback(
    async (contentType: ContentType, forceRefresh = true) => {
      if (MESSAGING_ONLY) return;
      if (isDiscoveringRef.current && !forceRefresh) return;
      isDiscoveringRef.current = true;
      try {
        await loadContentTypeIndices({ contentClass: CONTENT_CLASS_BY_TYPE[contentType] }, forceRefresh, 0);
      } finally {
        isDiscoveringRef.current = false;
      }
    },
    [loadContentTypeIndices]
  );

  useEffect(() => {
    discoverFilesRef.current = discoverFiles;
  }, [discoverFiles]);

  useEffect(() => {
    initialDiscoveryCompleteRef.current = false;
    lastBootstrappedFeedKeyRef.current = null;
  }, [activeFeedId]);

  useEffect(() => {
    const becameEnabled = discoveryEnabled && !prevDiscoveryEnabledRef.current;
    prevDiscoveryEnabledRef.current = discoveryEnabled;

    if (!discoveryEnabled) return;
    if (activeFeedId === 'discovery') return;
    if (isDiscoverySeededForUnlock() && initialDiscoveryCompleteRef.current) return;

    if (discoverFilesTimeoutRef.current) clearTimeout(discoverFilesTimeoutRef.current);
    initialDiscoveryCompleteRef.current = false;
    setCurrentPage(0);
    setHasMore(true);
    hasMoreRef.current = true;

    discoverFilesTimeoutRef.current = setTimeout(() => {
      if (discoverFilesRef.current && !isDiscoveringRef.current) {
        discoverFilesRef.current(undefined, false, 0, false);
      }
    }, becameEnabled ? 0 : 500);

    return () => {
      if (discoverFilesTimeoutRef.current) clearTimeout(discoverFilesTimeoutRef.current);
    };
  }, [activeFeedId, discoveryEnabled, setCurrentPage, setHasMore]);

  useEffect(() => {
    const prevShowNsfw = prevShowNsfwRef.current;
    const nextShowNsfw = userState.preferences.showNSFW;
    prevShowNsfwRef.current = nextShowNsfw;

    if (!initialDiscoveryCompleteRef.current) return;
    if (prevShowNsfw || !nextShowNsfw) return;
    if (!userState.preferences.hasAgeZKP || !userState.preferences.isOver18) return;

    void refreshNsfwIndexOnly();
  }, [
    userState.preferences.showNSFW,
    userState.preferences.hasAgeZKP,
    userState.preferences.isOver18,
    refreshNsfwIndexOnly,
  ]);

  const handleSearch = useCallback(() => {
    if (!discoveryEnabledRef.current) return;
    setCurrentPage(0);
    setHasMore(true);
    hasMoreRef.current = true;
    discoverFiles(undefined, false, 0, false);
  }, [setCurrentPage, setHasMore, discoverFiles]);

  const handleFilterChange = useCallback(
    (key: keyof MetadataFilters, value: any) => {
      if (!discoveryEnabledRef.current) return;
      const newFilters = { ...filters, [key]: value || undefined };
      setFilters(newFilters);
      setCurrentPage(0);
      setHasMore(true);
      hasMoreRef.current = true;
      discoverFiles(newFilters, false, 0, false);
    },
    [filters, setFilters, setCurrentPage, setHasMore, discoverFiles]
  );

  return {
    discoverFiles,
    discoverFilesRef,
    isDiscoveringRef,
    initialDiscoveryCompleteRef,
    loadContentTypeIndices,
    refreshContentType,
    handleSearch,
    handleFilterChange,
  };
}
