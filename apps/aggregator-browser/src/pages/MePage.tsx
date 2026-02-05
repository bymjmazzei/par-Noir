/**
 * Me / profile page - creator view with MePageTabsRail and FullScreenFeed or empty state.
 */

import React from 'react';
import { MePageTabsRail } from '../components/MePageTabsRail';
import { FullScreenFeed } from '../components/FullScreenFeed';
import { FeedEngagementSidebar } from '../components/FeedEngagementSidebar';
import { IndexedFile } from '../types/aggregator';

export type MePageTab = 'all' | 'media' | 'thoughts' | 'collections' | 'likes' | 'comments' | 'shares' | 'saved' | 'connections';

export interface MePageProps {
  commentingFile: unknown;
  viewingCreatorId: string;
  mePageTab: MePageTab;
  onTabSelect: (tab: MePageTab) => void;
  isOwnIndex: boolean;
  filteredMeFiles: IndexedFile[];
  currentFeedIndex: number;
  setCurrentFeedIndex: (n: number) => void;
  viewportHeightCSS: string;
  thumbnails: Map<string, string>;
  videoBlobs: Map<string, string>;
  userState: { isUnlocked: boolean; pnIdentifier?: string };
  isLiked: (fileId: string) => boolean;
  toggleLike: (fileId: string) => void;
  getLikeCount: (fileId: string, defaultCount: number) => number;
  getComments: (fileId: string) => any[];
  loadComments?: (fileId: string) => Promise<any[]>;
  getShareCount: (fileId: string, defaultCount: number) => number;
  getDisplayName: (id: string) => string | undefined;
  onComment: (file: IndexedFile) => void;
  onShare: (fileId: string) => void;
  setViewingCreatorId: (id: string | null) => void;
  setInitialThread: (t: { participantPnIdentifier: string; participantName?: string } | null) => void;
  setShowInbox: (v: boolean) => void;
  setActiveBottomTab: (tab: 'home' | 'search' | 'upload' | 'index' | 'messages') => void;
  setEditingFile: (f: IndexedFile | null) => void;
  onSave: ((file: IndexedFile) => void) | undefined;
  success: (msg: string) => void;
  onReportCopyright?: (file: IndexedFile) => void;
}

export function MePage({
  commentingFile,
  viewingCreatorId,
  mePageTab,
  onTabSelect,
  isOwnIndex,
  filteredMeFiles,
  currentFeedIndex,
  setCurrentFeedIndex,
  viewportHeightCSS,
  thumbnails,
  videoBlobs,
  userState,
  isLiked,
  toggleLike,
  getLikeCount,
  getComments,
  loadComments,
  getShareCount,
  getDisplayName,
  onComment,
  onShare,
  setViewingCreatorId,
  setInitialThread,
  setShowInbox,
  setActiveBottomTab,
  setEditingFile,
  onSave,
  success,
  onReportCopyright,
}: MePageProps) {
  const emptyStateCreatorId = viewingCreatorId || (isOwnIndex ? userState.pnIdentifier : null) || null;
  const emptyStateName = emptyStateCreatorId ? (getDisplayName(emptyStateCreatorId) || emptyStateCreatorId) : 'User';

  const handleCreatorClick = (creatorId: string) => {
    if (creatorId !== viewingCreatorId) {
      setViewingCreatorId(creatorId);
      onTabSelect('all');
      setCurrentFeedIndex(0);
    }
  };

  const handleMessage = (creatorId: string) => {
    setInitialThread({ participantPnIdentifier: creatorId });
    setShowInbox(true);
    setActiveBottomTab('messages');
  };

  return (
    <div
      className="h-screen flex flex-col bg-black"
      style={{
        pointerEvents: commentingFile ? 'none' : 'auto',
        zIndex: commentingFile ? 0 : 'auto',
      }}
    >
      <MePageTabsRail
        activeTab={mePageTab}
        onTabSelect={(tab) => {
          if (!isOwnIndex && (tab === 'saved' || tab === 'connections' || tab === 'shares')) return;
          onTabSelect(tab);
          setCurrentFeedIndex(0);
        }}
        availableTabs={isOwnIndex ? ['connections', 'all', 'media', 'thoughts', 'collections', 'likes', 'comments', 'shares', 'saved'] : ['all', 'media', 'thoughts', 'collections', 'likes', 'comments']}
      />

      {filteredMeFiles.length > 0 && filteredMeFiles[currentFeedIndex] ? (
        <div className="flex-1" style={{ height: viewportHeightCSS, maxHeight: viewportHeightCSS }}>
          <FullScreenFeed
            files={filteredMeFiles}
            currentIndex={currentFeedIndex}
            thumbnails={thumbnails}
            videoBlobs={videoBlobs}
            onIndexChange={(newIndex) => {
              if (newIndex >= 0 && newIndex < filteredMeFiles.length && newIndex !== currentFeedIndex) {
                setCurrentFeedIndex(newIndex);
              }
            }}
            onLike={(fileId) => {
              const wasLiked = isLiked(fileId);
              toggleLike(fileId);
              if (!wasLiked) success('Liked!');
            }}
            onComment={onComment}
            onShare={onShare}
            isLiked={isLiked}
            getLikeCount={getLikeCount}
            getComments={getComments}
            loadComments={loadComments}
            getShareCount={getShareCount}
            userState={userState}
            mePageTab={mePageTab}
            onCreatorClick={handleCreatorClick}
            onMessage={handleMessage}
            onReportCopyright={onReportCopyright}
            onEdit={isOwnIndex ? (file) => setEditingFile(file) : undefined}
            onSave={onSave}
          />
        </div>
      ) : (
        <div className="flex-1" style={{ height: viewportHeightCSS, maxHeight: viewportHeightCSS }}>
          <div className="relative w-full h-full flex">
            <div
              className="flex-1 relative overflow-hidden"
              style={{
                backgroundImage: 'url(/branding/Par-Noir-Background-Dark.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            >
              <div
                className="absolute left-0 right-20 p-4 md:p-6 z-10"
                style={{ bottom: '10px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                <h3 className="text-white text-base md:text-lg font-semibold line-clamp-1">{emptyStateName}</h3>
              </div>
            </div>
            {emptyStateCreatorId && (
              <FeedEngagementSidebar
                file={
                  {
                    metadata: {
                      fileId: `me-page-empty-${emptyStateCreatorId}`,
                      backend: 'empty-state',
                      backendFileId: `me-page-empty-${emptyStateCreatorId}`,
                      uploadDate: new Date().toISOString(),
                      fileType: 'other',
                      isPublic: false,
                      name: emptyStateName,
                      creatorId: emptyStateCreatorId,
                      creator: {
                        '@type': 'Person',
                        '@id': emptyStateCreatorId,
                        identifier: { '@type': 'PropertyValue', name: 'DID', value: emptyStateCreatorId },
                      },
                      engagement: {
                        views: 0,
                        likes: 0,
                        comments: 0,
                        shares: 0,
                        saves: 0,
                        lastUpdated: new Date().toISOString(),
                      },
                    },
                  } as IndexedFile
                }
                isLiked={false}
                onLike={() => {}}
                onComment={() => {}}
                onShare={async () => {}}
                onAddToFeed={undefined}
                onEdit={undefined}
                isOwner={isOwnIndex && emptyStateCreatorId === userState.pnIdentifier}
                onCreatorClick={handleCreatorClick}
                onMessage={handleMessage}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
