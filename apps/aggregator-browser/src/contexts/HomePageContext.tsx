/**
 * Context for HomePage - state and handlers from App.
 * Allows HomePage to access app state without 80+ props.
 */

import React from 'react';
import { IndexedFile, Feed } from '../types/aggregator';
import { MetadataFilters } from '../types/aggregator';
import type { FeedRailItem } from '../components/FeedRail';

export interface HomePageContextValue {
  // View & feed
  viewMode: 'grid' | 'feed';
  setViewMode: (m: 'grid' | 'feed') => void;
  viewportHeightCSS: string;
  activeFeedId: string;
  setActiveFeedId: (id: string) => void;
  feedRailItems: FeedRailItem[];
  currentFeedIndex: number;
  setCurrentFeedIndex: (n: number) => void;
  filteredFilesByFeed: IndexedFile[];
  // Search & filters
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filters: MetadataFilters;
  setFilters: (f: MetadataFilters) => void;
  setCurrentPage: (n: number) => void;
  setHasMore: (v: boolean) => void;
  // Data
  error: string | null;
  isLoading: boolean;
  hasMore: boolean;
  indexedFiles: IndexedFile[];
  thumbnails: Map<string, string>;
  setThumbnails: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  videoBlobs: Map<string, string>;
  setVideoBlobs: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  mediaDimensions: Map<string, { width: number; height: number }>;
  setMediaDimensions: React.Dispatch<React.SetStateAction<Map<string, { width: number; height: number }>>>;
  videoPlaying: Map<string, boolean>;
  setVideoPlaying: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  generatingThumbnails: Set<string>;
  setGeneratingThumbnails: React.Dispatch<React.SetStateAction<Set<string>>>;
  userState: { isUnlocked: boolean; pnIdentifier?: string; preferences?: any };
  feeds: Feed[];
  stableIndexedFiles: IndexedFile[];
  // Refs (as ref objects)
  hasMoreRef: React.MutableRefObject<boolean>;
  feedScrollRef: React.RefObject<HTMLDivElement | null>;
  horizontalSwipeRef: React.MutableRefObject<HTMLDivElement | null>;
  isManualFeedChangeRef: React.MutableRefObject<boolean>;
  discoverFilesRef: React.MutableRefObject<((a?: MetadataFilters, b?: boolean, c?: number, d?: boolean) => Promise<void>) | null>;
  // Handlers
  handleSearch: () => void;
  handleFilterChange: (key: keyof MetadataFilters, value: any) => void;
  discoverFiles: (filters?: MetadataFilters, forceRefresh?: boolean, page?: number, append?: boolean) => Promise<void>;
  isLiked: (fileId: string) => boolean;
  toggleLike: (fileId: string) => void;
  isDisliked: (fileId: string) => boolean;
  toggleDislike: (fileId: string) => void;
  getLikeCount: (fileId: string, defaultCount: number) => number;
  getComments: (fileId: string) => any[];
  loadComments?: (fileId: string) => Promise<any[]>;
  getShareCount: (fileId: string, defaultCount: number) => number;
  share: (fileId: string) => void;
  getFileProps: (f: IndexedFile) => { file: IndexedFile; isLiked: boolean; isOwner: boolean };
  isThought: (f: IndexedFile) => boolean;
  getCreatorIdentifier: (f: IndexedFile) => string | null;
  handleComment: (f: IndexedFile) => void;
  handleLike: (fileId: string) => void;
  handleShare: (fileId: string) => void;
  handleReportCopyright?: (file: IndexedFile) => void;
  handleCreatorClick: (creatorId: string) => void;
  handleNextFeed: () => void;
  handlePreviousFeed: () => void;
  handleFeedCreated: (feed: Feed) => void;
  setViewingCreatorId: (id: string | null) => void;
  setViewingBrandedFeed: (f: Feed | null) => void;
  setMePageTab: (t: string) => void;
  setVisibleFileId: (id: string | null) => void;
  setShowCreateFeedModal: (v: boolean) => void;
  setShowUploadModal: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  setAddingToFeedFile: (f: IndexedFile | null) => void;
  setShowFeedBrowser: (v: boolean) => void;
  setCommentingFile: (f: IndexedFile | null) => void;
  setEditingFile: (f: IndexedFile | null) => void;
  setInitialThread: (t: { participantPnIdentifier: string; participantName?: string } | null) => void;
  setShowInbox: (v: boolean) => void;
  setActiveBottomTab: (t: 'home' | 'search' | 'upload' | 'index' | 'messages') => void;
  isLoadingMore: boolean;
  success: (msg: string) => void;
  showErrorToast: (msg: string) => void;
}

const defaultVal: HomePageContextValue | null = null;
export const HomePageContext = React.createContext<HomePageContextValue | null>(defaultVal);
