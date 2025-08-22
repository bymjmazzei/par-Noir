import React, { Suspense, lazy } from 'react';

// Lazy load components for better performance
export const LazyPWAInstall = lazy(() => import('./PWAInstall'));
export const LazyOfflineIndicator = lazy(() => import('./OfflineIndicator'));

interface LazyLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const LazyLoader: React.FC<LazyLoaderProps> = ({ 
  children, 
  fallback = (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  ) 
}) => {
  return (
    <Suspense fallback={fallback}>
      {children}
    </Suspense>
  );
};

// Skeleton loading components
export const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-lg p-6 shadow-sm animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
    <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
  </div>
);

export const SkeletonButton: React.FC = () => (
  <div className="h-10 bg-gray-200 rounded-lg animate-pulse w-24"></div>
);

export const SkeletonForm: React.FC = () => (
  <div className="space-y-4">
    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
    <div className="h-10 bg-gray-200 rounded w-full"></div>
    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
    <div className="h-10 bg-gray-200 rounded w-full"></div>
    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
    <div className="h-10 bg-gray-200 rounded w-full"></div>
  </div>
); 