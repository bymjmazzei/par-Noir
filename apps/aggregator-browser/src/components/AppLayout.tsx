/**
 * App shell: header chrome, upload status, queue overlay, toasts, bottom nav.
 * Renders {children} as the main content.
 */

import React from 'react';
import { LockButtonWithContext } from './LockButtonWithContext';
import { UploadStatusCircle } from './UploadStatusCircle';
import { UploadQueueOverlay } from './UploadQueueOverlay';
import { ToastContainer } from './Toast';
import { BottomNav } from './BottomNav';
import type { AppContext } from '../hooks/useAppContext';
import type { Feed } from '../types/aggregator';
import type { Toast } from './Toast';

export interface AppLayoutProps {
  viewMode: 'grid' | 'feed';
  activeBottomTab: 'home' | 'search' | 'upload' | 'index' | 'messages';
  setActiveBottomTab: (tab: 'home' | 'search' | 'upload' | 'index' | 'messages') => void;
  showUploadQueueOverlay: boolean;
  setShowUploadQueueOverlay: (v: boolean) => void;
  onLockUnlock: () => void;
  userState: { isUnlocked: boolean };
  activeContext: AppContext | null;
  availableContexts: AppContext[];
  setActiveContext: (c: AppContext | null) => void;
  toasts: Toast[];
  removeToast: (id: string) => void;
  setViewMode: (m: 'grid' | 'feed') => void;
  setShowInbox: (v: boolean) => void;
  setShowSearch: (v: boolean) => void;
  setShowUploadModal: (v: boolean) => void;
  setViewingCreatorId: (v: string | null) => void;
  setViewingBrandedFeed: (v: Feed | null) => void;
  onMeClick: () => void;
  children: React.ReactNode;
}

export function AppLayout({
  viewMode,
  activeBottomTab,
  setActiveBottomTab,
  showUploadQueueOverlay,
  setShowUploadQueueOverlay,
  onLockUnlock,
  userState,
  activeContext,
  availableContexts,
  setActiveContext,
  toasts,
  removeToast,
  setViewMode,
  setShowInbox,
  setShowSearch,
  setShowUploadModal,
  setViewingCreatorId,
  setViewingBrandedFeed,
  onMeClick,
  children,
}: AppLayoutProps) {
  return (
    <div
      className={`min-h-screen ${viewMode === 'feed' ? 'h-screen overflow-hidden bg-black' : 'bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900'}`}
    >
      <UploadStatusCircle onClick={() => setShowUploadQueueOverlay(true)} />
      <UploadQueueOverlay isOpen={showUploadQueueOverlay} onClose={() => setShowUploadQueueOverlay(false)} />
      <LockButtonWithContext
        onLockUnlock={onLockUnlock}
        currentContext={userState.isUnlocked ? activeContext : null}
        availableContexts={userState.isUnlocked ? availableContexts : []}
        onContextChange={(c) => setActiveContext(c)}
      />
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <BottomNav
        activeTab={activeBottomTab}
        onTabChange={setActiveBottomTab}
        onHomeClick={() => {
          setActiveBottomTab('home');
          setViewMode('feed');
          setShowInbox(false);
          setShowSearch(false);
          setShowUploadModal(false);
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
        }}
        onSearchClick={() => {
          setShowSearch(true);
          setShowInbox(false);
          setShowUploadModal(false);
          setActiveBottomTab('search');
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
        }}
        onUploadClick={() => {
          setShowUploadModal(true);
          setShowInbox(false);
          setShowSearch(false);
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
          setActiveBottomTab('upload');
        }}
        onIndexClick={onMeClick}
        onInboxClick={() => {
          setShowInbox(true);
          setShowSearch(false);
          setShowUploadModal(false);
          setActiveBottomTab('messages');
          setViewingCreatorId(null);
          setViewingBrandedFeed(null);
        }}
      />
    </div>
  );
}
