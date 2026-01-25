/**
 * Feed filtering: NSFW, connection filter, sorting, and feed-specific logic.
 * Isolates changes to what's shown in the feed from the rest of the app.
 */

import { useMemo } from 'react';
import type { IndexedFile, Feed } from '../types/aggregator';
import { isNSFWContent } from '../constants/contentRatings';
import { isThought, isCollection, isMedia, getCreatorIdentifier, normalizeId } from '../utils/contentClass';

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
  connectionsList: Array<{ connectionId: string; userDid: string; status: string; createdAt: string; acceptedAt?: string }>;
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

    const calculateClientScore = (file: IndexedFile, usePersonalization: boolean = false): number => {
      if ((file.metadata as any).recommendationScore !== undefined) {
        return (file.metadata as any).recommendationScore;
      }
      const engagement = file.metadata.engagement;
      const engagementScore =
        (engagement?.likes || 0) +
        (engagement?.comments || 0) * 2 +
        (engagement?.shares || 0) * 1.5;
      const uploadDate = file.metadata.uploadDate
        ? new Date(file.metadata.uploadDate).getTime()
        : Date.now();
      const daysSinceUpload = (Date.now() - uploadDate) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 100 - daysSinceUpload * 2);
      let score = engagementScore * 0.7 + recencyScore * 0.3;

      if (usePersonalization && userState.isUnlocked) {
        const fileSubjects = (file.metadata.subjects || []).map((s) => s.toLowerCase().trim());
        const subscribedSubjects = (userState.preferences.subscribedSubjects || []).map((s) =>
          s.toLowerCase().trim()
        );
        if (subscribedSubjects.length > 0 && fileSubjects.some((s) => subscribedSubjects.includes(s))) {
          score += 15;
        }
        const blockedSubjects = (userState.preferences.blockedSubjects || []).map((s) =>
          s.toLowerCase().trim()
        );
        if (blockedSubjects.length > 0 && fileSubjects.some((s) => blockedSubjects.includes(s))) {
          score -= 30;
        }
        const subscribedFeedIds = userState.preferences.subscribedFeedIds || [];
        if (
          subscribedFeedIds.length > 0 &&
          file.metadata.feedIds?.some((id) => subscribedFeedIds.includes(id))
        ) {
          score += 15;
        }
      }
      return Math.max(0, score);
    };

    const sortByScore = (
      files: IndexedFile[],
      usePersonalization: boolean = false
    ): IndexedFile[] => {
      return [...files].sort((a, b) => {
        const scoreA = calculateClientScore(a, usePersonalization);
        const scoreB = calculateClientScore(b, usePersonalization);
        return scoreB - scoreA;
      });
    };

    const applyConnectionFilter = (
      files: IndexedFile[],
      connectionFilter: 'all' | 'connections' | 'not_connections',
      userDid: string,
      connections: Array<{
        connectionId: string;
        userDid: string;
        status: string;
        createdAt: string;
        acceptedAt?: string;
      }>
    ): IndexedFile[] => {
      if (connectionFilter === 'all' || !userState.isUnlocked || connections.length === 0) {
        return files;
      }
      const connectedDids = new Set<string>();
      const userDidNormalized = normalizeId(userDid);
      connections.forEach((conn) => {
        // Connection.userPnIdentifier is the other user's identifier in the connection
        if (!conn.userPnIdentifier) {
          console.warn('[useFeedFiltering] Connection missing userPnIdentifier:', conn);
          return;
        }
        const otherUserPnIdentifier = normalizeId(conn.userPnIdentifier);
        if (otherUserPnIdentifier && otherUserPnIdentifier !== userDidNormalized) {
          connectedDids.add(otherUserPnIdentifier);
        }
      });
      return files.filter((file) => {
        const fileCreatorId = getCreatorIdentifier(file);
        if (!fileCreatorId) return true;
        const fileCreatorNormalized = normalizeId(fileCreatorId);
        if (fileCreatorNormalized === userDidNormalized) {
          return connectionFilter !== 'not_connections';
        }
        const isConnected = connectedDids.has(fileCreatorNormalized);
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
      connections: Array<{ connectionId: string; userDid: string; status: string; createdAt: string; acceptedAt?: string }>
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
