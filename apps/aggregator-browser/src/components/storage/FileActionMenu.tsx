/**
 * Portal-rendered file action menu shared by the grid and list views
 * of FileStorageAggregator (browser app).
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { Download, X, Edit, Share2, Star } from 'lucide-react';
import type { DriveFile } from './storageTypes';

export interface FileActionMenuProps {
  openMenuFor: string | null;
  menuPosition: { top: number; left: number } | null;
  filesByAccount: Map<string, DriveFile[]>;
  fileMetadataMap: Map<string, any>;
  actionMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  isLoading: boolean;
  setOpenMenuFor: React.Dispatch<React.SetStateAction<string | null>>;
  setMenuPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>;
  handleEditMetadata: (file: DriveFile) => Promise<void>;
  handleDownload: (file: DriveFile, accountId: string) => Promise<void>;
  handleShareSettings: (file: DriveFile, accountId: string) => Promise<void>;
  handleSetTopPost: (file: DriveFile, accountId: string) => Promise<void>;
  handleDelete: (file: DriveFile, accountId: string) => void;
}

export const FileActionMenu: React.FC<FileActionMenuProps> = ({
  openMenuFor,
  menuPosition,
  filesByAccount,
  fileMetadataMap,
  actionMenuRef,
  isLoading,
  setOpenMenuFor,
  setMenuPosition,
  handleEditMetadata,
  handleDownload,
  handleShareSettings,
  handleSetTopPost,
  handleDelete,
}) => {
  if (!openMenuFor || !menuPosition) return null;

  // Find the file and account for the open menu
  let menuFile: DriveFile | null = null;
  let menuAccountId: string | null = null;

  for (const [accountId, files] of filesByAccount.entries()) {
    const file = files.find(f => f.id === openMenuFor);
    if (file) {
      menuFile = file;
      menuAccountId = accountId;
      break;
    }
  }

  if (!menuFile || !menuAccountId) return null;

  const menuContent = (
    <div
      ref={actionMenuRef}
      className="fixed w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[100] py-1 menu-container"
      style={{
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuFor(null);
          setMenuPosition(null);
          handleEditMetadata(menuFile!);
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
          setMenuPosition(null);
          handleDownload(menuFile!, menuAccountId!);
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
          setMenuPosition(null);
          handleShareSettings(menuFile!, menuAccountId!);
        }}
        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
        disabled={isLoading}
      >
        <Share2 className="h-4 w-4" />
        <span>Share settings</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuFor(null);
          setMenuPosition(null);
          handleSetTopPost(menuFile!, menuAccountId!);
        }}
        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-yellow-400 hover:bg-neutral-800 transition-colors"
        disabled={isLoading}
      >
        <Star className={`h-4 w-4 ${fileMetadataMap.get(menuFile!.id)?.isTopPost ? 'fill-yellow-400 text-yellow-400' : ''}`} />
        <span>{fileMetadataMap.get(menuFile!.id)?.isTopPost ? 'Unset top post' : 'Set as top post'}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuFor(null);
          setMenuPosition(null);
          handleDelete(menuFile!, menuAccountId!);
        }}
        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors"
        disabled={isLoading}
      >
        <X className="h-4 w-4" />
        <span>Delete</span>
      </button>
    </div>
  );

  return createPortal(menuContent, document.body);
};
