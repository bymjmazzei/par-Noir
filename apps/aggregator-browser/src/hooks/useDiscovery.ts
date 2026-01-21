/**
 * Discovery: load content-type indices, paginate, re-discover on feed/NSFW, token-driven refresh.
 * Isolates when and how we fetch. useDiscoverFiles holds the state; pass discoverState from the consumer.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { IndexedFile } from '../types/aggregator';
import type { MetadataFilters } from '../types/aggregator';
import { getMetadataIndexService } from '../services/metadata/MetadataIndexService';
import { ContentTypeIndexService } from '../services/contentTypeIndexService';
import { useDiscoverFiles } from './useDiscoverFiles';

const PAGE_SIZE = 50;

export interface UseDiscoveryParams {
  discoverState: ReturnType<typeof useDiscoverFiles>;
  cleanupThumbnailsForFiles: (fileIds: string[]) => void;
  hasMoreRef: React.MutableRefObject<boolean>;
  activeFeedId: string;
  userState: { preferences: { hasAgeZKP?: boolean; isOver18?: boolean; showNSFW?: boolean }; [k: string]: any };
}

export function useDiscovery({
  discoverState,
  cleanupThumbnailsForFiles,
  hasMoreRef,
  activeFeedId,
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
    mediaFiles,
    thoughtsFiles,
    collectionsFiles,
    filters,
  } = discoverState;

  const metadataIndexService = getMetadataIndexService();
  const discoverFilesRef = useRef<((a?: MetadataFilters, b?: boolean, c?: number, d?: boolean) => Promise<void>) | null>(null);
  const isDiscoveringRef = useRef(false);
  const discoverFilesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadContentTypeIndices = useCallback(
    async (_searchFilters?: MetadataFilters, forceRefresh: boolean = false, page: number = 0) => {
      try {
        setError(null);
        await metadataIndexService.initialize();
        const contentTypeService = new ContentTypeIndexService();
        const [media, thoughts, collections] = await Promise.all([
          contentTypeService.loadContentTypeIndex('media', { contentClass: 'media' }, forceRefresh),
          contentTypeService.loadContentTypeIndex('thoughts', { contentClass: 'thought' }, forceRefresh),
          contentTypeService.loadContentTypeIndex('collections', { contentClass: 'collection' }, forceRefresh),
        ]);

        if (page === 0) {
          const oldIds = new Set([
            ...mediaFiles.map((f) => f.metadata.fileId),
            ...thoughtsFiles.map((f) => f.metadata.fileId),
            ...collectionsFiles.map((f) => f.metadata.fileId),
          ]);
          const newIds = new Set([
            ...media.map((f) => f.metadata.fileId),
            ...thoughts.map((f) => f.metadata.fileId),
            ...collections.map((f) => f.metadata.fileId),
          ]);
          const removed = [...oldIds].filter((id) => !newIds.has(id));
          if (removed.length > 0) cleanupThumbnailsForFiles(removed);
          setMediaFiles(media);
          setThoughtsFiles(thoughts);
          setCollectionsFiles(collections);
        } else {
          setMediaFiles((prev) => {
            const existingIds = new Set(prev.map((f) => f.metadata.fileId));
            const newFiles = media.filter((f) => !existingIds.has(f.metadata.fileId));
            return [...prev, ...newFiles];
          });
          setThoughtsFiles((prev) => {
            const existingIds = new Set(prev.map((f) => f.metadata.fileId));
            const newFiles = thoughts.filter((f) => !existingIds.has(f.metadata.fileId));
            return [...prev, ...newFiles];
          });
          setCollectionsFiles((prev) => {
            const existingIds = new Set(prev.map((f) => f.metadata.fileId));
            const newFiles = collections.filter((f) => !existingIds.has(f.metadata.fileId));
            return [...prev, ...newFiles];
          });
        }

        if (userState.preferences?.hasAgeZKP && userState.preferences?.isOver18 && userState.preferences?.showNSFW) {
          try {
            const { CentralMetadataAggregator } = await import('../services/storage/CentralMetadataAggregator');
            const f = _searchFilters ?? filters;
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
                    creator: m.creator || (entry.pnIdentifier ? { '@type': 'Person', '@id': entry.pnIdentifier, identifier: { '@type': 'PropertyValue', name: 'DID', value: entry.pnIdentifier } } : undefined),
                    author: m.author || (entry.pnIdentifier ? { did: entry.pnIdentifier } : undefined),
                    publicToken: entry.publicToken || m.publicToken,
                  },
                  thumbnail: m.thumbnail,
                  publicToken: entry.publicToken || m.publicToken,
                  pnIdentifier: entry.pnIdentifier || normalizedPnId,
                };
              });
            const nsfwMedia = nsfwFiles.filter((f) => (f.metadata as any).contentClass === 'media');
            const nsfwThoughts = nsfwFiles.filter((f) => (f.metadata as any).contentClass === 'thought');
            const nsfwCollections = nsfwFiles.filter((f) => (f.metadata as any).contentClass === 'collection');
            setMediaFiles((prev) => {
              const existingIds = new Set(prev.map((f) => f.metadata.fileId));
              const newFiles = nsfwMedia.filter((f) => !existingIds.has(f.metadata.fileId));
              return [...prev, ...newFiles];
            });
            setThoughtsFiles((prev) => {
              const existingIds = new Set(prev.map((f) => f.metadata.fileId));
              const newFiles = nsfwThoughts.filter((f) => !existingIds.has(f.metadata.fileId));
              return [...prev, ...newFiles];
            });
            setCollectionsFiles((prev) => {
              const existingIds = new Set(prev.map((f) => f.metadata.fileId));
              const newFiles = nsfwCollections.filter((f) => !existingIds.has(f.metadata.fileId));
              return [...prev, ...newFiles];
            });
          } catch (e) {
            console.warn('Failed to fetch NSFW index:', e);
          }
        }
      } catch (err: any) {
        console.error('Failed to load content-type indices:', err);
        setError(err.message || 'Failed to load files');
        throw err;
      }
    },
    [activeFeedId, filters, userState.preferences, metadataIndexService, mediaFiles, thoughtsFiles, collectionsFiles, cleanupThumbnailsForFiles, setError, setMediaFiles, setThoughtsFiles, setCollectionsFiles]
  );

  const discoverFiles = useCallback(
    async (searchFilters?: MetadataFilters, forceRefresh: boolean = false, page: number = 0, append?: boolean) => {
      if (isDiscoveringRef.current && !forceRefresh && !append) return;
      await loadContentTypeIndices(searchFilters, forceRefresh, page);
    },
    [loadContentTypeIndices]
  );

  useEffect(() => {
    discoverFilesRef.current = discoverFiles;
  }, [discoverFiles]);

  useEffect(() => {
    if (activeFeedId === 'discovery') return;
    if (discoverFilesTimeoutRef.current) clearTimeout(discoverFilesTimeoutRef.current);
    setCurrentPage(0);
    setHasMore(true);
    hasMoreRef.current = true;
    discoverFilesTimeoutRef.current = setTimeout(() => {
      if (discoverFilesRef.current && !isDiscoveringRef.current) {
        discoverFilesRef.current(undefined, false, 0, false);
      }
    }, 500);
    return () => {
      if (discoverFilesTimeoutRef.current) clearTimeout(discoverFilesTimeoutRef.current);
    };
  }, [activeFeedId, userState.preferences.showNSFW, setCurrentPage, setHasMore]);

  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedRef.current && discoverFilesRef.current) {
      hasInitializedRef.current = true;
      discoverFilesRef.current(undefined, false, 0, false);
    }
  }, []);

  useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem('google_drive_token');
      if (token && discoverFilesRef.current) {
        discoverFilesRef.current(undefined, false, 0, false);
      }
    };
    checkToken();
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'google_drive_token' && e.newValue && discoverFilesRef.current) {
        discoverFilesRef.current(undefined, false, 0, false);
      }
    };
    window.addEventListener('storage', storageHandler);
    return () => window.removeEventListener('storage', storageHandler);
  }, []);

  const handleSearch = useCallback(() => {
    setCurrentPage(0);
    setHasMore(true);
    hasMoreRef.current = true;
    discoverFiles(undefined, false, 0, false);
  }, [setCurrentPage, setHasMore, discoverFiles]);

  const handleFilterChange = useCallback(
    (key: keyof MetadataFilters, value: any) => {
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
    loadContentTypeIndices,
    handleSearch,
    handleFilterChange,
  };
}
