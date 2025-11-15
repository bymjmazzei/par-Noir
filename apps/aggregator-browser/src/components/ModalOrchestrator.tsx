/**
 * Modal Orchestrator
 * Centralized modal rendering and management
 */

import React from 'react';
import { IndexedFile, Feed } from '../types/aggregator';
import { MediaViewer } from './MediaViewer';
import { FeedBrowser } from './FeedBrowser';
import { CreateFeedModal } from './CreateFeedModal';
import { AddToFeedModal } from './AddToFeedModal';
import { SettingsPanel } from './SettingsPanel';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { WelcomeModal } from './WelcomeModal';
import { CommentModal } from './CommentModal';
import { UploadModal } from './UploadModal';

interface ModalOrchestratorProps {
  // Modal visibility states
  viewingFile: { file: IndexedFile; blob: Blob; url: string } | null;
  showFeedBrowser: boolean;
  showCreateFeedModal: boolean;
  addingToFeedFile: IndexedFile | null;
  showSettings: boolean;
  showShortcuts: boolean;
  showWelcome: boolean;
  commentingFile: IndexedFile | null;
  showUploadModal: boolean;
  
  // Data
  feeds: Feed[];
  
  // Handlers
  onCloseViewingFile: () => void;
  onCloseFeedBrowser: () => void;
  onFeedClick: (feed: Feed) => void;
  onCreateFeedClick: () => void;
  onFeedCreated: (feed: Feed) => void;
  onCloseCreateFeedModal: () => void;
  onCloseAddToFeed: () => void;
  onAddedToFeed: (feedId: string) => void;
  onCloseSettings: () => void;
  onCloseShortcuts: () => void;
  onCloseWelcome: () => void;
  onCompleteWelcome: () => void;
  onCloseComment: () => void;
  onCloseUpload: () => void;
  onUploadComplete: () => void;
}

export function ModalOrchestrator({
  viewingFile,
  showFeedBrowser,
  showCreateFeedModal,
  addingToFeedFile,
  showSettings,
  showShortcuts,
  showWelcome,
  commentingFile,
  showUploadModal,
  feeds,
  onCloseViewingFile,
  onCloseFeedBrowser,
  onFeedClick,
  onCreateFeedClick,
  onFeedCreated,
  onCloseCreateFeedModal,
  onCloseAddToFeed,
  onAddedToFeed,
  onCloseSettings,
  onCloseShortcuts,
  onCloseWelcome,
  onCompleteWelcome,
  onCloseComment,
  onCloseUpload,
  onUploadComplete
}: ModalOrchestratorProps) {
  return (
    <>
      {/* Media Viewer */}
      {viewingFile && (
        <MediaViewer
          file={viewingFile.file}
          blob={viewingFile.blob}
          url={viewingFile.url}
          onClose={onCloseViewingFile}
        />
      )}

      {/* Feed Browser Modal */}
      {showFeedBrowser && (
        <FeedBrowser
          feeds={feeds}
          onClose={onCloseFeedBrowser}
          onFeedClick={onFeedClick}
          onCreateFeed={onCreateFeedClick}
        />
      )}

      {/* Create Feed Modal */}
      {showCreateFeedModal && (
        <CreateFeedModal
          onClose={onCloseCreateFeedModal}
          onFeedCreated={onFeedCreated}
        />
      )}

      {/* Add to Feed Modal */}
      {addingToFeedFile && (
        <AddToFeedModal
          file={addingToFeedFile}
          feeds={feeds}
          onClose={onCloseAddToFeed}
          onAdded={onAddedToFeed}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          onClose={onCloseSettings}
        />
      )}

      {/* Keyboard Shortcuts Panel */}
      {showShortcuts && (
        <KeyboardShortcuts
          onClose={onCloseShortcuts}
        />
      )}

      {/* Welcome Modal */}
      {showWelcome && (
        <WelcomeModal
          onClose={onCloseWelcome}
          onComplete={onCompleteWelcome}
        />
      )}

      {/* Comment Modal */}
      {commentingFile && (
        <CommentModal
          file={commentingFile}
          onClose={onCloseComment}
        />
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={onCloseUpload}
          onUploadComplete={onUploadComplete}
        />
      )}
    </>
  );
}

