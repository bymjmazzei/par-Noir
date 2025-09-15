import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, Search, Filter } from 'lucide-react';

interface VirtualizedListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  searchable?: boolean;
  filterable?: boolean;
  searchFields?: (keyof T)[];
  placeholder?: string;
  onItemClick?: (item: T, index: number) => void;
  className?: string;
}

export function VirtualizedList<T>({
  items,
  height,
  itemHeight,
  renderItem,
  searchable = false,
  filterable = false,
  searchFields = [],
  placeholder = 'Search items...',
  onItemClick,
  className = ''
}: VirtualizedListProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'c'>('asc');
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    // Apply search filter
    if (searchable && searchTerm) {
      result = result.filter(item => {
        return searchFields.some(field => {
          const value = item[field];
          if (typeof value === 'string') {
            return value.toLowerCase().includes(searchTerm.toLowerCase());
          }
          if (typeof value === 'number') {
            return value.toString().includes(searchTerm);
          }
          return false;
        });
      });
    }

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];

        if (aValue === bValue) return 0;

        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [items, searchTerm, searchFields, sortField, sortDirection, searchable]);

  // Calculate visible range
  const totalHeight = filteredAndSortedItems.length * itemHeight;
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(height / itemHeight) + 1,
    filteredAndSortedItems.length
  );

  // Get visible items
  const visibleItems = useMemo(() => {
    return filteredAndSortedItems.slice(startIndex, endIndex).map((item, index) => ({
      item,
      actualIndex: startIndex + index
    }));
  }, [filteredAndSortedItems, startIndex, endIndex]);

  // Handle scroll
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  // Handle sort
  const handleSort = useCallback((field: keyof T) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'c' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  // Handle item click
  const handleItemClick = useCallback((item: T, index: number) => {
    if (onItemClick) {
      onItemClick(item, index);
    }
  }, [onItemClick]);

  // Scroll to item
  const scrollToItem = useCallback((index: number) => {
    if (containerRef.current) {
      const scrollTop = index * itemHeight;
      containerRef.current.scrollTop = scrollTop;
    }
  }, [itemHeight]);

  // Auto-scroll to top when search changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [searchTerm]);

  return (
    <div className={`virtualized-list ${className}`}>
      {/* Search and Filter Bar */}
      {(searchable || filterable) && (
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
                    onChange={(e) => setSearchTerm(e.target.value)}
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
                    onClick={() => handleSort(field)}
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
            Showing {filteredAndSortedItems.length} of {items.length} items
            {searchTerm && ` matching "${searchTerm}"`}
          </div>
        </div>
      )}

      {/* Virtualized List Container */}
      <div
        ref={containerRef}
        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
        style={{ height }}
        onScroll={handleScroll}
      >
        {/* Spacer for scroll height */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* Visible items */}
          {visibleItems.map(({ item, actualIndex }) => (
            <div
              key={actualIndex}
              className="virtualized-item cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              style={{
                position: 'absolute',
                top: actualIndex * itemHeight,
                height: itemHeight,
                width: '100%'
              }}
              onClick={() => handleItemClick(item, actualIndex)}
            >
              {renderItem(item, actualIndex)}
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filteredAndSortedItems.length === 0 && (
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
      )}
    </div>
  );
}

// Specialized virtualized list for identities
interface IdentityItem {
  id: string;
  pnName: string;
  displayName?: string;
  email?: string;
  status: string;
  createdAt: string;
  isEncrypted?: boolean;
}

interface VirtualizedIdentityListProps {
  identities: IdentityItem[];
  onIdentitySelect: (identity: IdentityItem) => void;
  height?: number;
}

export const VirtualizedIdentityList: React.FC<VirtualizedIdentityListProps> = React.memo(({
  identities,
  onIdentitySelect,
  height = 400
}) => {
  const renderIdentityItem = useCallback((identity: IdentityItem, index: number) => (
    <div className="flex items-center p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-4">
        <span className="text-white font-medium text-sm">
          {identity.displayName?.[0] || identity.pnName[0]}
        </span>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {identity.displayName || identity.pnName}
          </h3>
          {identity.isEncrypted && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Encrypted
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{identity.pnName}</span>
          {identity.email && <span>{identity.email}</span>}
          <span className={`px-2 py-0.5 rounded ${
            identity.status === 'active' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
          }`}>
            {identity.status}
          </span>
        </div>
      </div>
      
      <div className="flex-shrink-0 text-xs text-gray-400">
        {new Date(identity.createdAt).toLocaleDateString()}
      </div>
    </div>
  ), []);

  const handleIdentitySelect = useCallback((identity: IdentityItem) => {
    onIdentitySelect(identity);
  }, [onIdentitySelect]);

  return (
    <VirtualizedList
      items={identities}
      height={height}
      itemHeight={80}
      renderItem={renderIdentityItem}
      searchable={true}
      filterable={true}
      searchFields={['pnName', 'displayName', 'email']}
      placeholder="Search identities..."
      onItemClick={handleIdentitySelect}
    />
  );
});

VirtualizedIdentityList.displayName = 'VirtualizedIdentityList';
