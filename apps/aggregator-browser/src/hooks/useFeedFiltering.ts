/**
 * Feed filtering: NSFW, connection filter, sorting, and feed-specific logic.
 * Isolates changes to what's shown in the feed from the rest of the app.
 */

import { useMemo } from 'react';
import type { IndexedFile, Feed } from '../types/aggregator';
import { isNSFWContent } from '../constants/contentRatings';
import { isThought, isCollection, isMedia, getCreatorIdentifier, normalizeId } from '../utils/contentClass';
import { sortIndexedFilesForDiscovery } from '../utils/discoverySort';
import { COMMUNITY_FEED_PREFIX } from '../utils/communityFeed';

export interface UseFeedFilteringParams {
  mediaFiles: IndexedFile[];
  thoughtsFiles: IndexedFile[];
  collectionsFiles: IndexedFile[];
  activeFeedId: string;
  userState: {
    isUnlocked: boolean;
    pnIdentifier?: string;
    preferences: {
      subscribedFeedIds?: string[];
      blockedCategories?: string[];
      subscribedSubjects?: string[];
      blockedSubjects?: string[];
      showNSFW?: boolean;
      hasAgeZKP?: boolean;
      isOver18?: boolean;
      curatedFeedPreferences?: {
        sortOrder: 'recommended' | 'time';
        connectionFilter: 'all' | 'connections' | 'not_connections';
      } | null;
    };
  };
  connectionsList: Array<{ connectionId: string; userPnIdentifier: string; status: string; createdAt: string; acceptedAt?: string }>;
  feeds: Feed[];
  viewMode: 'grid' | 'feed';
}

