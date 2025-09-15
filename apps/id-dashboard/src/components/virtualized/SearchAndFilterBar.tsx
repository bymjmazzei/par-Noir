import React from 'react';
import { Search, Filter, ChevronUp, ChevronDown } from 'lucide-react';

interface SearchAndFilterBarProps<T> {
  searchable: boolean;
  filterable: boolean;
  searchFields: (keyof T)[];
  searchTerm: string;
  sortField: keyof T | null;
  sortDirection: 'asc' | 'desc';
  placeholder: string;
  totalItems: number;
  filteredItems: number;
  onSearchChange: (term: string) => void;
  onSort: (field: keyof T) => void;
}

export const SearchAndFilterBar = React.memo(<T extends Record<string, any>>({ 
  searchable, 
  filterable, 
  searchFields, 
  searchTerm, 
  sortField, 
  sortDirection, 
  placeholder, 
  totalItems, 
  filteredItems, 
  onSearchChange, 
  onSort 
}: SearchAndFilterBarProps<T>) => {
  if (!searchable && !filterable) return null;

  return (
    <div className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-4">
        {searchable && (
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={placeholder}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        )}
        
        {filterable && searchFields.length > 0 && (
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Sort by:</span>
            {searchFields.map(field => (
              <button
                key={String(field)}
                onClick={() => onSort(field)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  sortField === field
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {String(field)}
                {sortField === field && (
                  sortDirection === 'asc' ? (
                    <ChevronUp className="inline w-3 h-3 ml-1" />
                  ) : (
                    <ChevronDown className="inline w-3 h-3 ml-1" />
                  )
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Results count */}
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Showing {filteredItems} of {totalItems} items
        {searchTerm && ` matching "${searchTerm}"`}
      </div>
    </div>
  );
});

SearchAndFilterBar.displayName = 'SearchAndFilterBar';
