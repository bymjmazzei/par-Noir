/**
 * Branded Feed Page Component
 * Feed page for paid-tier creators with branding and community controls
 */

import React from 'react';
import { ArrowLeft, Settings, Users, Calendar, Tag, Sparkles } from 'lucide-react';
import { Feed, IndexedFile } from '../types/aggregator';
import { ContentRatingBadge } from './ContentRatingBadge';
import { EngagementActions } from './EngagementActions';
import { useEngagement } from '../hooks/useEngagement';

interface BrandedFeedPageProps {
  feed: Feed;
  files: IndexedFile[];
  onBack: () => void;
  onFileClick?: (file: IndexedFile) => void;
}

export function BrandedFeedPage({ feed, files, onBack, onFileClick }: BrandedFeedPageProps) {
  const { getLikeCount, isLiked, getComments, getShareCount } = useEngagement();

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
      {/* Header with Branding */}
      <div className="bg-neutral-900 border-b border-neutral-700">
        {/* Banner Image */}
        {feed.branding?.bannerImage && (
          <div className="h-48 md:h-64 bg-gradient-to-r from-blue-600 to-purple-600 relative overflow-hidden">
            <img 
              src={feed.branding.bannerImage} 
              alt={`${feed.feedName} banner`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}
        
        {/* Feed Info */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start space-x-4">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {feed.branding?.avatar ? (
                <img 
                  src={feed.branding.avatar} 
                  alt={feed.feedName}
                  className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-neutral-900"
                />
              ) : (
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-neutral-900 bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 md:h-12 md:w-12 text-white" />
                </div>
              )}
            </div>

            {/* Feed Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-white">{feed.feedName}</h1>
                {feed.creatorTier === 'self-hosted' && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full border border-purple-500/30">
                    Self-Hosted
                  </span>
                )}
                {feed.creatorTier === 'feed' && (
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full border border-blue-500/30">
                    Curated Feed
                  </span>
                )}
              </div>
              
              {feed.branding?.bio && (
                <p className="text-text-secondary mb-4 max-w-2xl">{feed.branding.bio}</p>
              )}

              {/* Stats */}
              <div className="flex items-center space-x-6 text-sm">
                <div className="flex items-center space-x-1 text-text-secondary">
                  <Users className="h-4 w-4" />
                  <span>{feed.subscriberCount?.toLocaleString() || 0} subscribers</span>
                </div>
                <div className="flex items-center space-x-1 text-text-secondary">
                  <Tag className="h-4 w-4" />
                  <span>{feed.postCount?.toLocaleString() || files.length} posts</span>
                </div>
                <div className="flex items-center space-x-1 text-text-secondary">
                  <Calendar className="h-4 w-4" />
                  <span>Joined {new Date(feed.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Rating Range */}
              {feed.feedRatingRange && feed.feedRatingRange.length > 0 && (
                <div className="mt-4 flex items-center space-x-2">
                  <span className="text-text-secondary text-sm">Content ratings:</span>
                  {feed.feedRatingRange.map((rating) => (
                    <ContentRatingBadge key={rating} rating={rating} size="sm" />
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={onBack}
                className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden md:inline">Back</span>
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                title="Feed settings (coming soon)"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden md:inline">Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {files.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-secondary">No posts yet in this feed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {files.map((indexedFile) => {
              const file = indexedFile.metadata;
              const isImage = file.fileType === 'image' || 
                             (file.name || file.title || '').match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
              const isVideo = file.fileType === 'video' || 
                             (file.name || file.title || '').match(/\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i);
              
              return (
                <div
                  key={file.fileId}
                  onClick={() => onFileClick?.(indexedFile)}
                  className="bg-neutral-900/60 border border-neutral-700 rounded-xl overflow-hidden hover:bg-neutral-800 transition-colors cursor-pointer group"
                >
                  {/* Thumbnail */}
                  {(isImage || isVideo) && (
                    <div className="w-full h-48 bg-neutral-800 flex items-center justify-center relative overflow-hidden">
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="bg-black/50 rounded-full p-3">
                            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </div>
                      )}
                      {file.contentRating && (
                        <div className="absolute top-2 right-2">
                          <ContentRatingBadge rating={file.contentRating} size="sm" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Content Info */}
                  <div className="p-4">
                    <h3 className="text-white font-medium mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                      {file.name || file.title || 'Untitled'}
                    </h3>
                    {file.description && (
                      <p className="text-text-secondary text-sm mb-3 line-clamp-2">
                        {file.description}
                      </p>
                    )}
                    
                    {/* Engagement */}
                    <div className="pt-3 border-t border-neutral-700">
                      <EngagementActions
                        file={{
                          ...indexedFile,
                          metadata: {
                            ...indexedFile.metadata,
                            engagement: {
                              ...indexedFile.metadata.engagement,
                              likes: getLikeCount(file.fileId, indexedFile.metadata.engagement?.likes || 0),
                              comments: getComments(file.fileId).length + (indexedFile.metadata.engagement?.comments || 0),
                              shares: getShareCount(file.fileId, indexedFile.metadata.engagement?.shares || 0)
                            }
                          }
                        }}
                        compact
                        onLike={() => {}}
                        onComment={() => {}}
                        onShare={() => {}}
                      />
                    </div>
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

