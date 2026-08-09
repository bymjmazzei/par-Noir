/**
 * Home page - discover/feed grid and feed view.
 * Uses HomePageContext for state and handlers from App.
 */

import React, { useContext } from 'react';
import { useStorageConnected } from '../hooks/useStorageConnected';
import { Search, Filter, User, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { ShareToken } from '../utils/tokenDecryption';
import { decryptPublicFeedMedia } from '../utils/publicMediaDecrypt';
import { calculateMediaScaling } from '../utils/mediaScaling';
import { saveToFeed } from '../services/savedFeedService';
import { FeedRail } from '../components/FeedRail';
import { FullScreenFeed } from '../components/FullScreenFeed';
import { FeedEngagementSidebar } from '../components/FeedEngagementSidebar';
import { DiscoveryPage } from '../components/DiscoveryPage';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { ContentRatingBadge } from '../components/ContentRatingBadge';
import { NotificationBell } from '../components/NotificationBell';
import { Settings, Upload, Plus } from 'lucide-react';
import { IndexedFile } from '../types/aggregator';
import { HomePageContext } from '../contexts/HomePageContext';

function getTextPostData(file: IndexedFile) {
  return (file.metadata as any).textPost || (file.metadata as any).thought || null;
}

export function HomePage() {
  const ctx = useContext(HomePageContext);
  const storageConnected = useStorageConnected(ctx?.userState.pnIdentifier);
  if (!ctx) return null;

  const {
    viewMode,
    setViewMode,
    viewportHeightCSS,
    activeFeedId,
    setActiveFeedId,
    feedRailItems,
    currentFeedIndex,
    setCurrentFeedIndex,
    filteredFilesByFeed,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    setCurrentPage,
    setHasMore,
    hasMoreRef,
    discoverFiles,
    error,
    isLoading,
    hasMore,
    indexedFiles,
    thumbnails,
    videoBlobs,
    setVideoBlobs,
    mediaDimensions,
    setMediaDimensions,
    videoPlaying,
    setVideoPlaying,
    generatingThumbnails,
    userState,
    feeds,
    stableIndexedFiles,
    feedScrollRef,
    horizontalSwipeRef,
    isManualFeedChangeRef,
    handleSearch,
    handleFilterChange,
    isLiked,
    toggleLike,
    isDisliked,
    toggleDislike,
    getLikeCount,
    getComments,
    loadComments,
    getShareCount,
    share,
    getFileProps,
    isThought,
    handleComment,
    handleLike,
    handleShare,
    handleReportCopyright,
    handleCreatorClick,
    handleNextFeed,
    handlePreviousFeed,
    setViewingCreatorId,
    setViewingBrandedFeed,
    setMePageTab,
    setShowCreateFeedModal,
    setShowUploadModal,
    setShowSettings,
    setAddingToFeedFile,
    setCommentingFile,
    setInitialThread,
    setShowInbox,
    setActiveBottomTab,
    isLoadingMore,
    success,
    showErrorToast,
  } = ctx;

  return (
    <div className={`${viewMode === 'feed' ? 'h-full flex flex-col' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
      {viewMode !== 'feed' && (
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">par Noir Content Browser</h1>
          <p className="text-text-secondary">Discover public encrypted content from the par Noir network</p>
        </div>
      )}

      {viewMode === 'feed' && (
        <div
          className="fixed left-0 h-12 flex items-center z-[100] bg-transparent"
          style={{ right: '56px', top: 'env(safe-area-inset-top, 0px)' }}
        >
          <FeedRail
            feeds={feedRailItems}
            activeFeedId={activeFeedId}
            onFeedSelect={(feedId) => {
              isManualFeedChangeRef.current = true;
              setActiveFeedId(feedId);
            }}
            onBrowseFeeds={undefined}
          />
        </div>
      )}

      {viewMode !== 'feed' && (
        <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6 mb-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by tags (comma-separated)..."
                  className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => { if (e.key === 'Enter') handleSearch(); }}
                />
              </div>
              <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">Search</button>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilters({});
                  setCurrentPage(0);
                  setHasMore(true);
                  hasMoreRef.current = true;
                  discoverFiles({}, false, 0, false);
                }}
                className="px-4 py-2 bg-neutral-700 text-white text-sm font-medium rounded-lg hover:bg-neutral-600 transition-colors"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center space-x-4 text-sm">
              <Filter className="h-4 w-4 text-text-secondary" />
              <span className="text-text-secondary">Filters:</span>
              <select
                value={filters.fileType || ''}
                onChange={(e) => handleFilterChange('fileType', e.target.value || undefined)}
                className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="document">Documents</option>
                <option value="file">Other</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {viewMode !== 'feed' && (
        <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-sm">Public Files Discovered</p>
              <p className="text-white text-2xl font-bold">{indexedFiles.length}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => { setCurrentPage(0); setHasMore(true); hasMoreRef.current = true; discoverFiles(undefined, true, 0, false); }}
                disabled={isLoading}
                className="px-4 py-2 bg-neutral-700 text-white text-sm font-medium rounded-lg hover:bg-neutral-600 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              {userState.isUnlocked && userState.pnIdentifier && (
                <>
                  <NotificationBell
                    onNotificationClick={(n) => {
                      if (n.data?.file_id) {
                        setViewMode('feed');
                        setTimeout(() => {
                          const el = document.querySelector(`[data-file-id="${n.data?.file_id}"]`);
                          if (el && feedScrollRef.current) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                      } else if (n.data?.feed_id) {
                        const f = feeds.find(x => x.feedId === n.data?.feed_id);
                        if (f) setViewingBrandedFeed(f);
                      }
                    }}
                  />
                  <button onClick={() => setShowCreateFeedModal(true)} className="p-2 text-text-secondary hover:text-white transition-colors" title="Create Feed"><Plus className="h-5 w-5" /></button>
                  <button onClick={() => setShowUploadModal(true)} className="p-2 text-text-secondary hover:text-white transition-colors" title="Upload File"><Upload className="h-5 w-5" /></button>
                </>
              )}
              <button onClick={() => setShowSettings(true)} className="p-2 text-text-secondary hover:text-white transition-colors" title="Settings"><Settings className="h-5 w-5" /></button>
            </div>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
          <p className="text-yellow-400 text-sm">{error}</p>
          <p className="text-yellow-400/80 text-xs mt-2">
            Note: Connect cloud storage at{' '}
            <button
              type="button"
              onClick={async () => {
                const { openExternalUrl } = await import('../utils/openExternalUrl');
                await openExternalUrl('https://pn.parnoir.com');
              }}
              className="underline hover:no-underline"
            >
              pn.parnoir.com
            </button>{' '}
            first to scan for public files
          </p>
        </div>
      )}

      {isLoading ? (
        viewMode === 'feed' ? <LoadingSkeleton type="feed" count={3} /> : <LoadingSkeleton type="grid" count={6} />
      ) : indexedFiles.length === 0 ? (
        <EmptyState
          type="no-content"
          message={storageConnected === false ? 'Connect cloud storage in the dashboard to scan for public files' : 'No files have been marked as public yet. Mark files as public in the dashboard to see them here.'}
        />
      ) : viewMode === 'feed' && activeFeedId === 'discovery' ? (
        <div
          className="flex-1 h-full pb-20"
          style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}
        >
          <DiscoveryPage
            files={indexedFiles}
            feeds={feeds}
            thumbnails={thumbnails}
            onFileClick={(file) => {
              const i = indexedFiles.findIndex(f => f.metadata.fileId === file.metadata.fileId);
              if (i !== -1) { setActiveFeedId('public'); setCurrentFeedIndex(i); }
            }}
            onFeedClick={(feed) => setViewingBrandedFeed(feed)}
            onCreatorClick={(creatorId) => { setViewingCreatorId(creatorId); setViewMode('feed'); setMePageTab('all'); }}
          />
        </div>
      ) : viewMode === 'feed' ? (
        <div
          ref={(el) => { if ((horizontalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current !== el) (horizontalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
          className="flex-1 relative"
          style={{ height: viewportHeightCSS, maxHeight: viewportHeightCSS }}
        >
          {filteredFilesByFeed.length > 0 ? (
            <>
              <FullScreenFeed
                files={filteredFilesByFeed}
                key={`feed-${activeFeedId}-${filteredFilesByFeed.length}`}
                currentIndex={currentFeedIndex}
                thumbnails={thumbnails}
                videoBlobs={videoBlobs}
                onIndexChange={setCurrentFeedIndex}
                onSwipeLeft={handleNextFeed}
                onSwipeRight={handlePreviousFeed}
                onLike={(fileId) => { const w = isLiked(fileId); toggleLike(fileId); if (!w) success('Liked!'); }}
                onDislike={(fileId) => { const w = isDisliked(fileId); toggleDislike(fileId); if (!w) success('Disliked'); }}
                isDisliked={isDisliked}
                onComment={(file) => setCommentingFile(file)}
                onShare={share}
                onAddToFeed={(file) => {
                  const c = file.metadata.creator?.identifier?.value || file.metadata.creator?.['@id'] || file.metadata.author?.did;
                  if (userState.isUnlocked && userState.pnIdentifier === c) setAddingToFeedFile(file);
                }}
                onSave={userState.isUnlocked && userState.pnIdentifier ? async (file) => {
                  try { await saveToFeed(userState.pnIdentifier!, file.metadata.fileId); success('Saved to your private collection!'); }
                  catch { showErrorToast('Failed to save. Please try again.'); }
                } : undefined}
                isLiked={isLiked}
                getLikeCount={getLikeCount}
                getComments={getComments}
                loadComments={loadComments}
                getShareCount={getShareCount}
                userState={userState}
                onCreatorClick={(id) => setViewingCreatorId(id)}
                onMessage={(id) => { setInitialThread({ participantPnIdentifier: id }); setShowInbox(true); setActiveBottomTab('messages'); }}
                onReportCopyright={handleReportCopyright}
              />
              {viewMode === 'feed' && hasMore && <div id="feed-infinite-scroll-sentinel" data-feed-container="true" style={{ height: '1px', width: '100%' }} />}
              {viewMode === 'feed' && isLoadingMore && <div className="flex justify-center py-4"><p className="text-text-secondary text-sm">Loading more...</p></div>}
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-white">
              <EmptyState type="no-content" message="No content available in this feed" />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {indexedFiles.map((indexedFile) => {
            const file = indexedFile.metadata;
            const isImage = file.fileType === 'image' || !!(file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
            const isVideo = file.fileType === 'video' || !!(file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
            const fileName = file.name || file.title || 'Untitled';
            const collectionData = indexedFile.metadata?.collection;
            const isCollectionFile = file.fileType === 'collection' && collectionData && typeof collectionData === 'object' && Array.isArray(collectionData.collectionFileIds) && collectionData.collectionFileIds.length > 0;
            const isThoughtFile = isThought(indexedFile);

            return (
              <div
                key={file.fileId}
                className="bg-neutral-900/60 border border-neutral-700 rounded-xl overflow-hidden hover:bg-neutral-800 transition-colors cursor-pointer group"
                onClick={() => {
                  setViewMode('feed');
                  setTimeout(() => {
                    const el = document.querySelector(`[data-file-id="${file.fileId}"]`);
                    if (el && feedScrollRef.current) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100);
                }}
              >
                {isCollectionFile && collectionData?.collectionFileIds && (
                  <div className="w-full h-48 bg-neutral-800 flex items-center justify-center relative overflow-hidden">
                    {(() => {
                      const urls = (collectionData.collectionFileIds as string[]).map((id: string) => thumbnails.get(id)).filter((u): u is string => !!u);
                      if (urls.length > 0) {
                        return (
                          <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                            {urls.map((url, i) => (
                              <div key={`${file.fileId}-${i}`} className="flex-shrink-0 w-full h-full snap-start">
                                <img src={url} alt={`${fileName} - ${i + 1}`} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/placeholder-thumbnail.png'; }} />
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col items-center justify-center text-neutral-400">
                          <div className="text-4xl mb-2">📚</div>
                          <div className="text-sm">Collection</div>
                          <div className="text-xs mt-1">{(collectionData.collectionFileIds as string[]).length} files</div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {!isCollectionFile && isThoughtFile && (
                  <div className="w-full h-48 bg-neutral-800 flex items-center justify-center relative overflow-hidden">
                    {(() => {
                      const textPostData = getTextPostData(indexedFile);
                      const thoughtThumbnail = thumbnails.get(file.fileId);
                      if (thoughtThumbnail) {
                        const dims = mediaDimensions.get(file.fileId) || { width: 1080, height: 1080 };
                        const s = calculateMediaScaling(dims, { width: 192, height: 192 });
                        return (
                          <>
                            <img src={thoughtThumbnail} alt="" className="absolute" style={s.background} loading="lazy" decoding="async" />
                            <div className="w-full h-full flex items-center justify-center relative z-10">
                              <img
                                src={thoughtThumbnail}
                                alt={fileName}
                                style={s.mainMedia}
                                onLoad={(e) => setMediaDimensions(prev => { const m = new Map(prev); m.set(file.fileId, { width: e.currentTarget.naturalWidth || 1080, height: e.currentTarget.naturalHeight || 1080 }); return m; })}
                                loading="lazy"
                              />
                            </div>
                          </>
                        );
                      }
                      if (textPostData) {
                        return (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{
                              backgroundColor: textPostData?.style?.backgroundColor || '#000000',
                              backgroundImage: textPostData?.style?.backgroundImage ? `url(${textPostData.style.backgroundImage})` : 'none',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }}
                          >
                            <div className="w-full px-4 text-center" style={{ fontFamily: textPostData?.style?.fontFamily || 'Arial', fontSize: `${Math.min(textPostData?.style?.fontSize || 16, 24)}px`, color: textPostData?.style?.textColor || '#FFF', padding: `${Math.min(textPostData?.style?.padding || 20, 20)}px`, lineHeight: 1.2, wordWrap: 'break-word', overflow: 'hidden' }}>
                              {textPostData?.content || file.description || fileName || 'Thought'}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col items-center justify-center text-neutral-500">
                          <div className="text-2xl mb-2">💭</div>
                          <span className="text-xs">Thought</span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {!isCollectionFile && !isThoughtFile && (isImage || isVideo) && (
                  <div
                    className="w-full h-48 bg-neutral-800 flex items-center justify-center relative overflow-hidden group"
                    onMouseEnter={async () => {
                      if (isVideo && file.publicToken && !videoBlobs.has(file.fileId)) {
                        try {
                          let token: ShareToken;
                          try { token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken; } catch { return; }
                          const blob = await decryptPublicFeedMedia(file.fileId, token);
                          const url = URL.createObjectURL(blob);
                          setVideoBlobs(prev => { const m = new Map(prev); m.set(file.fileId, url); return m; });
                        } catch (_) {}
                      }
                    }}
                  >
                    {isVideo && videoBlobs.get(file.fileId) && videoPlaying.get(file.fileId) ? (
                      <video src={videoBlobs.get(file.fileId)!} className="w-full h-full object-cover" controls autoPlay muted loop onMouseLeave={() => setVideoPlaying(prev => { const m = new Map(prev); m.set(file.fileId, false); return m; })} />
                    ) : thumbnails.get(file.fileId) ? (
                      <div className="relative w-full h-full cursor-pointer" onClick={() => { if (isVideo) setVideoPlaying(prev => { const m = new Map(prev); m.set(file.fileId, true); return m; }); }}>
                        <img src={thumbnails.get(file.fileId)!} alt={fileName} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        {isVideo && <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"><div className="bg-black/50 rounded-full p-4"><svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></div></div>}
                      </div>
                    ) : generatingThumbnails.has(file.fileId) ? (
                      <div className="flex flex-col items-center justify-center text-neutral-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2" /><span className="text-xs">Generating thumbnail...</span></div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-neutral-500"><ImageIcon className="h-12 w-12 mb-2" /><span className="text-xs">Encrypted {isVideo ? 'Video' : 'Image'}</span><span className="text-xs text-neutral-600 mt-1">Decryption required</span></div>
                    )}
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate group-hover:text-blue-400 transition-colors">{fileName}</h3>
                      <p className="text-text-secondary text-xs mt-1">{isThoughtFile ? 'Thought' : isVideo ? 'Video' : file.fileType === 'image' ? 'Image' : file.fileType || 'File'} • {new Date(file.uploadDate).toLocaleDateString()}</p>
                    </div>
                    {file.metadata?.isNSFW && <ContentRatingBadge isNSFW={true} size="sm" className="ml-2 flex-shrink-0" />}
                  </div>
                  {file.description && <p className="text-text-secondary text-sm mb-3 line-clamp-2">{file.description}</p>}
                  <button
                    onClick={(e) => { e.stopPropagation(); const c = file.creator?.identifier?.value || file.creator?.['@id'] || file.author?.did; if (c) setViewingCreatorId(c); }}
                    className="flex items-center space-x-2 text-xs text-text-secondary mb-3 hover:text-blue-400 transition-colors w-full text-left"
                  >
                    <User className="h-3 w-3" />
                    <span className="truncate">{file.creator?.identifier?.value || file.creator?.['@id'] || file.author?.did || 'Unknown'}</span>
                  </button>
                  {(file.keywords || file.tags) && (file.keywords || file.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(file.keywords || file.tags || []).slice(0, 3).map((tag: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">#{tag}</span>
                      ))}
                      {(file.keywords || file.tags || []).length > 3 && <span className="px-2 py-0.5 text-text-secondary text-xs">+{(file.keywords || file.tags || []).length - 3}</span>}
                    </div>
                  )}
                  <div className="pt-3 border-t border-neutral-700 relative" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      {(() => { const fp = getFileProps(indexedFile); return <FeedEngagementSidebar file={fp.file} isLiked={fp.isLiked} onLike={() => handleLike(file.fileId)} onComment={() => handleComment(indexedFile)} onShare={() => handleShare(file.fileId)} isOwner={fp.isOwner} onCreatorClick={handleCreatorClick} indexedFiles={stableIndexedFiles} />; })()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
