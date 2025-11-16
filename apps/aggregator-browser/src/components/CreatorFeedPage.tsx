/**
 * Creator Feed Page Component
 * Profile-like page for creators with feed view toggle and statistics
 */

import React, { useState, useMemo, useEffect } from 'react';
import { IndexedFile, Feed } from '../types/aggregator';
import { Grid, List, TrendingUp, Eye, Heart, MessageCircle, Share2, Users } from 'lucide-react';
import { FullScreenFeed } from './FullScreenFeed';
import { useUserState } from '../contexts/UserStateContext';

interface CreatorFeedPageProps {
  creatorId: string;
  creatorName?: string;
  files: IndexedFile[];
  feeds: Feed[];
  onFileClick: (file: IndexedFile) => void;
  onFeedClick: (feed: Feed) => void;
  onBack: () => void;
  onLike: (fileId: string) => void;
  onComment: (file: IndexedFile) => void;
  onShare: (fileId: string) => void;
  isLiked: (fileId: string) => boolean;
  getLikeCount: (fileId: string, defaultCount: number) => number;
  getComments: (fileId: string) => any[];
  getShareCount: (fileId: string, defaultCount: number) => number;
}

type ViewMode = 'fullscreen' | 'grid';

export function CreatorFeedPage({
  creatorId,
  creatorName,
  files,
  feeds,
  onFileClick,
  onFeedClick,
  onBack,
  onLike,
  onComment,
  onShare,
  isLiked,
  getLikeCount,
  getComments,
  getShareCount
}: CreatorFeedPageProps) {
  const { userState } = useUserState();
  const [viewMode, setViewMode] = useState<ViewMode>('fullscreen');
  const [currentIndex, setCurrentIndex] = useState(0);

  // Check if this is the user's own profile
  const isOwnProfile = userState.isUnlocked && userState.pnIdentifier === creatorId;

  // Filter files by creator
  const creatorFiles = useMemo(() => {
    return files.filter(file => {
      const fileCreatorId = file.metadata.creator?.identifier?.value || 
                           file.metadata.creator?.["@id"] || 
                           file.metadata.author?.did;
      return fileCreatorId === creatorId;
    });
  }, [files, creatorId]);

  // Get creator's feeds
  const creatorFeeds = useMemo(() => {
    return feeds.filter(feed => feed.creatorId === creatorId);
  }, [feeds, creatorId]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalViews = creatorFiles.reduce((sum, file) => 
      sum + (file.metadata.engagement?.views || 0), 0
    );
    const totalLikes = creatorFiles.reduce((sum, file) => 
      sum + (file.metadata.engagement?.likes || 0), 0
    );
    const totalComments = creatorFiles.reduce((sum, file) => 
      sum + (file.metadata.engagement?.comments || 0), 0
    );
    const totalShares = creatorFiles.reduce((sum, file) => 
      sum + (file.metadata.engagement?.shares || 0), 0
    );
    const totalSubscribers = creatorFeeds.reduce((sum, feed) => 
      sum + (feed.subscriberCount || 0), 0
    );

    // Calculate growth trends (simplified - would need historical data)
    const recentFiles = creatorFiles
      .filter(file => {
        const uploadDate = new Date(file.metadata.uploadDate);
        const daysAgo = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 30;
      })
      .slice(0, 10);

    const recentEngagement = recentFiles.reduce((sum, file) => 
      sum + (file.metadata.engagement?.likes || 0) + 
           (file.metadata.engagement?.comments || 0), 0
    );

    const olderFiles = creatorFiles
      .filter(file => {
        const uploadDate = new Date(file.metadata.uploadDate);
        const daysAgo = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo > 30 && daysAgo <= 60;
      })
      .slice(0, 10);

    const olderEngagement = olderFiles.reduce((sum, file) => 
      sum + (file.metadata.engagement?.likes || 0) + 
           (file.metadata.engagement?.comments || 0), 0
    );

    const growthTrend = recentEngagement > olderEngagement ? 'up' : 
                       recentEngagement < olderEngagement ? 'down' : 'stable';

    return {
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
      totalSubscribers,
      totalPosts: creatorFiles.length,
      growthTrend
    };
  }, [creatorFiles, creatorFeeds]);

  // Display pN identifier - if creatorId is already a pN identifier (not a DID), use it directly
  // Otherwise, if it's a DID, we should have gotten the pN identifier from the API
  // For display purposes, just show the pN identifier (first 12 chars if longer)
  const getDisplayIdentifier = (id: string): string => {
    if (!id) return 'Unknown';
    // If it's already a pN identifier (doesn't start with did:key:), use it directly
    if (!id.startsWith('did:key:')) {
      return id.length > 12 ? id.substring(0, 12) : id;
    }
    // If it's a DID, we shouldn't be here (should have pN identifier from API)
    // But as fallback, show first 12 chars
    return id.length > 12 ? id.substring(0, 12) : id;
  };
  
  const displayIdentifier = getDisplayIdentifier(creatorId);
  const displayName = creatorName || displayIdentifier;

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700 px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          {!isOwnProfile && (
            <button
              onClick={onBack}
              className="text-neutral-400 hover:text-white transition-colors"
              aria-label="Back"
            >
              ← Back
            </button>
          )}
          {isOwnProfile && <div />} {/* Spacer when back button is hidden */}

          {/* View Toggle */}
          <div className="flex items-center space-x-2 bg-neutral-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('fullscreen')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'fullscreen'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              aria-label="Full screen view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
              aria-label="Grid view"
            >
              <Grid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Creator Info */}
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
            <span className="text-blue-400 text-xl font-bold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">{displayName}</h1>
            <p className="text-neutral-400 text-sm">{creatorId}</p>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Eye className="h-4 w-4 text-neutral-400" />
              <span className="text-neutral-400 text-xs">Views</span>
            </div>
            <div className="text-white text-lg font-bold">
              {stats.totalViews.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Heart className="h-4 w-4 text-neutral-400" />
              <span className="text-neutral-400 text-xs">Likes</span>
            </div>
            <div className="text-white text-lg font-bold">
              {stats.totalLikes.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <MessageCircle className="h-4 w-4 text-neutral-400" />
              <span className="text-neutral-400 text-xs">Comments</span>
            </div>
            <div className="text-white text-lg font-bold">
              {stats.totalComments.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Share2 className="h-4 w-4 text-neutral-400" />
              <span className="text-neutral-400 text-xs">Shares</span>
            </div>
            <div className="text-white text-lg font-bold">
              {stats.totalShares.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <Users className="h-4 w-4 text-neutral-400" />
              <span className="text-neutral-400 text-xs">Subscribers</span>
            </div>
            <div className="text-white text-lg font-bold">
              {stats.totalSubscribers.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Growth Trend */}
        <div className="mt-4 flex items-center space-x-2">
          <TrendingUp className={`h-4 w-4 ${
            stats.growthTrend === 'up' ? 'text-green-400' :
            stats.growthTrend === 'down' ? 'text-red-400' :
            'text-neutral-400'
          }`} />
          <span className={`text-sm ${
            stats.growthTrend === 'up' ? 'text-green-400' :
            stats.growthTrend === 'down' ? 'text-red-400' :
            'text-neutral-400'
          }`}>
            {stats.growthTrend === 'up' ? 'Growing' :
             stats.growthTrend === 'down' ? 'Declining' :
             'Stable'} engagement
          </span>
        </div>

        {/* Creator's Feeds */}
        {creatorFeeds.length > 0 && (
          <div className="mt-4">
            <h3 className="text-white font-semibold mb-2">Feeds</h3>
            <div className="flex flex-wrap gap-2">
              {creatorFeeds.map(feed => (
                <button
                  key={feed.feedId}
                  onClick={() => onFeedClick(feed)}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-white text-sm transition-colors"
                >
                  {feed.feedName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'fullscreen' ? (
          <FullScreenFeed
            files={creatorFiles}
            currentIndex={currentIndex}
            onIndexChange={setCurrentIndex}
            onLike={onLike}
            onComment={onComment}
            onShare={onShare}
            isLiked={isLiked}
            getLikeCount={getLikeCount}
            getComments={getComments}
            getShareCount={getShareCount}
            userState={userState}
            onCreatorClick={() => {}} // Already on creator page
          />
        ) : (
          <div className="p-4 overflow-y-auto h-full">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {creatorFiles.map((file) => (
                <div
                  key={file.metadata.fileId}
                  onClick={() => {
                    const index = creatorFiles.findIndex(f => f.metadata.fileId === file.metadata.fileId);
                    setCurrentIndex(index);
                    setViewMode('fullscreen');
                  }}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-video bg-neutral-800 rounded-lg overflow-hidden mb-2">
                    <img
                      src={file.thumbnail || '/placeholder-thumbnail.png'}
                      alt={file.metadata.name || file.metadata.title || 'Untitled'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder-thumbnail.png';
                      }}
                    />
                  </div>
                  <h3 className="text-white text-sm line-clamp-2 group-hover:text-blue-400 transition-colors">
                    {file.metadata.name || file.metadata.title || 'Untitled'}
                  </h3>
                  <p className="text-neutral-400 text-xs mt-1">
                    {new Date(file.metadata.uploadDate).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>

            {creatorFiles.length === 0 && (
              <div className="text-center py-12">
                <p className="text-neutral-400">No content available</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

