/**
 * Hook for discover/index file state: media, thoughts, collections, pagination, filters.
 * discoverFiles and loadMore stay in the consumer (e.g. App) and use these setters.
 */

import { useState, useMemo } from 'react';
import type { IndexedFile } from '../types/aggregator';
import type { MetadataFilters } from '../types/aggregator';

export function useDiscoverFiles() {
  const [mediaFiles, setMediaFiles] = useState<IndexedFile[]>([]);
  const [thoughtsFiles, setThoughtsFiles] = useState<IndexedFile[]>([]);
  const [collectionsFiles, setCollectionsFiles] = useState<IndexedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [filters, setFilters] = useState<MetadataFilters>({});

  const indexedFiles = useMemo(
    () => [...mediaFiles, ...thoughtsFiles, ...collectionsFiles],
    [mediaFiles, thoughtsFiles, collectionsFiles]
  );

  return {
    mediaFiles,
    setMediaFiles,
    thoughtsFiles,
    setThoughtsFiles,
    collectionsFiles,
    setCollectionsFiles,
    indexedFiles,
    isLoading,
    setIsLoading,
    error,
    setError,
    currentPage,
    setCurrentPage,
    hasMore,
    setHasMore,
    isLoadingMore,
    setIsLoadingMore,
    filters,
    setFilters,
  };
}
