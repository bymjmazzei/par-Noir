/**
 * Hook for modal and overlay visibility and related state in the aggregator browser.
 */

import { useState } from 'react';
import type { IndexedFile } from '../types/aggregator';
import type { Feed } from '../types/aggregator';

export function useModals() {
  const [showSearch, setShowSearch] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [initialThread, setInitialThread] = useState<{
    participantPnIdentifier: string;
    participantName?: string;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedBrowser, setShowFeedBrowser] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [commentingFile, setCommentingFile] = useState<IndexedFile | null>(null);
  const [viewingBrandedFeed, setViewingBrandedFeed] = useState<Feed | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFeedModal, setShowCreateFeedModal] = useState(false);
  const [addingToFeedFile, setAddingToFeedFile] = useState<IndexedFile | null>(null);
  const [showUploadQueueOverlay, setShowUploadQueueOverlay] = useState(false);

  return {
    showSearch,
    setShowSearch,
    showInbox,
    setShowInbox,
    initialThread,
    setInitialThread,
    showSettings,
    setShowSettings,
    showFeedBrowser,
    setShowFeedBrowser,
    showShortcuts,
    setShowShortcuts,
    commentingFile,
    setCommentingFile,
    viewingBrandedFeed,
    setViewingBrandedFeed,
    showUploadModal,
    setShowUploadModal,
    showCreateFeedModal,
    setShowCreateFeedModal,
    addingToFeedFile,
    setAddingToFeedFile,
    showUploadQueueOverlay,
    setShowUploadQueueOverlay,
  };
}
