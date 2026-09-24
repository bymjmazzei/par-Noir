/**
 * Hook for modal and overlay visibility and related state in the aggregator browser.
 */

import { useState } from 'react';
import type { IndexedFile } from '../types/aggregator';
import type { Feed } from '../types/aggregator';
import { peekPenPublishHandoff } from '../utils/penPublishHandoff';
import { takeCorrespondenceHandoff } from '../utils/penCorrespondenceHandoff';

function shouldOpenUploadFromDeepLink(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const view = new URLSearchParams(window.location.search).get('view');
    if (view === 'upload') return true;
    const handoff = peekPenPublishHandoff();
    if (handoff?.pages?.length) return true;
    if (handoff?.contentClass === 'media' && handoff.awaitingComposedBlobs) return true;
    if (handoff?.contentClass === 'collection' && handoff.awaitingComposedBlobs) return true;
    return false;
  } catch {
    return false;
  }
}

function correspondenceDraftFromHash(): boolean {
  try {
    const handoff = takeCorrespondenceHandoff(true);
    return Boolean(handoff?.body || handoff?.title);
  } catch {
    return false;
  }
}

export function useModals() {
  const [showSearch, setShowSearch] = useState(false);
  const openFromCorrespondence = correspondenceDraftFromHash();
  const [showInbox, setShowInbox] = useState(
    () => import.meta.env.VITE_DEFAULT_VIEW === 'messaging' || openFromCorrespondence
  );
  const [initialThread, setInitialThread] = useState<{
    participantPnIdentifier: string;
    participantName?: string;
    draftBody?: string;
    draftTitle?: string;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedBrowser, setShowFeedBrowser] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [commentingFile, setCommentingFile] = useState<IndexedFile | null>(null);
  const [viewingBrandedFeed, setViewingBrandedFeed] = useState<Feed | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(shouldOpenUploadFromDeepLink);
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
