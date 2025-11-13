/**
 * Bottom Navigation Bar
 * Conditional navigation based on user auth state and tier
 */

import React from 'react';
import { Search, Home, Upload, MessageSquare, Bell } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';

interface BottomNavProps {
  activeTab: 'home' | 'search' | 'upload' | 'messages';
  onTabChange: (tab: 'home' | 'search' | 'upload' | 'messages') => void;
  onSearchClick?: () => void;
}

export function BottomNav({ activeTab, onTabChange, onSearchClick }: BottomNavProps) {
  const { userState } = useUserState();
  const isUnlocked = userState.isUnlocked;

  const handleTabClick = (tab: 'home' | 'search' | 'upload' | 'messages') => {
    if (tab === 'search' && onSearchClick) {
      onSearchClick();
    } else {
      onTabChange(tab);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-900/95 backdrop-blur-sm border-t border-neutral-700">
      <div className="flex items-center justify-around px-4 py-3">
        {/* Search - Always visible */}
        <button
          onClick={() => handleTabClick('search')}
          className={`
            flex flex-col items-center justify-center space-y-1 px-4 py-2 rounded-lg transition-colors
            ${activeTab === 'search'
              ? 'text-blue-400'
              : 'text-neutral-400 hover:text-white'
            }
          `}
          aria-label="Search"
        >
          <Search className="h-6 w-6" />
          <span className="text-xs font-medium">Search</span>
        </button>

        {/* Home - Always visible */}
        <button
          onClick={() => handleTabClick('home')}
          className={`
            flex flex-col items-center justify-center space-y-1 px-4 py-2 rounded-lg transition-colors
            ${activeTab === 'home'
              ? 'text-blue-400'
              : 'text-neutral-400 hover:text-white'
            }
          `}
          aria-label="Home"
        >
          <Home className="h-6 w-6" />
          <span className="text-xs font-medium">Home</span>
        </button>

        {/* Upload - Only for unlocked users */}
        {isUnlocked && (
          <button
            onClick={() => handleTabClick('upload')}
            className={`
              flex flex-col items-center justify-center space-y-1 px-4 py-2 rounded-lg transition-colors
              ${activeTab === 'upload'
                ? 'text-blue-400'
                : 'text-neutral-400 hover:text-white'
              }
            `}
            aria-label="Upload"
          >
            <Upload className="h-6 w-6" />
            <span className="text-xs font-medium">Upload</span>
          </button>
        )}

        {/* Messages/Notifications - Only for unlocked users */}
        {isUnlocked && (
          <button
            onClick={() => handleTabClick('messages')}
            className={`
              flex flex-col items-center justify-center space-y-1 px-4 py-2 rounded-lg transition-colors relative
              ${activeTab === 'messages'
                ? 'text-blue-400'
                : 'text-neutral-400 hover:text-white'
              }
            `}
            aria-label="Messages and Notifications"
          >
            <div className="relative">
              <MessageSquare className="h-6 w-6" />
              {/* TODO: Add notification badge when notifications are implemented */}
            </div>
            <span className="text-xs font-medium">Messages</span>
          </button>
        )}
      </div>
    </div>
  );
}

