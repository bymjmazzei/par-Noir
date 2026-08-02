import React from 'react';
import {
  Download, File, RefreshCw, Lock, Globe, Edit, Eye, Grid, List, Plus,
  MoreVertical, Share2, Trash2, Minus, Flag, Cloud,
} from 'lucide-react';
import type { AggregatedFile, PublicMetadata } from '../../types/aggregator';
import type { DriveSetupProgress, DriveAccountState } from './FileStorageAggregatorTypes';
import { GOOGLE_DRIVE_ICON_URL } from './FileStorageAggregatorTypes';
import { DriveLayoutSetupProgress } from './DriveLayoutSetupProgress';
import { isImageFile, isVideoFile } from './FileStorageAggregatorHelpers';

export type PortableCloudAccount = {
  provider: string;
  accountId: string;
  displayName?: string;
  isSocialCloud?: boolean;
};

export interface DriveFilesListSectionProps {
  driveAccounts: DriveAccountState[];
  userEmails: Map<string, string>;
  filesByBackend: Map<string, AggregatedFile[]>;
  storageQuotas: Map<string, { usedBytes: number; totalBytes: number } | any>;
  connectedBackends: Set<string>;
  files: AggregatedFile[];
  fileMetadataMap: Map<string, PublicMetadata>;
  filePreviewUrls: Map<string, string>;
  loadingPreviews: Set<string>;
  selectedFiles: Set<string>;
  isBulkDeleteMode: boolean;
  viewMode: 'list' | 'grid';
  openMenuFor: string | null;
  isLoading: boolean;
  driveReadBlocked: boolean;
  driveUploadBlocked: boolean;
  deviceGateBlockedMessage?: string;
  showDriveSetupProgress: boolean;
  driveSetupProgress: DriveSetupProgress | null;
  authenticatedUserId?: string | null;
  portableCloudAccounts: PortableCloudAccount[];
  moveDestKey: string;
  fileInputRefs: React.MutableRefObject<Map<string, HTMLInputElement | null>>;
  actionMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  setActiveBackendId: (id: string | null) => void;
  setError: (msg: string | null) => void;
  setIsBulkDeleteMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  setViewMode: React.Dispatch<React.SetStateAction<'list' | 'grid'>>;
  setOpenMenuFor: React.Dispatch<React.SetStateAction<string | null>>;
  setReportingFile: (file: AggregatedFile | null) => void;
  setShowReportModal: (v: boolean) => void;
  setMoveDestKey: (key: string) => void;
  loadFiles: () => void;
  handleDisconnect: (backendId: string) => void;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleFileSelection: (fileId: string) => void;
  handleViewFile: (file: AggregatedFile) => void;
  loadFilePreview: (file: AggregatedFile) => void;
  handleEditMetadata: (file: AggregatedFile) => void;
  handleDownload: (file: AggregatedFile) => void;
  openShareSettings: (file: AggregatedFile) => void;
  handleDelete: (file: AggregatedFile) => void;
  selectAllFiles: (backendId: string) => void;
  handleMoveToCloud: () => void;
  handleBulkDelete: (backendId: string) => void;
}

