/**
 * UI State Hook
 * Manages UI-related state (viewMode, modals, etc.)
 */

import { useState } from 'react';

export function useUIState() {
  const [viewMode, setViewMode] = useState<'feed' | 'index'>('feed'); // 'feed' = TikTok-style vertical viewer, 'index' = search-results style
  const [showFeedBrowser, setShowFeedBrowser] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFeedModal, setShowCreateFeedModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return !localStorage.getItem('pn_welcome_completed');
    } catch {
      return false;
    }
  });
  const [viewingCreatorId, setViewingCreatorId] = useState<string | null>(null);
  const [viewingBrandedFeed, setViewingBrandedFeed] = useState<any>(null);

  return {
    viewMode,
    setViewMode,
    showFeedBrowser,
    setShowFeedBrowser,
    showSettings,
    setShowSettings,
    showShortcuts,
    setShowShortcuts,
    showUploadModal,
    setShowUploadModal,
    showCreateFeedModal,
    setShowCreateFeedModal,
    showWelcome,
    setShowWelcome,
    viewingCreatorId,
    setViewingCreatorId,
    viewingBrandedFeed,
    setViewingBrandedFeed
  };
}

