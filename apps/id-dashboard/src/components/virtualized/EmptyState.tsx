import React from 'react';
import { Search } from 'lucide-react';

interface EmptyStateProps {
  searchTerm: string;
}

export const EmptyState: React.FC<EmptyStateProps> = React.memo(({ searchTerm }) => {
  return (
    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
      <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p className="text-lg font-medium mb-2">No items found</p>
      <p className="text-sm">
        {searchTerm 
          ? `No items match "${searchTerm}"` 
          : 'No items available'
        }
      </p>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
