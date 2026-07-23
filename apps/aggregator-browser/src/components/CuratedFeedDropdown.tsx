/**
 * Curated Feed Dropdown Component
 * Dropdown menu for pN feed with sort order and connection filter options
 */

import React from 'react';
import { useUserState } from '../contexts/UserStateContext';

interface CuratedFeedDropdownProps {
  onClose?: () => void;
}

export const CuratedFeedDropdown: React.FC<CuratedFeedDropdownProps> = ({ onClose }) => {
  const { userState, updateCuratedFeedPreferences } = useUserState();
  const preferences = userState.preferences.curatedFeedPreferences || {
    sortOrder: 'recommended',
    connectionFilter: 'all'
  };

  const handleSortOrderChange = async (sortOrder: 'time' | 'recommended') => {
    await updateCuratedFeedPreferences({
      ...preferences,
      sortOrder
    });
  };

  const handleConnectionFilterChange = async (connectionFilter: 'all' | 'connections' | 'not_connections') => {
    await updateCuratedFeedPreferences({
      ...preferences,
      connectionFilter
    });
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
            onClick={() => {
              handleSortOrderChange('recommended');
              onClose?.();
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors text-left ${
              preferences.sortOrder === 'recommended'
                ? 'bg-blue-900/30 text-blue-300'
                : 'hover:bg-neutral-800 text-white'
            }`}
          >
            <span className="text-sm">Recommended</span>
            {preferences.sortOrder === 'recommended' && (
              <span className="ml-auto text-blue-400">✓</span>
            )}
          </button>
          <button
            onClick={() => {
              handleSortOrderChange('time');
              onClose?.();
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors text-left ${
              preferences.sortOrder === 'time'
                ? 'bg-blue-900/30 text-blue-300'
                : 'hover:bg-neutral-800 text-white'
            }`}
          >
            <span className="text-sm">Time</span>
            {preferences.sortOrder === 'time' && (
              <span className="ml-auto text-blue-400">✓</span>
            )}
          </button>
        </div>
      </div>

      {/* Connection Filter Section */}
      <div className="p-3 border-t border-neutral-700">
        <div className="text-xs font-semibold text-neutral-400 uppercase mb-2 px-2">
          Connection Filter
        </div>
        <div className="flex rounded-lg bg-neutral-800 p-1">
          <button
            onClick={() => handleConnectionFilterChange('all')}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              preferences.connectionFilter === 'all'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleConnectionFilterChange('connections')}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              preferences.connectionFilter === 'connections'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Connections
          </button>
          <button
            onClick={() => handleConnectionFilterChange('not_connections')}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              preferences.connectionFilter === 'not_connections'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Not Connections
          </button>
        </div>
      </div>
    </div>
  );
};

