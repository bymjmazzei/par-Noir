/**
 * Empty State Component
 * Shows helpful messages when there's no content
 */

import { Globe, Search, Filter, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  type: 'no-content' | 'no-results' | 'no-feeds' | 'no-subscriptions';
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ 
  type, 
  message, 
  actionLabel, 
  onAction 
}: EmptyStateProps) {
  const getContent = () => {
    switch (type) {
      case 'no-content':
        return {
          icon: <Globe className="h-16 w-16 text-text-secondary" />,
          title: 'No Content Available',
          description: message || 'No public files found in this feed. Check back later or explore other feeds.',
          actionLabel: actionLabel || 'Browse Feeds',
          onAction
        };
      case 'no-results':
        return {
          icon: <Search className="h-16 w-16 text-text-secondary" />,
          title: 'No Results Found',
          description: message || 'Try adjusting your search or filters to find more content.',
          actionLabel: actionLabel || 'Clear Filters',
          onAction
        };
      case 'no-feeds':
        return {
          icon: <Sparkles className="h-16 w-16 text-text-secondary" />,
          title: 'No Feeds Available',
          description: message || 'No feeds match your criteria. Try browsing all feeds.',
          actionLabel: actionLabel || 'Browse All Feeds',
          onAction
        };
      case 'no-subscriptions':
        return {
          icon: <Filter className="h-16 w-16 text-text-secondary" />,
          title: 'No Subscriptions',
          description: message || 'Subscribe to feeds to build your custom feed. Browse available feeds to get started.',
          actionLabel: actionLabel || 'Browse Feeds',
          onAction
        };
    }
  };

  const content = getContent();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-6">
        {content.icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">
        {content.title}
      </h3>
      <p className="text-text-secondary max-w-md mb-6">
        {content.description}
      </p>
      {content.onAction && (
        <button
          onClick={content.onAction}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {content.actionLabel}
        </button>
      )}
    </div>
  );
}

