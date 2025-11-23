/**
 * Creator Index Component
 * Search-results style page showing all content from a specific creator
 * Used for free tier creators (no profile page, just an index)
 */

import React from 'react';
import { IndexedFile } from '../types/aggregator';
import { User, Calendar, Tag, ArrowLeft } from 'lucide-react';
import { EngagementActions } from './EngagementActions';
import { ContentRatingBadge } from './ContentRatingBadge';

interface CreatorIndexProps {
  creatorId: string;
  creatorName: string;
  files: IndexedFile[];
  onFileClick?: (file: IndexedFile) => void;
  onBack?: () => void;
}

export function CreatorIndex({ creatorId, creatorName, files, onFileClick, onBack }: CreatorIndexProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-4 flex items-center space-x-2 text-text-secondary hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Feed</span>
            </button>
          )}
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{creatorName}</h1>
              <p className="text-text-secondary">Creator Index</p>
            </div>
          </div>
          <div className="flex items-center space-x-6 text-sm text-text-secondary">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>{files.length} {files.length === 1 ? 'post' : 'posts'}</span>
            </div>
          </div>
        </div>

        {/* Files Grid */}
        {files.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-secondary">No content available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((indexedFile) => {
              const file = indexedFile.metadata;
              const isImage = file.fileType === 'image' || 
                             (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
              const isVideo = file.fileType === 'video' || 
                             (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
              const fileName = file.name || file.title || 'Untitled';
              const thumbnail = indexedFile.thumbnail;

              return (
                <div
                  key={file.fileId}
                  onClick={() => onFileClick?.(indexedFile)}
                  className="bg-neutral-900/60 border border-neutral-700 rounded-xl overflow-hidden hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  {/* Thumbnail/Preview */}
                  {(isImage || isVideo) && thumbnail ? (
                    <div className="w-full h-48 bg-neutral-800 flex items-center justify-center overflow-hidden">
                      <img
                        src={thumbnail}
                        alt={fileName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-neutral-800 flex items-center justify-center">
                      <div className="text-center text-neutral-500">
                        {isVideo ? '▶' : isImage ? '🖼' : '📄'}
                      </div>
                    </div>
                  )}

                  <div className="p-4">
                    <h3 className="text-white font-medium truncate mb-2">{fileName}</h3>
                    {file.description && (
                      <p className="text-text-secondary text-sm mb-3 line-clamp-2">
                        {file.description}
                      </p>
                    )}

                    <div className="flex items-center space-x-2 text-xs text-text-secondary mb-3">
                      <span>{new Date(file.uploadDate).toLocaleDateString()}</span>
                      {file.isNSFW && (
                        <>
                          <span>•</span>
                          <ContentRatingBadge isNSFW={file.isNSFW} size="sm" />
                        </>
                      )}
                    </div>

                    {(file.keywords || file.tags) && (file.keywords || file.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(file.keywords || file.tags || []).slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-neutral-700 text-text-secondary text-xs rounded flex items-center space-x-1"
                          >
                            <Tag className="h-3 w-3" />
                            <span>{tag}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <EngagementActions
                      file={indexedFile}
                      compact
                      onLike={() => console.log('Like:', file.fileId)}
                      onComment={() => console.log('Comment:', file.fileId)}
                      onShare={() => console.log('Share:', file.fileId)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

