/**
 * Tabbed modal for picking media to attach in messaging.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, FolderOpen, Users, Bookmark, Smartphone, Loader2, Image as ImageIcon } from 'lucide-react';
import type { MediaPickItem, MediaPickSource } from '@par-noir/messaging-ui';
import { PNOAuthService } from '../services/pnOAuthService';
import { API_ENDPOINT } from '../config/api';
import { getSavedFeed } from '../services/savedFeedService';
import type { IndexedFile } from '../types/aggregator';
import { isMediaMimeType } from '../services/messagingMediaService';
import { pickImageFromNative } from '../hooks/useNativeFilePicker';
import { Capacitor } from '@capacitor/core';
import { useDriveAccounts } from '../hooks/useDriveAccounts';
import { useUserState } from '../contexts/UserStateContext';

type TabId = MediaPickSource;

interface OwnerIndexEntry {
  fileId: string;
  googleDriveFileId?: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  thumbnail?: string;
  contentClass?: string;
}

interface DriveListFile {
  id: string;
  name: string;
  mimeType?: string;
  thumbnailLink?: string;
}

interface MessageMediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (pick: MediaPickItem) => void;
  userPnIdentifier: string;
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'ownPn', label: 'My pN', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'sharedWithMe', label: 'Shared with me', icon: <Users className="h-4 w-4" /> },
  { id: 'saved', label: 'Saved', icon: <Bookmark className="h-4 w-4" /> },
  { id: 'device', label: 'Device', icon: <Smartphone className="h-4 w-4" /> }
];

function displayNameFromEntry(entry: { fileName?: string; originalName?: string; name?: string }): string {
  return (entry.originalName || entry.fileName || entry.name || 'Media').replace(/\.encrypted$/i, '');
}

export function MessageMediaPickerModal({
  open,
  onClose,
  onSelect,
  userPnIdentifier
}: MessageMediaPickerModalProps) {
  const { userState } = useUserState();
  const [activeTab, setActiveTab] = useState<TabId>('ownPn');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownFiles, setOwnFiles] = useState<OwnerIndexEntry[]>([]);
  const [sharedFiles, setSharedFiles] = useState<DriveListFile[]>([]);
  const [savedFiles, setSavedFiles] = useState<IndexedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { selectedId: accountId } = useDriveAccounts({
    authenticatedUserId: userState.pnIdentifier,
    userState: { isUnlocked: userState.isUnlocked, pnIdentifier: userState.pnIdentifier }
  });

  const loadOwnPn = useCallback(async () => {
    const token = await PNOAuthService.getValidAccessToken();
    if (!token) {
      throw new Error('Unlock your pN to browse files');
    }
    const pn = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    const res = await fetch(
      `${API_ENDPOINT}/api/storage/owner-index/${encodeURIComponent(pn)}?contentClass=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new Error('Failed to load your media library');
    }
    const data = await res.json();
    const files = (data.files || []) as OwnerIndexEntry[];
    setOwnFiles(
      files.filter((f) => {
        const id = f.googleDriveFileId || f.fileId;
        return id && isMediaMimeType(f.mimeType);
      })
    );
  }, [userPnIdentifier]);

  const loadShared = useCallback(async () => {
    const token = await PNOAuthService.getValidAccessToken();
    if (!token) {
      throw new Error('Unlock your pN to browse shared files');
    }
    const q = accountId ? `scope=sharedWithMe&accountId=${encodeURIComponent(accountId)}` : 'scope=sharedWithMe';
    const res = await fetch(`${API_ENDPOINT}/api/drive/files?${q}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error('Failed to load shared files');
    }
    const data = await res.json();
    const files = (data.files || []) as DriveListFile[];
    setSharedFiles(files.filter((f) => isMediaMimeType(f.mimeType)));
  }, [accountId]);

  const loadSaved = useCallback(async () => {
    const saved = await getSavedFeed(userPnIdentifier);
    const ids = saved?.fileIds || [];
    if (ids.length === 0) {
      setSavedFiles([]);
      return;
    }
    const token = await PNOAuthService.getValidAccessToken();
    const resolved: IndexedFile[] = [];
    for (const fileId of ids.slice(0, 100)) {
      try {
        const res = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const entry = await res.json();
          if (entry?.metadata) {
            resolved.push({
              metadata: entry.metadata,
              fileId: entry.metadata.fileId || fileId,
              publicToken: entry.metadata.publicToken,
              pnIdentifier: entry.pnIdentifier
            } as IndexedFile);
          }
        }
      } catch {
        /* skip */
      }
    }
    setSavedFiles(
      resolved.filter((f) => {
        const ft = f.metadata?.fileType || f.metadata?.mimeType || '';
        return (
          ft === 'image' ||
          ft === 'video' ||
          ft === 'audio' ||
          (f.metadata?.mimeType && isMediaMimeType(f.metadata.mimeType))
        );
      })
    );
  }, [userPnIdentifier]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setLoading(true);
    const run = async () => {
      try {
        if (activeTab === 'ownPn') {
          await loadOwnPn();
        } else if (activeTab === 'sharedWithMe') {
          await loadShared();
        } else if (activeTab === 'saved') {
          await loadSaved();
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load media');
      } finally {
        setLoading(false);
      }
    };
    if (activeTab !== 'device') {
      run();
    } else {
      setLoading(false);
    }
  }, [open, activeTab, loadOwnPn, loadShared, loadSaved]);

  const handlePickOwn = (entry: OwnerIndexEntry) => {
    const driveFileId = entry.googleDriveFileId || entry.fileId;
    onSelect({
      source: 'ownPn',
      driveFileId,
      accountId: accountId || undefined,
      mimeType: entry.mimeType,
      displayName: displayNameFromEntry(entry)
    });
    onClose();
  };

  const handlePickShared = (file: DriveListFile) => {
    onSelect({
      source: 'sharedWithMe',
      driveFileId: file.id,
      accountId: accountId || undefined,
      mimeType: file.mimeType,
      displayName: displayNameFromEntry(file)
    });
    onClose();
  };

  const handlePickSaved = (file: IndexedFile) => {
    const meta = file.metadata;
    const driveFileId = meta.backendFileId || meta.mainFileId || meta.fileId;
    const ownerPn = file.pnIdentifier || meta.creatorId || meta.ownerDid;
    const publicToken = file.publicToken || meta.publicToken;
    onSelect({
      source: 'saved',
      driveFileId,
      aggregatorFileId: meta.fileId,
      ownerPnIdentifier: ownerPn?.startsWith('pn-') ? ownerPn : ownerPn ? `pn-${ownerPn}` : undefined,
      publicToken: typeof publicToken === 'string' ? publicToken : publicToken ? JSON.stringify(publicToken) : undefined,
      mimeType: meta.mimeType,
      displayName: meta.name || meta.title || 'Saved media'
    });
    onClose();
  };

  const handleDeviceFile = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
      setError('Please choose an image, video, or audio file');
      return;
    }
    onSelect({
      source: 'device',
      deviceFile: file,
      mimeType: file.type,
      displayName: file.name
    });
    onClose();
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-t-xl sm:rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h2 className="text-white font-medium">Attach media</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-neutral-700 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-[200px]">
          {error && (
            <p className="text-red-400 text-sm mb-3">{error}</p>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12 text-neutral-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading…
            </div>
          )}

          {!loading && activeTab === 'ownPn' && (
            ownFiles.length === 0 ? (
              <p className="text-neutral-500 text-sm text-center py-8">No media in your pN folder yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {ownFiles.map((entry) => {
                  const id = entry.googleDriveFileId || entry.fileId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handlePickOwn(entry)}
                      className="aspect-square rounded-lg bg-neutral-800 border border-neutral-700 hover:border-blue-500 overflow-hidden flex flex-col items-center justify-center p-1"
                    >
                      {entry.thumbnail ? (
                        <img src={entry.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-neutral-500 mb-1" />
                      )}
                      <span className="text-[10px] text-neutral-300 truncate w-full text-center px-1">
                        {displayNameFromEntry(entry)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {!loading && activeTab === 'sharedWithMe' && (
            sharedFiles.length === 0 ? (
              <p className="text-neutral-500 text-sm text-center py-8">Nothing shared with your Google account yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {sharedFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => handlePickShared(file)}
                    className="aspect-square rounded-lg bg-neutral-800 border border-neutral-700 hover:border-blue-500 overflow-hidden flex flex-col items-center justify-center p-1"
                  >
                    {file.thumbnailLink ? (
                      <img src={file.thumbnailLink} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-neutral-500 mb-1" />
                    )}
                    <span className="text-[10px] text-neutral-300 truncate w-full text-center px-1">
                      {displayNameFromEntry(file)}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {!loading && activeTab === 'saved' && (
            savedFiles.length === 0 ? (
              <p className="text-neutral-500 text-sm text-center py-8">Save posts from the feed to attach them here.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {savedFiles.map((file) => (
                  <button
                    key={file.metadata.fileId}
                    type="button"
                    onClick={() => handlePickSaved(file)}
                    className="aspect-square rounded-lg bg-neutral-800 border border-neutral-700 hover:border-blue-500 overflow-hidden flex flex-col items-center justify-center p-1"
                  >
                    {file.metadata.thumbnail ? (
                      <img
                        src={typeof file.metadata.thumbnail === 'string'
                          ? file.metadata.thumbnail
                          : file.metadata.thumbnail['@id']}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-neutral-500 mb-1" />
                    )}
                    <span className="text-[10px] text-neutral-300 truncate w-full text-center px-1">
                      {file.metadata.name || file.metadata.title || 'Saved'}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {activeTab === 'device' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleDeviceFile(file);
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Choose file
              </button>
              {Capacitor.isNativePlatform() && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const file = await pickImageFromNative('photos');
                      if (file) {
                        handleDeviceFile(file);
                      }
                    }}
                    className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 text-sm"
                  >
                    Photo library
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const file = await pickImageFromNative('camera');
                      if (file) {
                        handleDeviceFile(file);
                      }
                    }}
                    className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 text-sm"
                  >
                    Camera
                  </button>
                </>
              )}
              <p className="text-neutral-500 text-xs text-center max-w-xs">
                Images, video, and audio from your device are encrypted for this conversation before upload.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
