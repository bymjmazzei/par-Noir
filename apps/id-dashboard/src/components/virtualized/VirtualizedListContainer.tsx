import React from 'react';

interface VirtualizedListContainerProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  scrollTop: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const VirtualizedListContainer = React.memo(<T extends Record<string, any>>({ 
  items, 
  height, 
  itemHeight, 
  scrollTop, 
  renderItem, 
  onScroll, 
  containerRef 
}: VirtualizedListContainerProps<T>) => {
  // Calculate visible range
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(height / itemHeight) + 1,
    items.length
  );

  // Get visible items
  const visibleItems = items.slice(startIndex, endIndex).map((item, index) => ({
    item,
    actualIndex: startIndex + index
  }));

  return (
    <div
      ref={containerRef}
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
      style={{ height }}
      onScroll={onScroll}
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
          >
            {renderItem(item, actualIndex)}
          </div>
        ))}
      </div>
    </div>
  );
});

VirtualizedListContainer.displayName = 'VirtualizedListContainer';
