/**
 * Upload Modal Component
 * Uses the dashboard's FileStorageAggregator component directly
 */

import { useState, useEffect } from 'react';
import { FileStorageAggregator } from './FileStorageAggregator';
import { TextPostEditor } from './TextPostEditor';
import { ContentPreferencesPanel } from './ContentPreferencesPanel';
import { useUserState } from '../contexts/UserStateContext';
import { TextPostData, Feed } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { Settings, X } from 'lucide-react';
import { uploadQueueService } from '../services/uploadQueueService';
import { useDriveAccounts } from '../hooks/useDriveAccounts';

interface UploadModalProps {
  feeds?: Feed[];
  onClose: () => void;
  onUploadComplete?: (contentClass?: 'media' | 'thought' | 'collection') => void;
}

export function UploadModal({ feeds: propsFeeds, onClose, onUploadComplete }: UploadModalProps) {
  const { userState } = useUserState();
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editorAccountId, setEditorAccountId] = useState<string | null>(null);
  const [, setFeeds] = useState<Feed[]>(propsFeeds || []);

  const authenticatedUser = userState.isUnlocked && userState.pnIdentifier ? {
    id: userState.pnIdentifier
  } : null;

  const { selectedId: driveAccountId } = useDriveAccounts({
    authenticatedUserId: authenticatedUser?.id,
    userState: {
      isUnlocked: userState.isUnlocked,
      pnIdentifier: userState.pnIdentifier,
    },
  });

  const accountId = editorAccountId || driveAccountId || authenticatedUser?.id || null;

  // Load feeds for content preferences if not provided as prop
  useEffect(() => {
    if (propsFeeds && propsFeeds.length > 0) {
      setFeeds(propsFeeds);
      return;
    }
    const loadFeeds = async () => {
      try {
        const feedList = await FeedService.listFeeds();
        setFeeds(feedList.feeds || []);
      } catch (error) {
        console.error('Failed to load feeds:', error);
      }
    };
    loadFeeds();
  }, [propsFeeds]);

  const handleThoughtUploadComplete = () => {
    onUploadComplete?.('thought');
  };

  const handleTextPostSave = async (textPost: TextPostData | any) => {
    if (!authenticatedUser?.id) {
      alert('Please unlock your pN to create thoughts');
      return;
    }

    if (!accountId) {
      alert('Please wait for accounts to load');
      return;
    }

    try {
      const isMultiPage = (textPost as any).isMultiPage && (textPost as any).pages && Array.isArray((textPost as any).pages) && (textPost as any).pages.length > 1;

      if (isMultiPage) {
        const pages = (textPost as any).pages as TextPostData[];
        const metadata = textPost.metadata || {};

        console.log(`[UploadModal] Creating multi-page thought with ${pages.length} pages via upload queue`);

        setShowTextEditor(false);

        const taskId = uploadQueueService.addTask({
          type: 'multiPage',
          pages,
          accountId,
          metadata: {
            name: metadata.name || 'thought-collection',
            title: metadata.title || metadata.name || 'thought-collection',
            description: metadata.description || '',
            keywords: metadata.keywords || metadata.tags || [],
            tags: metadata.tags || metadata.keywords || [],
            isPublic: metadata.isPublic !== undefined ? metadata.isPublic : true,
            isNSFW: textPost.isNSFW || metadata.isNSFW || false,
          },
          onComplete: (result) => {
            console.log('[UploadModal] Multi-page thought upload completed:', result);
            handleThoughtUploadComplete();
          },
          onError: (error) => {
            console.error('[UploadModal] Multi-page thought upload failed:', error);
            alert(`Failed to create multi-page thought: ${error.message}`);
          },
        });

        console.log(`[UploadModal] Multi-page thought queued for upload, taskId: ${taskId}`);
      } else {
        const metadata = textPost.metadata || {};

        console.log(`[UploadModal] Creating single-page thought via upload queue`);

        setShowTextEditor(false);

        const taskId = uploadQueueService.addTask({
          type: 'textPost',
          textPost,
          accountId,
          metadata: {
            title: textPost.metadata?.name || textPost.content.substring(0, 50),
            description: textPost.metadata?.description || textPost.content,
            keywords: textPost.metadata?.keywords || textPost.metadata?.tags || (textPost.category ? [textPost.category] : undefined),
            tags: textPost.metadata?.tags || textPost.metadata?.keywords || (textPost.category ? [textPost.category] : undefined),
            isPublic: metadata.isPublic !== undefined ? metadata.isPublic : true,
            isNSFW: textPost.isNSFW || false,
          },
          onComplete: (result) => {
            console.log('[UploadModal] Single-page thought upload completed:', result);
            handleThoughtUploadComplete();
          },
          onError: (error) => {
            console.error('[UploadModal] Single-page thought upload failed:', error);
            alert(`Failed to create thought: ${error.message}`);
          },
        });

        console.log(`[UploadModal] Single-page thought queued for upload, taskId: ${taskId}`);
      }
    } catch (error: any) {
      console.error('Failed to create text post:', error);
      alert(`Failed to create thought: ${error?.message || 'Unknown error'}`);
    }
  };

  if (showTextEditor) {
    return (
      <TextPostEditor
        onSave={handleTextPostSave}
        onCancel={() => setShowTextEditor(false)}
      />
    );
  }

  return (
    <div className="h-full w-full bg-neutral-900 flex flex-col overflow-y-auto" style={{ paddingBottom: '64px' }}>
      <div
        className="fixed left-0 right-0 h-12 flex items-center justify-between px-4 z-[100] bg-neutral-900 border-b border-neutral-800"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-text-secondary hover:text-white transition-colors"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>

        <h2 className="text-sm font-medium uppercase tracking-wide text-white">
          Upload from Secure Cloud
        </h2>

        <button
          type="button"
          onClick={onClose}
          className="p-2 text-text-secondary hover:text-white transition-colors"
          title="Close upload"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto p-6"
        style={{ marginTop: 'calc(48px + env(safe-area-inset-top, 0px))' }}
      >
        <FileStorageAggregator
          authenticatedUser={authenticatedUser}
          hideSecureFolderSection={true}
          onOpenTextEditor={(selectedAccountId) => {
            setEditorAccountId(selectedAccountId);
            setShowTextEditor(true);
          }}
        />
      </div>

      {showSettings && (
        <ContentPreferencesPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
