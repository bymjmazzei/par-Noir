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
import { User, File } from 'lucide-react';
import { useVerticalSwipe } from '../hooks/useVerticalSwipe';
import { decryptWithToken, ShareToken } from '../utils/tokenDecryption';

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
  onCreatorClick
}: FullScreenFeedProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [videoBlobs, setVideoBlobs] = useState<Map<string, string>>(new Map());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [visibleFileId, setVisibleFileId] = useState<string | null>(null);
  const [showEngagementOverlay, setShowEngagementOverlay] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState<Map<string, boolean>>(new Map());

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

  // Scroll to current index when it changes
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const currentFile = files[currentIndex];
    if (!currentFile) return;

    const element = scrollContainerRef.current.querySelector(`[data-file-id="${currentFile.metadata.fileId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setVisibleFileId(currentFile.metadata.fileId);
    }
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
      }}
      className="h-screen w-full overflow-y-scroll snap-y snap-mandatory bg-black"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', height: 'calc(100vh - 64px)' }}
    >
      {files.map((indexedFile, idx) => {
        const file = indexedFile.metadata;
        const fileId = file.fileId;
        const isVideo = file.fileType === 'video' || 
                       (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
        const isImage = file.fileType === 'image' || 
                       (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
        const fileName = file.name || file.title || 'Untitled';
        const creatorId = file.creator?.identifier?.value || file.creator?.["@id"] || file.author?.did;

        return (
          <div
            key={fileId}
            data-file-id={fileId}
            className="h-screen w-full snap-start flex items-center justify-center bg-black relative"
            style={{ height: 'calc(100vh - 64px)' }}
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
              onShare={() => {
                if (visibleFileId === fileId) {
                  setShowEngagementOverlay(true);
                } else {
                  onShare(fileId);
                }
              }}
              onAddToFeed={onAddToFeed ? () => onAddToFeed(indexedFile) : undefined}
              onEdit={onEdit ? () => onEdit(indexedFile) : undefined}
              isOwner={userState.isUnlocked && userState.pnIdentifier === creatorId}
            />

            {/* Engagement Overlay - Show when share button is clicked */}
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
                onShare={() => onShare(fileId)}
                onSave={onSave ? () => onSave(indexedFile) : undefined}
                onClose={() => setShowEngagementOverlay(false)}
                isOpen={showEngagementOverlay}
              />
            )}

            {/* Content Info Overlay - Bottom Left */}
            <div className="absolute bottom-0 left-0 right-20 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-6">
              <div className="flex items-center space-x-3 mb-3">
                {creatorId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreatorClick?.(creatorId);
                    }}
                    className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
                  >
                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <div className="text-white font-semibold text-sm">
                        {creatorId}
                      </div>
                      <div className="text-white/70 text-xs">
                        {new Date(file.uploadDate).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                )}
              </div>
              
              <h3 className="text-white text-lg font-semibold mb-2 line-clamp-1">{fileName}</h3>
              {file.description && (
                <p className="text-white/90 text-sm mb-3 line-clamp-2">{file.description}</p>
              )}
              
              {(file.keywords || file.tags) && (file.keywords || file.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
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

