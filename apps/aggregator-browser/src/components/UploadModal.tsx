/**
 * Upload Modal Component
 * Uses the dashboard's FileStorageAggregator component directly
 */

import { useState, useEffect, useRef } from 'react';
import { FileStorageAggregator } from './FileStorageAggregator';
import { PenMiniComposer } from './PenMiniComposer';
import { ContentPreferencesPanel } from './ContentPreferencesPanel';
import { useUserState } from '../contexts/UserStateContext';
import { TextPostData, Feed } from '../types/aggregator';
import { FeedService } from '../services/feedService';
import { Settings, X } from 'lucide-react';
import { uploadQueueService } from '../services/uploadQueueService';
import { useDriveAccounts } from '../hooks/useDriveAccounts';
import {
  rememberPublishedFileId,
  takePenPublishHandoff,
  peekPenPublishHandoff,
  signalComposedMediaReady,
  isComposedMediaBlobsMessage,
  type PenPublishHandoff
} from '../utils/penPublishHandoff';

interface UploadModalProps {
  feeds?: Feed[];
  onClose: () => void;
  onUploadComplete?: (contentClass?: 'media' | 'note' | 'collection') => void;
}

function penOriginFromEnv(): string {
  const raw =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: { VITE_PEN_URL?: string } }).env?.VITE_PEN_URL
      : undefined;
  if (raw && String(raw).trim()) return String(raw).replace(/\/$/, '');
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return 'http://127.0.0.1:5175';
  }
  return 'https://pen.parnoir.com';
}

function isAllowedPenOrigin(origin: string): boolean {
  if (origin === penOriginFromEnv()) return true;
  if (/localhost|127\.0\.0\.1/.test(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'pen.parnoir.com' ||
      host === 'pen-parnoir.web.app' ||
      host.endsWith('.pen.parnoir.com')
    );
  } catch {
    return false;
  }
}