export function DriveFilesListSection(props: DriveFilesListSectionProps) {
  const {
    driveAccounts,
    userEmails,
    filesByBackend,
    storageQuotas,
    connectedBackends,
    files,
    fileMetadataMap,
    filePreviewUrls,
    loadingPreviews,
    selectedFiles,
    isBulkDeleteMode,
    viewMode,
    openMenuFor,
    isLoading,
    driveReadBlocked,
    driveUploadBlocked,
    deviceGateBlockedMessage,
    showDriveSetupProgress,
    driveSetupProgress,
    authenticatedUserId,
    portableCloudAccounts,
    moveDestKey,
    fileInputRefs,
    actionMenuRef,
    setActiveBackendId,
    setError,
    setIsBulkDeleteMode,
    setSelectedFiles,
    setViewMode,
    setOpenMenuFor,
    setReportingFile,
    setShowReportModal,
    setMoveDestKey,
    loadFiles,
    handleDisconnect,
    handleUpload,
    toggleFileSelection,
    handleViewFile,
    loadFilePreview,
    handleEditMetadata,
    handleDownload,
    openShareSettings,
    handleDelete,
    selectAllFiles,
    handleMoveToCloud,
    handleBulkDelete,
  } = props;

  // Compatibility aliases used by extracted JSX
  const authenticatedUser = authenticatedUserId ? { id: authenticatedUserId } : null;
  const deviceGate = deviceGateBlockedMessage
    ? { blockedMessage: deviceGateBlockedMessage }
    : undefined;

  return (
      <div className="space-y-6">
        {driveAccounts.map((account, index) => {
          const backendId = account.backendId;
          // SECURITY: email removed from DriveAccountState - use userEmails map instead
          const email = userEmails.get(backendId) || `Drive ${index + 1}`;
          const accountFiles = filesByBackend.get(backendId) || [];
          const quota = storageQuotas.get(backendId);
          const percentUsed = quota && quota.totalBytes
            ? Math.min(100, Math.round((quota.usedBytes / quota.totalBytes) * 100))
            : null;

          return (
            <div key={backendId} className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <img src={GOOGLE_DRIVE_ICON_URL} alt="Google Drive" className="h-5 w-5" />
                  <span className="text-white font-semibold truncate max-w-xs">
                    {email}
                  </span>
                  {connectedBackends.has(backendId) && (
                    <button
                      onClick={() => handleDisconnect(backendId)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setActiveBackendId(backendId);
                      loadFiles();
                    }}
                    disabled={isLoading || driveReadBlocked}
                    className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                    title={driveReadBlocked ? deviceGate?.blockedMessage : 'Refresh Files'}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <input
                    type="file"
                    data-backend-id={backendId}
                    className="hidden"
                    disabled={isLoading || driveUploadBlocked}
                    onChange={handleUpload}
                    ref={(el) => {
                      if (el) {
                        fileInputRefs.current.set(backendId, el);
                      } else {
                        fileInputRefs.current.delete(backendId);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (driveUploadBlocked) {
                        setError(deviceGate?.blockedMessage ?? null);
                        return;
                      }
                      setActiveBackendId(backendId);
                      const input = fileInputRefs.current.get(backendId);
                      input?.click();
                    }}
                    disabled={isLoading || driveUploadBlocked}
                    className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                    title={driveUploadBlocked ? deviceGate?.blockedMessage : 'Upload File'}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsBulkDeleteMode(!isBulkDeleteMode);
                      if (isBulkDeleteMode) {
                        setSelectedFiles(new Set());
                      }
                    }}
                    disabled={isLoading}
                    className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                    title={isBulkDeleteMode ? "Cancel Bulk Delete" : "Bulk Delete"}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded transition-colors ${
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
                    className={`p-2 rounded transition-colors ${
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

              {quota && (
                <div className="flex items-center justify-between text-xs text-text-secondary bg-neutral-900 rounded-lg px-3 py-2 mb-4">
                  <span>Used {(quota.usedBytes / (1024 * 1024)).toFixed(1)} MB of {(quota.totalBytes / (1024 * 1024)).toFixed(1)} MB</span>
                  <span>{percentUsed ?? 0}% full</span>
                </div>
              )}

              {showDriveSetupProgress && driveSetupProgress ? (
                <DriveLayoutSetupProgress progress={driveSetupProgress} />
              ) : isLoading && files.length === 0 ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-8 w-8 text-text-secondary animate-spin mx-auto mb-4" />
                  <p className="text-text-secondary">Loading files...</p>
                </div>
              ) : accountFiles.length === 0 ? (
                <div className="text-center py-12">
                  <File className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                  <p className="text-text-secondary">No files found for this account</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {accountFiles.map((file) => {
                    const metadata = fileMetadataMap.get(file.id);
                    const previewUrl = filePreviewUrls.get(file.id);
                    const isLoadingPreview = loadingPreviews.has(file.id);
                    const mimeType = file.mimeType || '';
                    const fileName = file.originalName || file.name || '';
                    const isImage = isImageFile(mimeType, fileName);
                    const isVideo = isVideoFile(mimeType, fileName);

                    return (
                      <div
                        key={`${file.backend}-${file.backendFileId}`}
                        className={`bg-neutral-900 rounded-lg overflow-hidden hover:bg-neutral-800 transition-colors group ${
                          isBulkDeleteMode ? 'cursor-default' : 'cursor-pointer'
                        } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                        onClick={(e) => {
                          if (isBulkDeleteMode) {
                            const target = e.target as HTMLElement;
                            if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                              toggleFileSelection(file.id);
                              return;
                            }
                            toggleFileSelection(file.id);
                            return;
                          }
                          handleViewFile(file);
                        }}
                      >
                        {/* Checkbox for bulk delete mode */}
                        {isBulkDeleteMode && (
                          <div className="absolute top-2 left-2 z-30" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(file.id)}
                              onChange={() => toggleFileSelection(file.id)}
                              className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}
                        <div
                          className="relative aspect-square bg-neutral-700/50 overflow-hidden"
                          onMouseEnter={() => {
                            if ((isImage || isVideo) && !previewUrl && !isLoadingPreview) {
                              loadFilePreview(file);
                            }
                          }}
                        >
                          {previewUrl && isImage ? (
                            <img
                              src={previewUrl}
                              alt={file.encrypted ? file.originalName : file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : previewUrl && isVideo ? (
                            <video
                              src={previewUrl}
                              className="w-full h-full object-cover"
                              muted
                              loop
                            />
                          ) : isLoadingPreview ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <RefreshCw className="h-6 w-6 text-text-secondary animate-spin" />
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Lock className="h-8 w-8 text-blue-400" />
                            </div>
                          )}
                          {metadata?.isPublic && (
                            <div className="absolute top-2 right-2 bg-green-500/80 rounded-full p-1">
                              <Globe className="h-3 w-3 text-white" />
                            </div>
                          )}
                          {(isImage || isVideo) && (
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Eye className="h-6 w-6 text-white" />
                            </div>
                          )}
                        </div>

                        <div className="p-3">
                          <p className="text-white text-xs truncate mb-1" title={file.encrypted ? file.originalName : file.name}>
                            {file.encrypted ? file.originalName : file.name}
                          </p>
                          <p className="text-text-secondary text-xs">
                            {(parseInt(file.size?.toString() || '0') / 1024).toFixed(1)} KB
                          </p>

                          {!isBulkDeleteMode && (
                            <div className="flex items-center justify-end mt-2 pt-2 border-t border-neutral-700">
                              <div className="relative">
                              <button
                                ref={(btn) => {
                                  if (btn && openMenuFor === file.backendFileId) {
                                    // Store button ref for menu positioning
                                    (btn as any).__menuButton = true;
                                  }
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                    setOpenMenuFor((prev) =>
                                      prev === file.backendFileId ? null : file.backendFileId
                                    );
                                  }}
                                  className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded"
                                  title="File actions"
                                  disabled={isLoading}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              {openMenuFor === file.backendFileId && (
                                <div
                                  ref={(node) => {
                                    if (node) {
                                      actionMenuRef.current = node;
                                      // Position menu directly over the tile container
                                      // Use requestAnimationFrame to ensure node is rendered before calculating position
                                      requestAnimationFrame(() => {
                                        // Find the tile container (the parent div with the grid item)
                                        const tileContainer = node.closest('[class*="bg-neutral-800"]') as HTMLElement;
                                        if (tileContainer && node) {
                                          const tileRect = tileContainer.getBoundingClientRect();
                                          const menuWidth = 176; // w-44 = 11rem = 176px
                                          
                                          node.style.position = 'fixed';
                                          
                                          // Position menu OVER the tile: center it horizontally on the tile
                                          // left = tile.left + (tile.width / 2) - (menu.width / 2)
                                          const leftPosition = tileRect.left + (tileRect.width / 2) - (menuWidth / 2);
                                          
                                          // Ensure menu stays within viewport
                                          const minLeft = 8; // Minimum 8px from left edge
                                          const maxLeft = window.innerWidth - menuWidth - 8; // Maximum to keep menu on screen
                                          node.style.left = `${Math.max(minLeft, Math.min(leftPosition, maxLeft))}px`;
                                          
                                          // Position menu OVER the tile: center it vertically on the tile
                                          // top = tile.top + (tile.height / 2) - (menu.height / 2)
                                          const menuHeight = node.offsetHeight || 200; // fallback estimate
                                          const topPosition = tileRect.top + (tileRect.height / 2) - (menuHeight / 2);
                                          
                                          // Ensure menu stays within viewport
                                          const minTop = 8; // Minimum 8px from top edge
                                          const maxTop = window.innerHeight - menuHeight - 8; // Maximum to keep menu on screen
                                          node.style.top = `${Math.max(minTop, Math.min(topPosition, maxTop))}px`;
                                          
                                          node.style.right = 'auto';
                                          node.style.bottom = 'auto';
                                        }
                                      });
                                    }
                                  }}
                                  className="w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[100] py-1"
                                >
                                  {/* Report option (all users) - only if not already NSFW/X-rated */}
                                  {(() => {
                                    const currentRating = metadata?.contentRating;
                                    const canReportNSFW = currentRating !== 'nsfw' && currentRating !== 'x-rated';
                                    
                                    if (canReportNSFW) {
                                      return (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuFor(null);
                                            actionMenuRef.current = null;
                                            setReportingFile(file);
                                            setShowReportModal(true);
                                          }}
                                          className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                          disabled={isLoading}
                                        >
                                          <Flag className="h-4 w-4" />
                                          <span>Report as NSFW</span>
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}
                                  
                                  {/* Owner-only options */}
                                  {(() => {
                                    // Check if user is owner
                                    const isOwner = authenticatedUser?.id && (
                                      metadata?.owner?.did === authenticatedUser.id ||
                                      metadata?.owner?.identifier === authenticatedUser.id ||
                                      file.backendFileId?.includes(authenticatedUser.id)
                                    );

                                    if (isOwner) {
                                      return (
                                        <>
                                          {(metadata?.contentRating !== 'nsfw' && metadata?.contentRating !== 'x-rated') && (
                                            <div className="border-t border-neutral-700 my-1" />
                                          )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuFor(null);
                                      actionMenuRef.current = null;
                                handleEditMetadata(file);
                              }}
                                    className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                              disabled={isLoading}
                            >
                                    <Edit className="h-4 w-4" />
                                    <span>Edit metadata</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                      setOpenMenuFor(null);
                                      actionMenuRef.current = null;
                                      handleDownload(file);
                              }}
                                    className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                              disabled={isLoading}
                                  >
                                    <Download className="h-4 w-4" />
                                    <span>Download</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                    className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                    disabled={isLoading}
                                    hidden
                                  >
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                      setOpenMenuFor(null);
                                      actionMenuRef.current = null;
                                      openShareSettings(file);
                              }}
                                    className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                              disabled={isLoading}
                            >
                                    <Share2 className="h-4 w-4" />
                                    <span>Share settings</span>
                            </button>
                                          <div className="border-t border-neutral-700 my-1" />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuFor(null);
                                      actionMenuRef.current = null;
                                      handleDelete(file);
                                    }}
                                    className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-950 transition-colors"
                                    disabled={isLoading}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete</span>
                                  </button>
                                        </>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {accountFiles.map((file) => {
                    const metadata = fileMetadataMap.get(file.id);
                    const previewUrl = filePreviewUrls.get(file.id);
                    const isLoadingPreview = loadingPreviews.has(file.id);
                    const mimeType = file.mimeType || '';
                    const fileName = file.originalName || file.name || '';
                    const isImage = isImageFile(mimeType, fileName);
                    const isVideo = isVideoFile(mimeType, fileName);

                    return (
                      <div
                        key={`${file.backend}-${file.backendFileId}`}
                        className={`flex items-center justify-between p-3 bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors ${
                          isBulkDeleteMode ? 'cursor-default' : 'cursor-pointer'
                        } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                        onClick={(e) => {
                          if (isBulkDeleteMode) {
                            const target = e.target as HTMLElement;
                            if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                              toggleFileSelection(file.id);
                              return;
                            }
                            toggleFileSelection(file.id);
                            return;
                          }
                          handleViewFile(file);
                        }}
                      >
                        {/* Checkbox for bulk delete mode */}
                        {isBulkDeleteMode && (
                          <div className="flex-shrink-0 mr-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(file.id)}
                              onChange={() => toggleFileSelection(file.id)}
                              className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          {previewUrl && isImage ? (
                            <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                              <img
                                src={previewUrl}
                                alt={file.encrypted ? file.originalName : file.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : previewUrl && isVideo ? (
                            <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                              <video
                                src={previewUrl}
                                className="w-full h-full object-cover"
                                muted
                              />
                            </div>
                          ) : isImage || isVideo ? (
                            <div
                              className="w-12 h-12 flex-shrink-0 rounded bg-neutral-700 flex items-center justify-center cursor-pointer"
                              onMouseEnter={() => {
                                if (!previewUrl && !isLoadingPreview) {
                                  loadFilePreview(file);
                                }
                              }}
                            >
                              {isLoadingPreview ? (
                                <RefreshCw className="h-5 w-5 text-text-secondary animate-spin" />
                              ) : (
                                <Lock className="h-5 w-5 text-blue-400" />
                              )}
                            </div>
                          ) : (
                            <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <p className="text-white text-sm truncate">
                                {file.encrypted ? file.originalName : file.name}
                              </p>
                              {metadata?.isPublic && (
                                <Globe className="h-3 w-3 text-green-400 flex-shrink-0" aria-label="Public" />
                              )}
                            </div>
                            <p className="text-text-secondary text-xs">
                              {file.backend} • {(parseInt(file.size?.toString() || '0') / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        {!isBulkDeleteMode && (
                          <div className="flex items-center justify-end space-x-2">
                            <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                  setOpenMenuFor((prev) =>
                                    prev === file.backendFileId ? null : file.backendFileId
                                  );
                              }}
                              className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 bg-neutral-800 hover:bg-neutral-700 text-text-secondary hover:text-text-primary"
                                title="File actions"
                                disabled={isLoading}
                            >
                                <MoreVertical className="h-4 w-4" />
                            </button>
                            {openMenuFor === file.backendFileId && (
                              <div
                                ref={(node) => {
                                  if (node) {
                                    actionMenuRef.current = node;
                                  }
                                }}
                                className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[100] py-1"
                              >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                                    setOpenMenuFor(null);
                                    actionMenuRef.current = null;
                                    handleEditMetadata(file);
                            }}
                                  className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                            disabled={isLoading}
                                >
                                  <Edit className="h-4 w-4" />
                                  <span>Edit metadata</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                                    setOpenMenuFor(null);
                                    actionMenuRef.current = null;
                              handleDownload(file);
                            }}
                                  className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                            disabled={isLoading}
                          >
                            <Download className="h-4 w-4" />
                                  <span>Download</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuFor(null);
                                    actionMenuRef.current = null;
                                    openShareSettings(file);
                                  }}
                                  className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                  disabled={isLoading}
                                >
                                  <Share2 className="h-4 w-4" />
                                  <span>Share settings</span>
                                </button>
                                <div className="border-t border-neutral-700 my-1"></div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuFor(null);
                                    actionMenuRef.current = null;
                                    handleDelete(file);
                                  }}
                                  className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-950 transition-colors"
                                  disabled={isLoading}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </button>
                          </div>
                        )}
                      </div>
                    </div>
                        )}
                  </div>
                );
              })}
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
                        // Deselect all files from this backend
                        setSelectedFiles(prev => {
                          const newSet = new Set(prev);
                          accountFiles.forEach(f => newSet.delete(f.id));
                          return newSet;
                        });
                      } else {
                        selectAllFiles(backendId);
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
                <div className="flex items-center gap-2">
                  <select
                    value={moveDestKey}
                    onChange={(e) => setMoveDestKey(e.target.value)}
                    className="text-sm bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-white"
                    disabled={selectedCount === 0 || isLoading}
                  >
                    <option value="">Move to cloud…</option>
                    {portableCloudAccounts.map((a) => (
                      <option
                        key={`${a.provider}|||${a.accountId}`}
                        value={`${a.provider}|||${a.accountId}`}
                      >
                        {a.displayName || a.provider}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleMoveToCloud}
                    disabled={selectedCount === 0 || !moveDestKey || isLoading}
                    className="px-3 py-2 bg-violet-600 text-white rounded hover:bg-violet-500 text-sm disabled:opacity-50"
                  >
                    Move
                  </button>
                  <button
                    onClick={() => handleBulkDelete(backendId)}
                    disabled={selectedCount === 0 || isLoading}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete ({selectedCount})
                  </button>
                </div>
              </div>
            );
          })()}
            </div>
          );
        })}
        {portableCloudAccounts.map((acct) => {
          const backendId = `${acct.provider}::${acct.accountId}`;
          const accountFiles = filesByBackend.get(backendId) || [];
          return (
            <div key={backendId} className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Cloud className="h-5 w-5 text-text-secondary" />
                  <span className="text-white font-semibold truncate max-w-xs">
                    {acct.displayName || acct.provider}
                  </span>
                  {acct.isSocialCloud && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">Social cloud</span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setActiveBackendId(backendId);
                      loadFiles();
                    }}
                    disabled={isLoading || driveReadBlocked}
                    className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                    title="Refresh Files"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <input
                    type="file"
                    data-backend-id={backendId}
                    className="hidden"
                    disabled={isLoading || driveUploadBlocked}
                    onChange={handleUpload}
                    ref={(el) => {
                      if (el) fileInputRefs.current.set(backendId, el);
                      else fileInputRefs.current.delete(backendId);
                    }}
                  />
                  <button
                    onClick={() => {
                      if (driveUploadBlocked) {
                        setError(deviceGate?.blockedMessage ?? null);
                        return;
                      }
                      setActiveBackendId(backendId);
                      fileInputRefs.current.get(backendId)?.click();
                    }}
                    disabled={isLoading || driveUploadBlocked}
                    className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                    title="Upload to this cloud"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-text-secondary text-sm">
                {accountFiles.length === 0
                  ? 'No files indexed for this backend yet'
                  : `${accountFiles.length} file(s) — upload destination: ${acct.provider}`}
              </p>
            </div>
          );
        })}
      </div>
  );
}
