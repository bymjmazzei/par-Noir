/**
 * Me Page Dropdown Component
 * Dropdown menu for "all" tab with sort order options
 */

import React from 'react';
import { useUserState } from '../contexts/UserStateContext';

interface MePageDropdownProps {
  onClose?: () => void;
}

export type MePageSortOrder = 'time' | 'recommended' | 'most_viewed';

export const MePageDropdown: React.FC<MePageDropdownProps> = ({ onClose }) => {
  const { userState, updateMePageSortOrder } = useUserState();
  const sortOrder = userState.preferences.mePageSortOrder || 'recommended';

  const handleSortOrderChange = async (newSortOrder: MePageSortOrder) => {
    await updateMePageSortOrder(newSortOrder);
    onClose?.();
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[200] min-w-[240px] max-w-[280px]">
      {/* Sort Section */}
      <div className="p-3">
        <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
          Sort
        </div>
        <div className="space-y-1">
          <button
            onClick={() => handleSortOrderChange('recommended')}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors text-left ${
              sortOrder === 'recommended'
                ? 'bg-blue-900/30 text-blue-300'
                : 'hover:bg-neutral-800 text-white'
            }`}
          >
            <span className="text-sm">Recommended</span>
            {sortOrder === 'recommended' && (
              <span className="ml-auto text-blue-400">✓</span>
            )}
          </button>
          <button
            onClick={() => handleSortOrderChange('time')}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors text-left ${
              sortOrder === 'time'
                ? 'bg-blue-900/30 text-blue-300'
                : 'hover:bg-neutral-800 text-white'
            }`}
          >
            <span className="text-sm">Time</span>
            {sortOrder === 'time' && (
              <span className="ml-auto text-blue-400">✓</span>
            )}
          </button>
          <button
            onClick={() => handleSortOrderChange('most_viewed')}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors text-left ${
              sortOrder === 'most_viewed'
                ? 'bg-blue-900/30 text-blue-300'
                : 'hover:bg-neutral-800 text-white'
            }`}
          >
            <span className="text-sm">Most Viewed</span>
            {sortOrder === 'most_viewed' && (
              <span className="ml-auto text-blue-400">✓</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