export function UploadModal({ feeds: propsFeeds, onClose, onUploadComplete }: UploadModalProps) {
  const { userState } = useUserState();
  const initialHandoff = peekPenPublishHandoff();
  const [showTextEditor, setShowTextEditor] = useState(() =>
    Boolean(initialHandoff?.pages?.length && initialHandoff.contentClass !== 'media')
  );
  const [showSettings, setShowSettings] = useState(false);
  const [editorAccountId, setEditorAccountId] = useState<string | null>(null);
  const [, setFeeds] = useState<Feed[]>(propsFeeds || []);
  const [composedStatus, setComposedStatus] = useState<string | null>(
    initialHandoff?.contentClass === 'media' && initialHandoff.awaitingComposedBlobs
      ? 'Waiting for composed video from Pen…'
      : null
  );
  const composedQueued = useRef(false);

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

  // Pen composed-video handoff: signal opener and queue media upload when blobs arrive
  useEffect(() => {
    const handoff = peekPenPublishHandoff();
    if (handoff?.contentClass !== 'media' || !handoff.awaitingComposedBlobs) return;

    const penOrigin = penOriginFromEnv();
    signalComposedMediaReady(penOrigin);

    const onMessage = (e: MessageEvent) => {
      if (!isAllowedPenOrigin(e.origin)) return;
      if (!isComposedMediaBlobsMessage(e.data)) return;
      if (composedQueued.current) return;
      if (!accountId || !authenticatedUser?.id) {
        setComposedStatus('Unlock your pN to finish composed video upload');
        return;
      }
      composedQueued.current = true;
      const meta = (e.data.meta || handoff) as PenPublishHandoff;
      const videoFile = e.data.videoFile!;
      const posterFile = e.data.posterFile;
      takePenPublishHandoff();
      setComposedStatus('Uploading composed video…');

      uploadQueueService.addTask({
        type: 'file',
        file: videoFile,
        accountId,
        metadata: {
          title: meta.title || 'Pen composed video',
          isPublic: true,
          contentClass: 'media',
          fileType: 'video',
          feedPosterFile: posterFile,
          headProof: meta.headProof,
          penDocId: meta.docId,
          templateId: meta.templateId,
          penClassId: meta.penClassId,
          penCategoryId: meta.penCategoryId,
          penTemplateKind: meta.penTemplateKind,
          basedOnTemplateId: meta.basedOnTemplateId,
          penIrRef: meta.penIrRef,
          licensing: meta.licensing,
          durationMs: meta.durationMs,
          width: meta.width,
          height: meta.height
        },
        onComplete: (result) => {
          if (meta.docId && result?.fileId) {
            rememberPublishedFileId(meta.docId, result.fileId);
          }
          setComposedStatus(null);
          onUploadComplete?.('media');
        },
        onError: (error) => {
          composedQueued.current = false;
          setComposedStatus(null);
          alert(`Composed video upload failed: ${error.message}`);
        }
      });
    };

    window.addEventListener('message', onMessage);
    // Re-signal a few times in case Pen listened late
    const t1 = window.setTimeout(() => signalComposedMediaReady(penOrigin), 500);
    const t2 = window.setTimeout(() => signalComposedMediaReady(penOrigin), 1500);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [accountId, authenticatedUser?.id, onUploadComplete]);

  const handleNoteUploadComplete = () => {
    onUploadComplete?.('note');
  };

  const handleTextPostSave = async (textPost: TextPostData | any) => {
    if (!authenticatedUser?.id) {
      alert('Please unlock your pN to create notes');
      return;
    }

    if (!accountId) {
      alert('Please wait for accounts to load');
      return;
    }

    try {
      const handoff = takePenPublishHandoff();
      const fromPost = (textPost?.penPublish || textPost?.metadata || {}) as Record<string, unknown>;
      const templateId =
        (typeof handoff?.templateId === 'string' && handoff.templateId) ||
        (typeof fromPost.templateId === 'string' && fromPost.templateId) ||
        (typeof textPost?.metadata?.templateId === 'string' && textPost.metadata.templateId) ||
        undefined;
      const penDocId =
        (typeof handoff?.docId === 'string' && handoff.docId) ||
        (typeof fromPost.penDocId === 'string' && fromPost.penDocId) ||
        (typeof fromPost.docId === 'string' && fromPost.docId) ||
        undefined;
      const headProof = handoff?.headProof ?? fromPost.headProof;
      const penClassId =
        (typeof handoff?.penClassId === 'string' && handoff.penClassId) ||
        (typeof fromPost.penClassId === 'string' && fromPost.penClassId) ||
        undefined;
      const penCategoryId =
        (typeof handoff?.penCategoryId === 'string' && handoff.penCategoryId) ||
        (typeof fromPost.penCategoryId === 'string' && fromPost.penCategoryId) ||
        undefined;
      const penTemplateKind =
        handoff?.penTemplateKind ||
        (fromPost.penTemplateKind === 'template' || fromPost.penTemplateKind === 'remix'
          ? fromPost.penTemplateKind
          : undefined);
      const basedOnTemplateId =
        (typeof handoff?.basedOnTemplateId === 'string' && handoff.basedOnTemplateId) ||
        (typeof fromPost.basedOnTemplateId === 'string' && fromPost.basedOnTemplateId) ||
        undefined;
      const penIrRef = handoff?.penIrRef ?? fromPost.penIrRef;
      const licensing = handoff?.licensing ?? fromPost.licensing;
      const musicPenDocId =
        (typeof handoff?.musicPenDocId === 'string' && handoff.musicPenDocId) ||
        (typeof fromPost.musicPenDocId === 'string' && fromPost.musicPenDocId) ||
        undefined;
      const musicLicensing = handoff?.musicLicensing ?? fromPost.musicLicensing;

      if (!headProof || !penDocId) {
        alert(
          'Unlock did not include signing keys. Unlock again so ML-DSA keys are in the messaging handoff.'
        );
        return;
      }

      const penFields = {
        contentClass: 'note' as const,
        headProof,
        ...(templateId ? { templateId } : {}),
        penDocId,
        ...(penClassId ? { penClassId } : {}),
        ...(penCategoryId ? { penCategoryId } : {}),
        ...(penTemplateKind ? { penTemplateKind } : {}),
        ...(basedOnTemplateId ? { basedOnTemplateId } : {}),
        ...(penIrRef ? { penIrRef } : {}),
        ...(licensing ? { licensing } : {}),
        ...(musicPenDocId ? { musicPenDocId } : {}),
        ...(musicLicensing ? { musicLicensing } : {}),
      };

      const linkPublishedFile = (result: { fileId?: string } | null | undefined) => {
        const fileId = result?.fileId;
        if (penDocId && fileId) rememberPublishedFileId(penDocId, fileId);
      };

      const isMultiPage = (textPost as any).isMultiPage && (textPost as any).pages && Array.isArray((textPost as any).pages) && (textPost as any).pages.length > 1;

      if (isMultiPage) {
        const pages = (textPost as any).pages as TextPostData[];
        const metadata = textPost.metadata || {};

        console.log(`[UploadModal] Creating multi-page note with ${pages.length} pages via upload queue`);

        setShowTextEditor(false);

        const taskId = uploadQueueService.addTask({
          type: 'multiPage',
          pages,
          accountId,
          metadata: {
            name: metadata.name || 'note-collection',
            title: metadata.title || metadata.name || handoff?.title || 'note-collection',
            description: metadata.description || '',
            keywords: metadata.keywords || metadata.tags || [],
            tags: metadata.tags || metadata.keywords || [],
            isPublic: metadata.isPublic !== undefined ? metadata.isPublic : true,
            isNSFW: textPost.isNSFW || metadata.isNSFW || false,
            expiresAt: metadata.expiresAt ?? null,
            ...penFields,
          },
          onComplete: (result) => {
            console.log('[UploadModal] Multi-page note upload completed:', result);
            linkPublishedFile(result);
            handleNoteUploadComplete();
          },
          onError: (error) => {
            console.error('[UploadModal] Multi-page note upload failed:', error);
            alert(`Failed to create multi-page note: ${error.message}`);
          },
        });

        console.log(`[UploadModal] Multi-page note queued for upload, taskId: ${taskId}`);
      } else {
        const metadata = textPost.metadata || {};

        console.log(`[UploadModal] Creating single-page note via upload queue`);

        setShowTextEditor(false);

        const taskId = uploadQueueService.addTask({
          type: 'textPost',
          textPost,
          accountId,
          metadata: {
            title: textPost.metadata?.name || handoff?.title || textPost.content.substring(0, 50),
            description: textPost.metadata?.description || textPost.content,
            keywords: textPost.metadata?.keywords || textPost.metadata?.tags || (textPost.category ? [textPost.category] : undefined),
            tags: textPost.metadata?.tags || textPost.metadata?.keywords || (textPost.category ? [textPost.category] : undefined),
            isPublic: metadata.isPublic !== undefined ? metadata.isPublic : true,
            isNSFW: textPost.isNSFW || false,
            expiresAt: metadata.expiresAt ?? null,
            ...penFields,
          },
          onComplete: (result) => {
            console.log('[UploadModal] Single-page note upload completed:', result);
            linkPublishedFile(result);
            handleNoteUploadComplete();
          },
          onError: (error) => {
            console.error('[UploadModal] Single-page note upload failed:', error);
            alert(`Failed to create note: ${error.message}`);
          },
        });

        console.log(`[UploadModal] Single-page note queued for upload, taskId: ${taskId}`);
      }
    } catch (error: any) {
      console.error('Failed to create note:', error);
      alert(`Failed to create note: ${error?.message || 'Unknown error'}`);
    }
  };

  if (showTextEditor) {
    return (
      <PenMiniComposer
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

      {composedStatus && (
        <div
          className="px-4 py-2 text-center text-sm text-sky-300"
          style={{ marginTop: 'calc(48px + env(safe-area-inset-top, 0px))' }}
        >
          {composedStatus}
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto p-6"
        style={{
          marginTop: composedStatus
            ? '0px'
            : 'calc(48px + env(safe-area-inset-top, 0px))'
        }}
      >
        <FileStorageAggregator
          authenticatedUser={authenticatedUser}
          hideSecureFolderSection={true}
          onUploadComplete={onUploadComplete}
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
