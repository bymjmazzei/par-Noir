/**
 * Per-account file section for FileStorageAggregator (browser app).
 * Renders the account toolbar, add menu, grid/list file views, and
 * collection / bulk-delete footers for a single connected storage account.
 */

import React from 'react';
import { File, RefreshCw, Lock, Globe, Eye, Grid, List, Plus, Cloud, MoreVertical, Type, Upload, Minus, Trash2, Layers, Camera, Image } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { cleanTitle } from '../../utils/cleanTitle';
import { ThumbnailImage } from '../file/ThumbnailImage';
import { pickImageFromNative } from '../../hooks/useNativeFilePicker';
import type { DriveAccount, DriveFile } from './storageTypes';

export interface AccountFilesPanelProps {
  account: DriveAccount;
  index: number;
  accountFiles: DriveFile[];
  isLoading: boolean;
  viewMode: 'grid' | 'list';
  setViewMode: React.Dispatch<React.SetStateAction<'grid' | 'list'>>;
  isBulkDeleteMode: boolean;
  setIsBulkDeleteMode: React.Dispatch<React.SetStateAction<boolean>>;
  isCollectionMode: boolean;
  setIsCollectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  collectionFileOrder: Map<string, number>;
  setCollectionFileOrder: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  toggleFileSelection: (fileId: string) => void;
  selectAllFiles: (accountId: string) => void;
  fileMetadataMap: Map<string, any>;
  openMenuFor: string | null;
  setOpenMenuFor: React.Dispatch<React.SetStateAction<string | null>>;
  setMenuPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>;
  showAddMenuFor: string | null;
  setShowAddMenuFor: React.Dispatch<React.SetStateAction<string | null>>;
  addMenuPosition: { top: number; left: number } | null;
  setAddMenuPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>;
  setViewingFile: React.Dispatch<React.SetStateAction<DriveFile | null>>;
  setDriveAccounts: React.Dispatch<React.SetStateAction<DriveAccount[]>>;
  setSelectedAccountId: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  fileInputRefs: React.MutableRefObject<Map<string, HTMLInputElement | null>>;
  addButtonRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>;
  menuButtonRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>;
  loadFilesForAccount: (accountId: string) => Promise<void>;
  handleUploadForAccount: (accountId: string, event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  addUploadTask: (file: File, accountId: string, encrypt: boolean) => void;
  handleCreateCollection: (accountId: string) => Promise<void>;
  handleBulkDelete: (accountId: string) => void;
  onOpenTextEditor?: (accountId: string) => void;
}

export const AccountFilesPanel: React.FC<AccountFilesPanelProps> = ({
  account,
  index,
  accountFiles,
  isLoading,
  viewMode,
  setViewMode,
  isBulkDeleteMode,
  setIsBulkDeleteMode,
  isCollectionMode,
  setIsCollectionMode,
  selectedFiles,
  setSelectedFiles,
  collectionFileOrder,
  setCollectionFileOrder,
  toggleFileSelection,
  selectAllFiles,
  fileMetadataMap,
  openMenuFor,
  setOpenMenuFor,
  setMenuPosition,
  showAddMenuFor,
  setShowAddMenuFor,
  addMenuPosition,
  setAddMenuPosition,
  setViewingFile,
  setDriveAccounts,
  setSelectedAccountId,
  setError,
  fileInputRefs,
  addButtonRefs,
  menuButtonRefs,
  loadFilesForAccount,
  handleUploadForAccount,
  addUploadTask,
  handleCreateCollection,
  handleBulkDelete,
  onOpenTextEditor,
}) => {
  return (
    <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <Cloud className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <span className="text-white font-semibold truncate">
            {account.email || account.displayName || `Drive ${index + 1}`}
          </span>
          <button
            onClick={() => {
              // Disconnect - just remove from UI for now (would need API endpoint)
              setDriveAccounts(prev => prev.filter(a => a.accountId !== account.accountId));
            }}
            className="text-red-400 hover:text-red-300 text-sm flex-shrink-0"
          >
            Disconnect
          </button>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-auto">
          <button
            onClick={() => {
              loadFilesForAccount(account.accountId);
            }}
            disabled={isLoading}
            className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
            title="Refresh Files"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <input
            type="file"
            ref={(el) => {
              if (el) {
                fileInputRefs.current.set(account.accountId, el);
              } else {
                fileInputRefs.current.delete(account.accountId);
              }
            }}
            className="hidden"
            disabled={isLoading}
            onChange={(e) => {
              handleUploadForAccount(account.accountId, e);
            }}
          />
          <div className="relative">
            <button
              ref={(el) => {
                if (el) {
                  addButtonRefs.current.set(account.accountId, el);
                } else {
                  addButtonRefs.current.delete(account.accountId);
                }
              }}
              onClick={(e) => {
                const button = e.currentTarget;
                const rect = button.getBoundingClientRect();
                setShowAddMenuFor(account.accountId);
                setAddMenuPosition({
                  top: rect.bottom,
                  left: rect.left + rect.width / 2
                });
              }}
              disabled={isLoading}
              className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
              title="Add Content"
            >
              <Plus className="h-4 w-4" />
            </button>
            {showAddMenuFor === account.accountId && addMenuPosition && (
              <div
                data-add-menu={account.accountId}
                className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg py-1 min-w-[160px]"
                style={{
                  top: `${addMenuPosition.top}px`,
                  left: `${addMenuPosition.left}px`,
                  transform: 'translateX(-50%)',
                  marginTop: '8px'
                }}
              >
                <button
                  onClick={() => {
                    if (onOpenTextEditor) {
                      onOpenTextEditor(account.accountId);
                    }
                    setShowAddMenuFor(null);
                    setAddMenuPosition(null);
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                >
                  <Type className="h-4 w-4" />
                  Add Thought
                </button>
                {Capacitor.isNativePlatform() && (
                  <>
                    <button
                      onClick={async () => {
                        setSelectedAccountId(account.accountId);
                        const file = await pickImageFromNative('camera');
                        if (file) {
                          addUploadTask(file, account.accountId, true);
                        }
                        setShowAddMenuFor(null);
                        setAddMenuPosition(null);
                      }}
                      className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                    >
                      <Camera className="h-4 w-4" />
                      Take Photo
                    </button>
                    <button
                      onClick={async () => {
                        setSelectedAccountId(account.accountId);
                        const file = await pickImageFromNative('photos');
                        if (file) {
                          addUploadTask(file, account.accountId, true);
                        }
                        setShowAddMenuFor(null);
                        setAddMenuPosition(null);
                      }}
                      className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                    >
                      <Image className="h-4 w-4" />
                      Choose from Library
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setSelectedAccountId(account.accountId);
                    const input = fileInputRefs.current.get(account.accountId);
                    if (input) {
                      input.click();
                    } else {
                      if (import.meta.env.DEV) console.error('[FileStorageAggregator] File input not found for account:', account.accountId);
                      setError('File input not initialized. Please refresh the page.');
                    }
                    setShowAddMenuFor(null);
                    setAddMenuPosition(null);
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                >
                  <Upload className="h-4 w-4" />
                  Add File
                </button>
                <button
                  onClick={() => {
                    setSelectedAccountId(account.accountId);
                    setIsCollectionMode(true);
                    setIsBulkDeleteMode(false);
                    setSelectedFiles(new Set());
                    setCollectionFileOrder(new Map());
                    setShowAddMenuFor(null);
                    setAddMenuPosition(null);
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                >
                  <Layers className="h-4 w-4" />
                  Add Collection
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setIsBulkDeleteMode(!isBulkDeleteMode);
              if (isBulkDeleteMode) {
                setSelectedFiles(new Set());
              }
            }}
            disabled={isLoading}
            className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
            title={isBulkDeleteMode ? "Cancel Bulk Delete" : "Bulk Delete"}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded transition-colors flex items-center justify-center ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            title="List View"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded transition-colors flex items-center justify-center ${
              viewMode === 'grid'
                ? 'bg-blue-600 text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            title="Grid View"
          >
            <Grid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {accountFiles.length === 0 ? (
        <div className="text-center py-12">
          <File className="h-12 w-12 text-text-secondary mx-auto mb-4" />
          <p className="text-text-secondary">No files found for this account</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {accountFiles.map((file) => {
            const isImage = file.mimeType?.startsWith('image/');
            const isVideo = file.mimeType?.startsWith('video/');
            const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');
            const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');

            // Check if this is a collection
            const isCollection = (file as any).fileType === 'collection' ||
                               nameWithoutEncrypted.toLowerCase().startsWith('collection-') &&
                               nameWithoutEncrypted.toLowerCase().endsWith('.collection');

            // For encrypted files, check if they're media files by extension
            const isThought = nameWithoutEncrypted.toLowerCase().startsWith('thought-') &&
                             (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
            const isThoughtThumbnail = nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') &&
                                      (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
            let isMediaFile = isImage || isVideo || isThought || isThoughtThumbnail || isCollection;
            if (isEncrypted && !isCollection) {
              const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
              const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
              const hasThoughtExt = /\.thought$/i.test(nameWithoutEncrypted) ||
                                   (nameWithoutEncrypted.toLowerCase().startsWith('thought-') && nameWithoutEncrypted.toLowerCase().endsWith('.png')) ||
                                   nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
              isMediaFile = hasImageExt || hasVideoExt || hasThoughtExt;
            }

            return (
              <div
                key={file.id}
                className={`bg-neutral-800/50 rounded-lg overflow-hidden hover:bg-neutral-800 transition-colors group ${
                  (isBulkDeleteMode || isCollectionMode) ? 'cursor-default' : 'cursor-pointer'
                } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                onClick={(e) => {
                  // Handle checkbox click in bulk delete or collection mode
                  if (isBulkDeleteMode || isCollectionMode) {
                    const target = e.target as HTMLElement;
                    if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                      toggleFileSelection(file.id);
                      return;
                    }
                    toggleFileSelection(file.id);
                    return;
                  }
                  // Don't open file viewer if clicking on menu button or menu
                  const target = e.target as HTMLElement;
                  if (target.closest('[data-menu-button]') || target.closest('.menu-container')) {
                    return;
                  }
                  // Ensure collection metadata is included when opening
                  const fileWithMetadata = {
                    ...file,
                    accountId: file.accountId || account.accountId,
                    fileType: (file as any).fileType || fileMetadataMap.get(file.id)?.fileType,
                    collection: (file as any).collection || fileMetadataMap.get(file.id)?.collection
                  };
                  setViewingFile(fileWithMetadata);
                }}
              >
                {/* Checkbox or order number for collection/bulk delete mode */}
                {(isBulkDeleteMode || isCollectionMode) && (
                  <div className="absolute top-2 left-2 z-30" onClick={(e) => e.stopPropagation()}>
                    {isCollectionMode && collectionFileOrder.has(file.id) ? (
                      // Show number badge when selected in collection mode
                      <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                        {collectionFileOrder.get(file.id)}
                      </div>
                    ) : (
                      // Show checkbox when not selected or in bulk delete mode
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                )}
                <div className="relative aspect-square bg-neutral-700/50 overflow-hidden">
                  {isCollection ? (
                    (() => {
                      const collectionData = (file as any).collection;
                      const firstFileId = collectionData?.collectionFileIds?.[0];
                      const firstFile = firstFileId ? accountFiles.find(f => f.id === firstFileId) : null;

                      return (
                        <div className="w-full h-full relative">
                          {firstFile && (firstFile.mimeType?.startsWith('image/') || firstFile.mimeType?.startsWith('video/')) ? (
                            <>
                              <ThumbnailImage
                                fileId={firstFile.id}
                                accountId={firstFile.accountId || account.accountId}
                                backend={account.provider}
                                fileName={firstFile.name}
                                alt={firstFile.name}
                                mimeType={firstFile.mimeType}
                                mainFileId={(firstFile as any).mainFileId}
                                isThumbnail={(firstFile as any).isThumbnail}
                              />
                              {/* Collection icon overlay */}
                              <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5">
                                <Layers className="h-4 w-4 text-blue-400" />
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-600/20 to-purple-600/20">
                              <Layers className="h-12 w-12 text-blue-400 mb-2" />
                              <span className="text-xs text-white/80 px-2 text-center">
                                {collectionData?.collectionFileIds?.length || 0 > 0
                                  ? `${collectionData.collectionFileIds.length} items`
                                  : 'Collection'}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : isMediaFile ? (
                    <ThumbnailImage
                      fileId={file.id}
                      accountId={file.accountId || account.accountId}
                      backend={account.provider}
                      fileName={file.name}
                      alt={file.name}
                      mimeType={file.mimeType}
                      mainFileId={(file as any).mainFileId}
                      isThumbnail={(file as any).isThumbnail}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Lock className="h-8 w-8 text-blue-400" />
                    </div>
                  )}
                  {/* Uploading indicator */}
                  {file.isUploading && (
                    <>
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                        <div className="text-center">
                          <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-2" />
                          <div className="text-white text-xs font-semibold">
                            {file.uploadProgress || 0}%
                          </div>
                        </div>
                      </div>
                      {/* Progress bar at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700 z-30">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${file.uploadProgress || 0}%` }}
                        />
                      </div>
                    </>
                  )}
                  {/* Public indicator - moved to bottom left to avoid conflict with checkbox/number */}
                  {file.isPublic && !file.isUploading && (
                    <div className="absolute bottom-2 left-2 bg-green-500/80 rounded-full p-1 z-10">
                      <Globe className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {/* Menu button - top right corner (hidden in bulk delete or collection mode) */}
                  {!isBulkDeleteMode && !isCollectionMode && (
                    <div className="absolute top-2 right-2 z-20 menu-container" onClick={(e) => e.stopPropagation()}>
                      <button
                      ref={(el) => {
                        if (el) menuButtonRefs.current.set(file.id, el);
                        else menuButtonRefs.current.delete(file.id);
                      }}
                      data-menu-button={file.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const button = e.currentTarget;
                        const rect = button.getBoundingClientRect();
                        const newState = openMenuFor === file.id ? null : file.id;
                        if (newState) {
                          // Position menu below the button for grid view (top right)
                          setMenuPosition({
                            top: rect.bottom + 8, // 8px below button
                            left: rect.right - 176 // 176px = w-44 (11rem), align right edge
                          });
                        } else {
                          setMenuPosition(null);
                        }
                        setOpenMenuFor(newState);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      className="bg-neutral-900/80 hover:bg-neutral-800/90 rounded-full p-1.5 transition-colors"
                      title="File actions"
                      disabled={isLoading}
                    >
                        <MoreVertical className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  )}
                  {isMediaFile && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Eye className="h-6 w-6 text-white" />
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <p className="text-white text-xs truncate mb-1" title={(file as any).displayName || fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || file.name}>
                    {cleanTitle((file as any).displayName || fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || file.name)}
                  </p>
                  <p className="text-text-secondary text-xs">
                    {(parseInt(file.size || '0') / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {accountFiles.map((file) => {
            const isImage = file.mimeType?.startsWith('image/');
            const isVideo = file.mimeType?.startsWith('video/');
            const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');
            const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');

            // Check if this is a collection
            const isCollection = (file as any).fileType === 'collection' ||
                               nameWithoutEncrypted.toLowerCase().startsWith('collection-') &&
                               nameWithoutEncrypted.toLowerCase().endsWith('.collection');

            // For encrypted files, check if they're media files by extension
            const isThought = nameWithoutEncrypted.toLowerCase().startsWith('thought-') &&
                             (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
            const isThoughtThumbnail = nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') &&
                                      (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
            let isMediaFile = isImage || isVideo || isThought || isThoughtThumbnail || isCollection;
            if (isEncrypted && !isCollection) {
              const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
              const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
              const hasThoughtExt = /\.thought$/i.test(nameWithoutEncrypted) ||
                                   (nameWithoutEncrypted.toLowerCase().startsWith('thought-') && nameWithoutEncrypted.toLowerCase().endsWith('.png')) ||
                                   nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
              isMediaFile = hasImageExt || hasVideoExt || hasThoughtExt;
            }

            return (
              <div
                key={file.id}
                className={`flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors ${
                  isBulkDeleteMode ? 'cursor-default' : 'cursor-pointer'
                } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                onClick={(e) => {
                  // Handle checkbox click in bulk delete mode
                  if (isBulkDeleteMode) {
                    const target = e.target as HTMLElement;
                    if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                      toggleFileSelection(file.id);
                      return;
                    }
                    toggleFileSelection(file.id);
                    return;
                  }
                  // Ensure collection metadata is included when opening
                  const fileWithMetadata = {
                    ...file,
                    accountId: file.accountId || account.accountId,
                    fileType: (file as any).fileType || fileMetadataMap.get(file.id)?.fileType,
                    collection: (file as any).collection || fileMetadataMap.get(file.id)?.collection
                  };
                  setViewingFile(fileWithMetadata);
                }}
              >
                {/* Checkbox or order number for collection/bulk delete mode */}
                {(isBulkDeleteMode || isCollectionMode) && (
                  <div className="flex-shrink-0 mr-3" onClick={(e) => e.stopPropagation()}>
                    {isCollectionMode && collectionFileOrder.has(file.id) ? (
                      // Show number badge when selected in collection mode
                      <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                        {collectionFileOrder.get(file.id)}
                      </div>
                    ) : (
                      // Show checkbox when not selected or in bulk delete mode
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                )}
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {isCollection ? (
                    <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center">
                      <Layers className="h-6 w-6 text-blue-400" />
                    </div>
                  ) : isMediaFile ? (
                    <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                      <ThumbnailImage
                        fileId={file.id}
                        accountId={file.accountId || account.accountId}
                        backend={account.provider}
                        fileName={file.name}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        mainFileId={(file as any).mainFileId}
                        isThumbnail={(file as any).isThumbnail}
                      />
                    </div>
                  ) : (
                    <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-white text-sm truncate">
                        {cleanTitle((file as any).displayName || fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || file.name)}
                      </p>
                      {file.isUploading && (
                        <RefreshCw className="h-3 w-3 text-blue-400 animate-spin flex-shrink-0" />
                      )}
                      {file.isPublic && !file.isUploading && (
                        <Globe className="h-3 w-3 text-green-400 flex-shrink-0" aria-label="Public" />
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <p className="text-text-secondary text-xs">
                        {account.accountId || 'google_drive'} • {(parseInt(file.size || '0') / 1024).toFixed(2)} KB
                      </p>
                      {file.isUploading && (
                        <span className="text-blue-400 text-xs">
                          Uploading {file.uploadProgress || 0}%
                        </span>
                      )}
                    </div>
                    {file.isUploading && (
                      <div className="mt-1 h-1 bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${file.uploadProgress || 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {!isBulkDeleteMode && !isCollectionMode && (
                  <div className="flex items-center justify-center space-x-2" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        ref={(el) => {
                          if (el) menuButtonRefs.current.set(file.id, el);
                          else menuButtonRefs.current.delete(file.id);
                        }}
                        data-menu-button={file.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const button = e.currentTarget;
                          const rect = button.getBoundingClientRect();
                          const newState = openMenuFor === file.id ? null : file.id;
                          if (newState) {
                            // Position menu to the left of the button, with top aligned to button top
                            setMenuPosition({
                              top: rect.top, // Align top of menu with top of button
                              left: rect.left - 180 // 180px = w-44 (176px) + 4px spacing
                            });
                          } else {
                            setMenuPosition(null);
                          }
                          setOpenMenuFor(newState);
                        }}
                        style={{
                          width: '28px',
                          height: '28px',
                          padding: 0,
                          margin: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(64, 64, 64, 0.5)',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          color: '#a3a3a3',
                          lineHeight: 0
                        }}
                        className="transition-colors disabled:opacity-50 hover:bg-neutral-700"
                        title="File actions"
                        disabled={isLoading}
                      >
                        <MoreVertical className="h-4 w-4" style={{ margin: 0, padding: 0 }} />
                      </button>
                      {/* Menu will be rendered in portal */}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Collection Mode UI */}
      {isCollectionMode && (
        <div className="mt-4 pt-4 border-t border-neutral-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary text-sm">
              {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsCollectionMode(false);
                setSelectedFiles(new Set());
                setCollectionFileOrder(new Map());
              }}
              className="px-3 py-1.5 text-sm text-white hover:bg-neutral-700 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleCreateCollection(account.accountId)}
              disabled={selectedFiles.size === 0 || isLoading}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Bulk Delete Button */}
      {isBulkDeleteMode && (() => {
        const accountSelectedFiles = accountFiles.filter(f => selectedFiles.has(f.id));
        const selectedCount = accountSelectedFiles.length;

        return (
          <div className="mt-4 pt-4 border-t border-neutral-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedCount === accountFiles.length) {
                    // Deselect all files from this account
                    setSelectedFiles(prev => {
                      const newSet = new Set(prev);
                      accountFiles.forEach(f => newSet.delete(f.id));
                      return newSet;
                    });
                  } else {
                    selectAllFiles(account.accountId);
                  }
                }}
                className="px-3 py-1.5 text-sm text-white hover:bg-neutral-700 rounded transition-colors"
              >
                {selectedCount === accountFiles.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-text-secondary text-sm">
                {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
              </span>
            </div>
            <button
              onClick={() => handleBulkDelete(account.accountId)}
              disabled={selectedCount === 0 || isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedCount})
            </button>
          </div>
        );
      })()}
    </div>
  );
};
