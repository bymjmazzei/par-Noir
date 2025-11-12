/**
 * Loading Skeleton Component
 * Shows animated placeholders while content loads
 */

import React from 'react';

interface LoadingSkeletonProps {
  type?: 'feed' | 'grid' | 'card';
  count?: number;
}

export function LoadingSkeleton({ type = 'card', count = 1 }: LoadingSkeletonProps) {
  if (type === 'feed') {
    return (
      <>
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="h-screen w-full snap-start flex items-center justify-center bg-black relative animate-pulse"
          >
            <div className="w-full h-full bg-neutral-800/50" />
            {/* Sidebar skeleton */}
            <div className="absolute right-4 bottom-24 flex flex-col items-center space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-12 h-12 rounded-full bg-neutral-700/50" />
              ))}
            </div>
            {/* Content info skeleton */}
            <div className="absolute bottom-0 left-0 right-20 bg-gradient-to-t from-black/80 to-transparent p-6">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-neutral-700/50" />
                <div className="space-y-2">
                  <div className="w-24 h-4 bg-neutral-700/50 rounded" />
                  <div className="w-16 h-3 bg-neutral-700/50 rounded" />
                </div>
              </div>
              <div className="w-3/4 h-6 bg-neutral-700/50 rounded mb-2" />
              <div className="w-full h-4 bg-neutral-700/50 rounded mb-3" />
              <div className="flex space-x-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-16 h-6 bg-neutral-700/50 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (type === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="bg-neutral-900/60 border border-neutral-700 rounded-xl overflow-hidden animate-pulse"
          >
            <div className="w-full h-48 bg-neutral-800" />
            <div className="p-4 space-y-3">
              <div className="w-3/4 h-4 bg-neutral-700 rounded" />
              <div className="w-full h-3 bg-neutral-700 rounded" />
              <div className="w-1/2 h-3 bg-neutral-700 rounded" />
              <div className="flex space-x-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-16 h-6 bg-neutral-700 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Card type (default)
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-neutral-900/60 border border-neutral-700 rounded-xl overflow-hidden animate-pulse"
        >
          <div className="w-full h-48 bg-neutral-800" />
          <div className="p-4 space-y-3">
            <div className="w-3/4 h-4 bg-neutral-700 rounded" />
            <div className="w-full h-3 bg-neutral-700 rounded" />
            <div className="w-1/2 h-3 bg-neutral-700 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

