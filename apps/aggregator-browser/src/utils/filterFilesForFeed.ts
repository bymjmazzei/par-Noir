/**
 * Pure feed list filter (same rules as useFeedFiltering) for any feedId —
 * used by rail prefetch without waiting for activeFeedId to change.
 */
import type { IndexedFile, Feed } from '../types/aggregator';
import { isNSFWContent } from '../constants/contentRatings';
import { getCreatorIdentifier, normalizeId } from '../utils/contentClass';
import { sortIndexedFilesForDiscovery } from '../utils/discoverySort';
import { COMMUNITY_FEED_PREFIX } from '../utils/communityFeed';
import { excludePenTemplates, onlyPenTemplates } from './penTemplateFeed';

export type FeedFilterUserState = {
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

export type FilterFilesForFeedParams = {
  mediaFiles: IndexedFile[];
  notesFiles: IndexedFile[];
  collectionsFiles: IndexedFile[];
  feedId: string;
  userState: FeedFilterUserState;
  connectionsList: Array<{
    connectionId: string;
    userPnIdentifier: string;
    status: string;
    createdAt: string;
    acceptedAt?: string;
  }>;
  feeds: Feed[];
};

export function filterFilesForFeed(params: FilterFilesForFeedParams): IndexedFile[] {
  const {
    mediaFiles,
    notesFiles,
    collectionsFiles,
    feedId,
    userState,
    connectionsList,
    feeds,
  } = params;

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
    subscribedFeedIds: userState.preferences.subscribedFeedIds,
  };

  const sortByScore = (files: IndexedFile[], usePersonalization = false): IndexedFile[] =>
    sortIndexedFilesForDiscovery(files, usePersonalization, discoveryCtx);

  const applyConnectionFilter = (
    files: IndexedFile[],
    connectionFilter: 'all' | 'connections' | 'not_connections',
    userPnIdentifier: string,
    connections: FilterFilesForFeedParams['connectionsList']
  ): IndexedFile[] => {
    if (connectionFilter === 'all' || !userState.isUnlocked || connections.length === 0) {
      return files;
    }
    const connectedPnIdentifiers = new Set<string>();
    const userPnIdentifierNormalized = normalizeId(userPnIdentifier);
    connections.forEach((conn) => {
      if (!conn.userPnIdentifier) return;
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

  const sortByTime = (files: IndexedFile[]): IndexedFile[] =>
    [...files].sort((a, b) => {
      const dateA = a.metadata.uploadDate ? new Date(a.metadata.uploadDate).getTime() : 0;
      const dateB = b.metadata.uploadDate ? new Date(b.metadata.uploadDate).getTime() : 0;
      return dateB - dateA;
    });

  const shouldExcludeNotePage = (file: IndexedFile): boolean => {
    const ft = file.metadata.fileType;
    return (
      ft === 'note-collection-thumbnail' ||
      ft === 'note-collection-page' ||
      ft === 'note-collection'
    );
  };

  const filteredMedia = excludePenTemplates(
    mediaFiles.filter((f) => shouldShowFile(f) && !shouldExcludeNotePage(f))
  );
  const filteredNotes = excludePenTemplates(
    notesFiles.filter((f) => shouldShowFile(f) && !shouldExcludeNotePage(f))
  );
  const filteredCollections = excludePenTemplates(
    collectionsFiles.filter((f) => shouldShowFile(f) && !shouldExcludeNotePage(f))
  );

  const allRaw = [...mediaFiles, ...notesFiles, ...collectionsFiles].filter(
    (f) => shouldShowFile(f) && !shouldExcludeNotePage(f)
  );

  if (feedId === 'pen-templates') {
    return sortByScore(onlyPenTemplates(allRaw), userState.isUnlocked);
  }

  const curatedFeedPreferences = userState.isUnlocked
    ? userState.preferences.curatedFeedPreferences || {
        sortOrder: 'recommended' as const,
        connectionFilter: 'all' as const,
      }
    : null;

  const processPublicFeed = (
    files: IndexedFile[],
    connections: FilterFilesForFeedParams['connectionsList']
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

  if (feedId === 'public') {
    return processPublicFeed(
      [...filteredMedia, ...filteredNotes, ...filteredCollections],
      connectionsList
    );
  }
  if (feedId === 'media') return processPublicFeed(filteredMedia, connectionsList);
  if (feedId === 'notes') return processPublicFeed(filteredNotes, connectionsList);
  if (feedId === 'collections') return processPublicFeed(filteredCollections, connectionsList);
  if (feedId === 'discovery') return [];

  if (feedId.startsWith('niche-')) {
    const categoryId = feedId.replace('niche-', '');
    const allFiles = [...filteredMedia, ...filteredNotes, ...filteredCollections];
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

  if (feedId.startsWith(COMMUNITY_FEED_PREFIX)) {
    const allFiles = [...filteredMedia, ...filteredNotes, ...filteredCollections];
    return sortByScore(allFiles, true);
  }

  const allFiles = [...filteredMedia, ...filteredNotes, ...filteredCollections];
  const filtered = allFiles.filter((file) => file.metadata.feedIds?.includes(feedId));
  return sortByScore(filtered, true);
}
