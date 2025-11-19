/**
 * Full Screen Feed Component
 * TikTok-style full-screen vertical feed with swipe navigation
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { IndexedFile } from '../types/aggregator';
import { FeedEngagementSidebar } from './FeedEngagementSidebar';
import { EngagementOverlay } from './EngagementOverlay';
import { PlaybackControls } from './PlaybackControls';
import { ContentRatingBadge } from './ContentRatingBadge';
import { File } from 'lucide-react';
import { useVerticalSwipe } from '../hooks/useVerticalSwipe';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';
import { decryptWithToken, ShareToken } from '../utils/tokenDecryption';
import { formatTimestamp } from '../utils/formatTimestamp';

interface FullScreenFeedProps {
  files: IndexedFile[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onLike: (fileId: string) => void;
  onComment: (file: IndexedFile) => void;
  onShare: (fileId: string) => void;
  onAddToFeed?: (file: IndexedFile) => void;
  onSave?: (file: IndexedFile) => void;
  onEdit?: (file: IndexedFile) => void;
  isLiked: (fileId: string) => boolean;
  getLikeCount: (fileId: string, defaultCount: number) => number;
  getComments: (fileId: string) => any[];
  getShareCount: (fileId: string, defaultCount: number) => number;
  userState: {
    isUnlocked: boolean;
    pnIdentifier?: string;
  };
  onCreatorClick?: (creatorId: string) => void;
  onMessage?: (creatorId: string) => void;
  onSwipeLeft?: () => void; // Horizontal swipe left handler
  onSwipeRight?: () => void; // Horizontal swipe right handler
}

export function FullScreenFeed({
  files,
  currentIndex,
  onIndexChange,
  onLike,
  onComment,
  onShare,
  onAddToFeed,
  onSave,
  onEdit,
  isLiked,
  getLikeCount,
  getComments,
  getShareCount,
  userState,
  onCreatorClick,
  onMessage,
  onSwipeLeft,
  onSwipeRight
}: FullScreenFeedProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(new Map());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [visibleFileId, setVisibleFileId] = useState<string | null>(null);
  const [showEngagementOverlay, setShowEngagementOverlay] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState<Map<string, boolean>>(new Map());
  const [expandedCaptions, setExpandedCaptions] = useState<Set<string>>(new Set());

  // Handle vertical swipe for next/previous media
  const verticalSwipeRef = useVerticalSwipe({
    onSwipeUp: () => {
      if (currentIndex < files.length - 1) {
        onIndexChange(currentIndex + 1);
      }
    },
    onSwipeDown: () => {
      if (currentIndex > 0) {
        onIndexChange(currentIndex - 1);
      }
    },
    enabled: true,
    threshold: 50,
    snapThreshold: 0.2
  });

  // Handle horizontal swipe for feed switching
  const horizontalSwipeRef = useHorizontalSwipe({
    onSwipeLeft,
    onSwipeRight,
    enabled: !!(onSwipeLeft || onSwipeRight),
    threshold: 40,
    snapThreshold: 0.2
  });

  // Scroll to current index when it changes
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const currentFile = files[currentIndex];
    if (!currentFile) return;

    // Add a small delay to ensure DOM is ready, especially when navigating from search
    const scrollTimer = setTimeout(() => {
      const element = scrollContainerRef.current?.querySelector(`[data-file-id="${currentFile.metadata.fileId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setVisibleFileId(currentFile.metadata.fileId);
    }
    }, 100);

    return () => clearTimeout(scrollTimer);
  }, [currentIndex, files]);

  // Load video blobs and thumbnails for visible files
  useEffect(() => {
    const loadMedia = async () => {
      // Load current file and adjacent files
      const indicesToLoad = [
        currentIndex - 1,
        currentIndex,
        currentIndex + 1
      ].filter(idx => idx >= 0 && idx < files.length);

      for (const idx of indicesToLoad) {
        const indexedFile = files[idx];
        const file = indexedFile.metadata;
        const fileId = file.fileId;

        const isVideo = file.fileType === 'video' || 
                       (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
        const isImage = file.fileType === 'image' || 
                       (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);

        if (isVideo && file.publicToken && !videoBlobs.has(fileId)) {
          try {
            let token: ShareToken;
            try {
              token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
            } catch (e) {
              continue;
            }
            const decryptedBlob = await decryptWithToken(token);
            const videoUrl = URL.createObjectURL(decryptedBlob);
            setVideoBlobs(prev => {
              const newMap = new Map(prev);
              newMap.set(fileId, videoUrl);
              return newMap;
            });
          } catch (err) {
            console.warn('Failed to load video:', err);
          }
        }

        if (isImage && file.publicToken && !thumbnails.has(fileId)) {
          try {
            let token: ShareToken;
            try {
              token = typeof file.publicToken === 'string' ? JSON.parse(file.publicToken) : file.publicToken;
            } catch (e) {
              continue;
            }
            const decryptedBlob = await decryptWithToken(token);
            const thumbnailUrl = URL.createObjectURL(decryptedBlob);
            setThumbnails(prev => {
              const newMap = new Map(prev);
              newMap.set(fileId, thumbnailUrl);
              return newMap;
            });
          } catch (err) {
            console.warn('Failed to load thumbnail:', err);
          }
        }
      }
    };

    loadMedia();
  }, [currentIndex, files, videoBlobs, thumbnails]);

  // Auto-play video when it becomes visible
  useEffect(() => {
    if (!visibleFileId) return;

    const videoElement = videoRefs.current.get(visibleFileId);
    const indexedFile = files.find(f => f.metadata.fileId === visibleFileId);
    if (!indexedFile) return;

    const file = indexedFile.metadata;
    const isVideo = file.fileType === 'video' || 
                   (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

    if (isVideo && videoElement && videoBlobs.has(visibleFileId)) {
      videoElement.play().catch(err => {
        console.warn('Failed to auto-play video:', err);
      });
    }
  }, [visibleFileId, files, videoBlobs]);

  // Intersection Observer for auto-playing videos
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const fileId = entry.target.getAttribute('data-file-id');
          if (!fileId) return;

          const videoElement = videoRefs.current.get(fileId);
          const indexedFile = files.find(f => f.metadata.fileId === fileId);
          if (!indexedFile) return;

          const file = indexedFile.metadata;
          const isVideo = file.fileType === 'video' || 
                         (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);

          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setVisibleFileId(fileId);
            if (isVideo && videoElement && videoBlobs.has(fileId)) {
              videoElement.play().catch(err => {
                console.warn('Failed to auto-play video:', err);
              });
            }
          } else {
            if (visibleFileId === fileId) {
              setVisibleFileId(null);
            }
            if (videoElement) {
              videoElement.pause();
            }
          }
        });
      },
      {
        threshold: [0, 0.5, 1],
        rootMargin: '0px'
      }
    );

    const fileElements = scrollContainerRef.current?.querySelectorAll('[data-file-id]');
    fileElements?.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [files, videoBlobs, visibleFileId]);

  // Cleanup video URLs on unmount
  useEffect(() => {
    return () => {
      videoBlobs.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const currentFile = files[currentIndex];
  if (!currentFile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black text-white">
        <p>No content available</p>
      </div>
    );
  }

  return (
    <div
      ref={(el) => {
        scrollContainerRef.current = el;
        if (verticalSwipeRef.current !== el) {
          (verticalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
        if (horizontalSwipeRef.current !== el) {
          (horizontalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      }}
      className="h-full w-full overflow-y-scroll snap-y snap-mandatory bg-black"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {files.map((indexedFile, idx) => {
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        const isVideo = file.fileType === 'video' || 
                       (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
        const isImage = file.fileType === 'image' || 
                       (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
        const fileName = file.name || file.title || 'Untitled';
        // Get creatorId - prefer pN identifier from metadata.creatorId, fallback to creator/author fields
        const creatorId = (indexedFile.metadata as any).creatorId || 
                          file.creator?.identifier?.value || 
                          file.creator?.["@id"] || 
                          file.author?.did;

        return (
          <div
            key={fileId}
            data-file-id={fileId}
            className="h-full w-full snap-start flex items-center justify-center bg-black relative"
            style={{ height: '100%', minHeight: '100%' }}
          >
            {/* Full-screen video */}
            {isVideo && videoBlobs.get(fileId) && (
              <>
                <video
                  ref={(el) => {
                    if (el) {
                      videoRefs.current.set(fileId, el);
                      // Track playing state
                      el.addEventListener('play', () => {
                        setVideoPlaying(prev => {
                          const newMap = new Map(prev);
                          newMap.set(fileId, true);
                          return newMap;
                        });
                      });
                      el.addEventListener('pause', () => {
                        setVideoPlaying(prev => {
                          const newMap = new Map(prev);
                          newMap.set(fileId, false);
                          return newMap;
                        });
                      });
                    }
                  }}
                  src={videoBlobs.get(fileId)!}
                  className="w-full h-full object-contain"
                  controls={false}
                  muted
                  loop
                  playsInline
                  autoPlay={visibleFileId === fileId}
                />
                {/* Playback Controls */}
                {visibleFileId === fileId && (
                  <div className="absolute top-4 left-4 z-20">
                    <PlaybackControls
                      videoElement={videoRefs.current.get(fileId) || null}
                      isPlaying={videoPlaying.get(fileId) || false}
                      onPlayPause={() => {
                        const videoElement = videoRefs.current.get(fileId);
                        if (videoElement) {
                          if (videoElement.paused) {
                            videoElement.play();
                          } else {
                            videoElement.pause();
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </>
            )}
            
            {/* Full-screen image */}
            {isImage && thumbnails.get(fileId) && (
              <img
                src={thumbnails.get(fileId)!}
                alt={fileName}
                className="max-w-full max-h-full object-contain"
              />
            )}

            {/* Loading state */}
            {((isImage || isVideo) && !thumbnails.get(fileId) && !videoBlobs.get(fileId)) && (
              <div className="flex flex-col items-center justify-center text-neutral-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-2"></div>
                <span className="text-xs">Loading...</span>
              </div>
            )}

            {/* Non-image/video file */}
            {!isImage && !isVideo && (
              <div className="flex flex-col items-center justify-center text-neutral-500">
                <File className="h-24 w-24 mb-4" />
                <h3 className="text-white text-xl font-medium mb-2">{fileName}</h3>
                <p className="text-text-secondary text-sm">{file.fileType || 'File'}</p>
              </div>
            )}
            
            {/* Engagement Sidebar - Right Side */}
            <FeedEngagementSidebar
              file={{
                ...indexedFile,
                metadata: {
                  ...indexedFile.metadata,
                  engagement: {
                    ...indexedFile.metadata.engagement,
                    likes: getLikeCount(fileId, indexedFile.metadata.engagement?.likes || 0),
                    comments: getComments(fileId).length + (indexedFile.metadata.engagement?.comments || 0),
                    shares: getShareCount(fileId, indexedFile.metadata.engagement?.shares || 0)
                  }
                }
              }}
              isLiked={isLiked(fileId)}
              onLike={() => {
                if (visibleFileId === fileId && showEngagementOverlay) {
                  setShowEngagementOverlay(false);
                }
                onLike(fileId);
              }}
              onComment={() => {
                if (visibleFileId === fileId && showEngagementOverlay) {
                  setShowEngagementOverlay(false);
                }
                onComment(indexedFile);
              }}
              onShare={async () => {
                // Directly copy link to clipboard
                const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  // Could show a toast here if needed
                } catch (err) {
                  console.error('Failed to copy link:', err);
                }
              }}
              onAddToFeed={onAddToFeed ? () => onAddToFeed(indexedFile) : undefined}
              onEdit={onEdit ? () => onEdit(indexedFile) : undefined}
              isOwner={userState.isUnlocked && userState.pnIdentifier === creatorId}
              onCreatorClick={onCreatorClick}
              onMessage={onMessage}
              indexedFiles={files}
            />

            {/* Engagement Overlay - Show when like/comment/save is clicked (share now directly copies) */}
            {visibleFileId === fileId && showEngagementOverlay && (
              <EngagementOverlay
                file={indexedFile}
                isLiked={isLiked(fileId)}
                likeCount={getLikeCount(fileId, indexedFile.metadata.engagement?.likes || 0)}
                commentCount={getComments(fileId).length + (indexedFile.metadata.engagement?.comments || 0)}
                shareCount={getShareCount(fileId, indexedFile.metadata.engagement?.shares || 0)}
                onLike={() => onLike(fileId)}
                onComment={() => {
                  setShowEngagementOverlay(false);
                  onComment(indexedFile);
                }}
                onShare={async () => {
                  // Copy link to clipboard
                  const shareUrl = `${window.location.origin}${window.location.pathname}?file=${fileId}&view=feed`;
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setShowEngagementOverlay(false);
                  } catch (err) {
                    console.error('Failed to copy link:', err);
                  }
                }}
                onSave={onSave ? () => onSave(indexedFile) : undefined}
                onClose={() => setShowEngagementOverlay(false)}
                isOpen={showEngagementOverlay}
              />
            )}

            {/* Content Info Overlay - Bottom Left */}
            <div 
              className={`absolute left-0 right-20 p-4 md:p-6 transition-all duration-300 ${
                expandedCaptions.has(fileId) 
                  ? 'bottom-0' 
                  : 'bottom-0'
              }`}
              style={{ 
                maxHeight: expandedCaptions.has(fileId) ? '70%' : 'auto',
                overflowY: expandedCaptions.has(fileId) ? 'auto' : 'hidden',
                overflowX: 'hidden',
                bottom: '64px' // Account for bottom nav bar
              }}
            >
              {/* Title */}
              <h3 className="text-white text-base md:text-lg font-semibold mb-1 line-clamp-1">
                {file.title || file.name || 'Untitled'}
              </h3>
              
              {/* Caption with expand/collapse */}
              {file.description && (
                <div className="mb-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCaptions(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(fileId)) {
                          newSet.delete(fileId);
                        } else {
                          newSet.add(fileId);
                        }
                        return newSet;
                      });
                    }}
                    className="text-left w-full"
                  >
                    <p 
                      className={`text-white/90 text-sm leading-relaxed ${
                        expandedCaptions.has(fileId) 
                          ? '' 
                          : 'line-clamp-2'
                      }`}
                    >
                      {file.description}
                    </p>
                    {/* Show expand/collapse if description is long enough to potentially need more than 2 lines */}
                    {(file.description.length > 100 || file.description.split('\n').length > 2) && (
                      <span className="text-white/70 text-xs mt-1 inline-block hover:text-white transition-colors">
                        {expandedCaptions.has(fileId) ? 'Show less' : 'Tap to expand'}
                      </span>
                    )}
                  </button>
              </div>
              )}
              
              {/* Metadata Tags/Category */}
              {(file.keywords || file.tags || file.category) && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {file.category && (
                    <span className="px-2 py-1 bg-blue-500/30 text-blue-200 text-xs rounded-full border border-blue-400/50">
                      {file.category}
                    </span>
                  )}
                  {(file.keywords || file.tags || []).slice(0, 5).map((tag, tagIdx) => (
                    <span
                      key={tagIdx}
                      className="px-2 py-1 bg-white/20 text-white text-xs rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              
              {/* Timestamp */}
              {file.uploadDate && (
                <div className="text-white/70 text-xs mb-2">
                  {formatTimestamp(file.uploadDate)}
                </div>
              )}
              
              {/* Content Rating */}
              {file.contentRating && (
                <div className="flex items-center space-x-2">
                  <ContentRatingBadge rating={file.contentRating} size="sm" />
                  {file.warningTags && file.warningTags.length > 0 && (
                    <span className="text-white/70 text-xs">
                      {file.warningTags.join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

