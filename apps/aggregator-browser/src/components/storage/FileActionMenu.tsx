/**
 * Row action items for the owner file explorer (browser app).
 * The explorer owns the popover; this renders its contents.
 */

import React from 'react';
import { Download, X, Edit, Share2, Star } from 'lucide-react';
import { OwnerFileMenuItem, type OwnerFileRow } from '@par-noir/owner-files';

export interface FileActionMenuProps {
  row: OwnerFileRow;
  isTopPost: boolean;
  isLoading: boolean;
  close: () => void;
  onEditMetadata: (row: OwnerFileRow) => void;
  onDownload: (row: OwnerFileRow) => void;
  onShareSettings: (row: OwnerFileRow) => void;
  onSetTopPost: (row: OwnerFileRow) => void;
  onDelete: (row: OwnerFileRow) => void;
}

export const FileActionMenu: React.FC<FileActionMenuProps> = ({
  row,
  isTopPost,
  isLoading,
  close,
  onEditMetadata,
  onDownload,
  onShareSettings,
  onSetTopPost,
  onDelete,
}) => {
  const run = (fn: (row: OwnerFileRow) => void) => () => {
    close();
    fn(row);
  };
  return (
    <>
      <OwnerFileMenuItem
        icon={<Edit className="h-4 w-4" />}
        label="Edit metadata"
        onClick={run(onEditMetadata)}
        disabled={isLoading}
      />
      {row.origin !== 'catalog' && (
        <OwnerFileMenuItem
          icon={<Download className="h-4 w-4" />}
          label="Download"
          onClick={run(onDownload)}
          disabled={isLoading}
        />
      )}
      <OwnerFileMenuItem
        icon={<Share2 className="h-4 w-4" />}
        label="Share settings"
        onClick={run(onShareSettings)}
        disabled={isLoading}
      />
      <OwnerFileMenuItem
        icon={<Star className={`h-4 w-4 ${isTopPost ? 'fill-yellow-400 text-yellow-400' : ''}`} />}
        label={isTopPost ? 'Unset top post' : 'Set as top post'}
        onClick={run(onSetTopPost)}
        disabled={isLoading}
      />
      <OwnerFileMenuItem
        icon={<X className="h-4 w-4" />}
        label="Delete"
        onClick={run(onDelete)}
        danger
        disabled={isLoading}
      />
    </>
  );
};