export function useFeedFiltering({
  mediaFiles,
  thoughtsFiles,
  collectionsFiles,
  activeFeedId,
  userState,
  connectionsList,
  feeds,
  viewMode,
}: UseFeedFilteringParams) {
  const filteredFilesByFeed = useMemo(() => {
    const shouldShowFile = (file: IndexedFile): boolean => {
      const isNSFW = isNSFWContent(file.metadata);
      if (!userState.isUnlocked && isNSFW) return false;
      if (isNSFW) {
        return !!(
          userState.preferences.hasAgeZKP &&
          userState.preferences.isOver18 &&
          userState.preferences.showNSFW
        );
      }
      return true;
    };

    const discoveryCtx = {
      isUnlocked: userState.isUnlocked,
      subscribedSubjects: userState.preferences.subscribedSubjects,
      blockedSubjects: userState.preferences.blockedSubjects,
      subscribedFeedIds: userState.preferences.subscribedFeedIds
    };

    const sortByScore = (files: IndexedFile[], usePersonalization: boolean = false): IndexedFile[] =>
      sortIndexedFilesForDiscovery(files, usePersonalization, discoveryCtx);

    const applyConnectionFilter = (
      files: IndexedFile[],
      connectionFilter: 'all' | 'connections' | 'not_connections',
      userPnIdentifier: string,
      connections: Array<{
        connectionId: string;
        userPnIdentifier: string;
        status: string;
        createdAt: string;
        acceptedAt?: string;
      }>
    ): IndexedFile[] => {
      if (connectionFilter === 'all' || !userState.isUnlocked || connections.length === 0) {
        return files;
      }
      const connectedPnIdentifiers = new Set<string>();
      const userPnIdentifierNormalized = normalizeId(userPnIdentifier);
      connections.forEach((conn) => {
        // Connection.userPnIdentifier is the other user's identifier in the connection
        if (!conn.userPnIdentifier) {
          console.warn('[useFeedFiltering] Connection missing userPnIdentifier:', conn);
          return;
        }
        const otherUserPnIdentifier = normalizeId(conn.userPnIdentifier);
        if (otherUserPnIdentifier && otherUserPnIdentifier !== userPnIdentifierNormalized) {
          connectedPnIdentifiers.add(otherUserPnIdentifier);
        }
      });
      return files.filter((file) => {
        const fileCreatorId = getCreatorIdentifier(file);
        if (!fileCreatorId) return true;
        const fileCreatorNormalized = normalizeId(fileCreatorId);
        if (fileCreatorNormalized === userPnIdentifierNormalized) {
          return connectionFilter !== 'not_connections';
        }
        const isConnected = connectedPnIdentifiers.has(fileCreatorNormalized);
        if (connectionFilter === 'connections') return isConnected;
        if (connectionFilter === 'not_connections') return !isConnected;
        return true;
      });
    };

    const sortByTime = (files: IndexedFile[]): IndexedFile[] => {
      return [...files].sort((a, b) => {
        const dateA = a.metadata.uploadDate ? new Date(a.metadata.uploadDate).getTime() : 0;
        const dateB = b.metadata.uploadDate ? new Date(b.metadata.uploadDate).getTime() : 0;
        return dateB - dateA;
      });
    };

    const shouldExcludeThoughtPage = (file: IndexedFile): boolean => {
      const ft = file.metadata.fileType;
      return ft === 'thought-collection-thumbnail' || ft === 'thought-collection-page' || ft === 'thought-collection';
    };

    const filteredMedia = mediaFiles.filter((f) => shouldShowFile(f) && !shouldExcludeThoughtPage(f));
    const filteredThoughts = thoughtsFiles.filter((f) => shouldShowFile(f) && !shouldExcludeThoughtPage(f));
    const filteredCollections = collectionsFiles.filter((f) => shouldShowFile(f) && !shouldExcludeThoughtPage(f));

    const curatedFeedPreferences = userState.isUnlocked
      ? userState.preferences.curatedFeedPreferences || { sortOrder: 'recommended', connectionFilter: 'all' }
      : null;

    const processPublicFeed = (
      files: IndexedFile[],
      connections: Array<{ connectionId: string; userPnIdentifier: string; status: string; createdAt: string; acceptedAt?: string }>
    ): IndexedFile[] => {
      let processed = files;
      if (curatedFeedPreferences && userState.pnIdentifier) {
        processed = applyConnectionFilter(
          processed,
          curatedFeedPreferences.connectionFilter,
          userState.pnIdentifier,
          connections
        );
      }
      if (curatedFeedPreferences?.sortOrder === 'time') {
        processed = sortByTime(processed);
      } else {
        processed = sortByScore(processed, userState.isUnlocked);
      }
      return processed;
    };

    if (activeFeedId === 'public') {
      const combined = [...filteredMedia, ...filteredThoughts, ...filteredCollections];
      const processed = processPublicFeed(combined, connectionsList);
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Public Feed] ${processed.length} files: ${filteredMedia.length} media, ${filteredThoughts.length} thoughts, ${filteredCollections.length} collections`
        );
      }
      return processed;
    }
    if (activeFeedId === 'media') return processPublicFeed(filteredMedia, connectionsList);
    if (activeFeedId === 'thoughts') return processPublicFeed(filteredThoughts, connectionsList);
    if (activeFeedId === 'collections') return processPublicFeed(filteredCollections, connectionsList);
    if (activeFeedId === 'discovery') return [];

    if (activeFeedId.startsWith('niche-')) {
      const categoryId = activeFeedId.replace('niche-', '');
      const allFiles = [...filteredMedia, ...filteredThoughts, ...filteredCollections];
      const filtered = allFiles.filter((file) => {
        const fileCategories = file.metadata.feedCategories || [];
        const flat = Array.isArray(fileCategories) ? fileCategories.flat(Infinity) : [fileCategories];
        if (flat.includes(categoryId as any)) return true;
        const fileFeedIds = file.metadata.feedIds || [];
        const fileFeeds = feeds.filter((f) => fileFeedIds.includes(f.feedId));
        return fileFeeds.some((feed) => feed.feedCategory === categoryId);
      });
      return sortByScore(filtered, true);
    }

    if (activeFeedId.startsWith(COMMUNITY_FEED_PREFIX)) {
      const allFiles = [...filteredMedia, ...filteredThoughts, ...filteredCollections];
      return sortByScore(allFiles, true);
    }

    const allFiles = [...filteredMedia, ...filteredThoughts, ...filteredCollections];
    const filtered = allFiles.filter((file) => file.metadata.feedIds?.includes(activeFeedId));
    return sortByScore(filtered, true);
  }, [
    mediaFiles,
    thoughtsFiles,
    collectionsFiles,
    activeFeedId,
    userState.preferences.subscribedFeedIds,
    userState.preferences.blockedCategories,
    userState.preferences.subscribedSubjects,
    userState.preferences.blockedSubjects,
    userState.preferences.showNSFW,
    userState.preferences.hasAgeZKP,
    userState.preferences.isOver18,
    userState.isUnlocked,
    userState.preferences.curatedFeedPreferences,
    userState.pnIdentifier,
    connectionsList,
    feeds,
    viewMode,
  ]);

  return { filteredFilesByFeed, isThought, isCollection, isMedia };
}
