/**
 * Feed filtering: NSFW, connection filter, sorting, and feed-specific logic.
 * Isolates changes to what's shown in the feed from the rest of the app.
 */

import { useMemo } from 'react';
import type { IndexedFile, Feed } from '../types/aggregator';
import { isNote, isCollection, isMedia } from '../utils/contentClass';
import { filterFilesForFeed } from '../utils/filterFilesForFeed';

export interface UseFeedFilteringParams {
  mediaFiles: IndexedFile[];
  notesFiles: IndexedFile[];
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
  connectionsList: Array<{
    connectionId: string;
    userPnIdentifier: string;
    status: string;
    createdAt: string;
    acceptedAt?: string;
  }>;
  feeds: Feed[];
  viewMode: 'grid' | 'feed';
}

export function useFeedFiltering({
  mediaFiles,
  notesFiles,
  collectionsFiles,
  activeFeedId,
  userState,
  connectionsList,
  feeds,
  viewMode,
}: UseFeedFilteringParams) {
  const filteredFilesByFeed = useMemo(() => {
    const processed = filterFilesForFeed({
      mediaFiles,
      notesFiles,
      collectionsFiles,
      feedId: activeFeedId,
      userState,
      connectionsList,
      feeds,
    });
    if (process.env.NODE_ENV === 'development' && activeFeedId === 'public') {
      console.log(`[Public Feed] ${processed.length} files`);
    }
    return processed;
  }, [
    mediaFiles,
    notesFiles,
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

  return { filteredFilesByFeed, isNote, isCollection, isMedia };
}
