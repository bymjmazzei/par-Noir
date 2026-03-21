/**
 * Bottom Navigation Bar
 * Conditional navigation based on user auth state and tier
 */

import React from 'react';
import { Search, Home, Plus, MessageSquare, User } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';

interface BottomNavProps {
  /** When true (messaging build for messaging.parnoir.com), only Messages + Me */
  messagingOnly?: boolean;
  activeTab: 'home' | 'search' | 'upload' | 'index' | 'messages';
  onTabChange: (tab: 'home' | 'search' | 'upload' | 'index' | 'messages') => void;
  onSearchClick?: () => void;
  onUploadClick?: () => void;
  onIndexClick?: () => void;
  onInboxClick?: () => void;
  onHomeClick?: () => void;
}

export function BottomNav({ 
  messagingOnly = false,
  activeTab, 
  onTabChange, 
  onSearchClick,
  onUploadClick,
  onIndexClick,
  onInboxClick,
  onHomeClick
}: BottomNavProps) {
  const { userState } = useUserState();
  const isUnlocked = userState.isUnlocked;

  const handleTabClick = (tab: 'home' | 'search' | 'upload' | 'index' | 'messages') => {
    if (tab === 'search' && onSearchClick) {
      onSearchClick();
    } else if (tab === 'upload' && onUploadClick) {
      onUploadClick();
    } else if (tab === 'index' && onIndexClick) {
      onIndexClick();
    } else if (tab === 'messages' && onInboxClick) {
      onInboxClick();
    } else if (tab === 'home' && onHomeClick) {
      onHomeClick();
    } else {
      onTabChange(tab);
    }
  };

  if (messagingOnly) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 flex items-center justify-around z-[100]"
        style={{ height: 'calc(4rem + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <button
          onClick={() => handleTabClick('messages')}
          className={`
          flex items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'messages' ? 'text-blue-400' : ''}
            `}
          title="Inbox"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
        <button
          onClick={() => handleTabClick('index')}
          className={`
          flex items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'index' ? 'text-blue-400' : ''}
            `}
          title="Me"
        >
          <User className="h-6 w-6" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 flex items-center justify-around z-[100]"
      style={{ height: 'calc(4rem + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* HOME - Always visible */}
      <button
        onClick={() => handleTabClick('home')}
        className={`
          flex items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'home' ? 'text-blue-400' : ''}
        `}
        title="Home"
      >
        <Home className="h-6 w-6" />
      </button>

      {/* SEARCH - Always visible */}
        <button
          onClick={() => handleTabClick('search')}
          className={`
          flex items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'search' ? 'text-blue-400' : ''}
          `}
        title="Search"
        >
        <Search className="h-6 w-6" />
        </button>

      {/* UPLOAD - Always visible */}
        <button
        onClick={() => handleTabClick('upload')}
          className={`
          flex items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'upload' ? 'text-blue-400' : ''}
          `}
        title="Upload"
        >
        <Plus className="h-6 w-6" />
        </button>

      {/* ME - Always visible */}
          <button
        onClick={() => handleTabClick('index')}
            className={`
          flex items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'index' ? 'text-blue-400' : ''}
            `}
        title="Me"
          >
        <User className="h-6 w-6" />
          </button>

      {/* INBOX - Always visible */}
          <button
            onClick={() => handleTabClick('messages')}
            className={`
          flex items-center justify-center h-full text-white hover:text-blue-400 transition-colors
          ${activeTab === 'messages' ? 'text-blue-400' : ''}
            `}
        title="Inbox"
          >
        <MessageSquare className="h-6 w-6" />
          </button>
    </div>
  );
}

