/**
 * Bottom Navigation Bar
 * Conditional navigation based on user auth state and tier
 */

import React from 'react';
import { Search, Home, Upload, MessageSquare, Grid } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';

interface BottomNavProps {
  activeTab: 'home' | 'search' | 'upload' | 'index' | 'messages';
  onTabChange: (tab: 'home' | 'search' | 'upload' | 'index' | 'messages') => void;
  onSearchClick?: () => void;
}

export function BottomNav({ activeTab, onTabChange, onSearchClick }: BottomNavProps) {
  const { userState } = useUserState();
  const isUnlocked = userState.isUnlocked;

  const handleTabClick = (tab: 'home' | 'search' | 'upload' | 'index' | 'messages') => {
    if (tab === 'search' && onSearchClick) {
      onSearchClick();
    } else {
      onTabChange(tab);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 h-16 flex items-center justify-around z-[100]">
      {/* HOME - Always visible */}
      <button
        onClick={() => handleTabClick('home')}
        className={`
          flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'home' ? 'text-blue-400' : ''}
        `}
        title="Home"
      >
        <Home className="h-6 w-6 mb-1" />
        <span className="text-xs font-medium">HOME</span>
      </button>

      {/* SEARCH - Always visible */}
      <button
        onClick={() => handleTabClick('search')}
        className={`
          flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'search' ? 'text-blue-400' : ''}
        `}
        title="Search"
      >
        <Search className="h-6 w-6 mb-1" />
        <span className="text-xs font-medium">SEARCH</span>
      </button>

      {/* UPLOAD - Always visible */}
      <button
        onClick={() => handleTabClick('upload')}
        className={`
          flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'upload' ? 'text-blue-400' : ''}
        `}
        title="Upload"
      >
        <Upload className="h-6 w-6 mb-1" />
        <span className="text-xs font-medium">UPLOAD</span>
      </button>

      {/* INDEX - Always visible */}
      <button
        onClick={() => handleTabClick('index')}
        className={`
          flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'index' ? 'text-blue-400' : ''}
        `}
        title="Index"
      >
        <Grid className="h-6 w-6 mb-1" />
        <span className="text-xs font-medium">INDEX</span>
      </button>

      {/* INBOX - Always visible */}
      <button
        onClick={() => handleTabClick('messages')}
        className={`
          flex flex-col items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'messages' ? 'text-blue-400' : ''}
        `}
        title="Inbox"
      >
        <MessageSquare className="h-6 w-6 mb-1" />
        <span className="text-xs font-medium">INBOX</span>
      </button>
    </div>
  );
}

