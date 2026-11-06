/**
 * Account header actions and selection footers for the owner file explorer (browser app).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image, Layers, Minus, Plus, RefreshCw, Trash2, Type, Upload } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { pickImageFromNative } from '../../hooks/useNativeFilePicker';

export interface AccountToolbarProps {
  accountId: string;
  isLoading: boolean;
  isBulkDeleteMode: boolean;
  onDisconnect: () => void;
  onRefresh: () => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onNativeMedia: (file: File) => void;
  onStartCollection: () => void;
  onToggleBulkDelete: () => void;
  onOpenTextEditor?: () => void;
  onError: (message: string) => void;
}

const MENU_ITEM = 'w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm';

export const AccountToolbar: React.FC<AccountToolbarProps> = ({
  accountId,
  isLoading,
  isBulkDeleteMode,
  onDisconnect,
  onRefresh,
  onUpload,
  onNativeMedia,
  onStartCollection,
  onToggleBulkDelete,
  onOpenTextEditor,
  onError,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addButtonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuPos(null);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [menuPos]);

  const closeMenu = () => setMenuPos(null);
  const pickNative = async (source: 'camera' | 'photos') => {
    const file = await pickImageFromNative(source);
    if (file) onNativeMedia(file);
    closeMenu();
  };

  return (
    <>
      <button onClick={onDisconnect} className="text-red-400 hover:text-red-300 text-sm flex-shrink-0">
        Disconnect
      </button>
      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
        title="Refresh Files"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      </button>
      <input type="file" ref={inputRef} className="hidden" disabled={isLoading} onChange={onUpload} />
      <div className="relative">
        <button
          ref={addButtonRef}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPos(menuPos ? null : { top: rect.bottom, left: rect.left + rect.width / 2 });
          }}
          disabled={isLoading}
          className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
          title="Add Content"
        >
          <Plus className="h-4 w-4" />
        </button>
        {menuPos && (
          <div
            ref={menuRef}
            data-add-menu={accountId}
            className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px`, transform: 'translateX(-50%)', marginTop: '8px' }}
          >
            <button
              onClick={() => {
                onOpenTextEditor?.();
                closeMenu();
              }}
              className={MENU_ITEM}
            >
              <Type className="h-4 w-4" />
              Pen Mini
            </button>
            {Capacitor.isNativePlatform() && (
              <>
                <button onClick={() => void pickNative('camera')} className={MENU_ITEM}>
                  <Camera className="h-4 w-4" />
                  Take Photo
                </button>
                <button onClick={() => void pickNative('photos')} className={MENU_ITEM}>
                  <Image className="h-4 w-4" />
                  Choose from Library
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (inputRef.current) inputRef.current.click();
                else onError('File input not initialized. Please refresh the page.');
                closeMenu();
              }}
              className={MENU_ITEM}
            >
              <Upload className="h-4 w-4" />
              Add File
            </button>
            <button
              onClick={() => {
                onStartCollection();
                closeMenu();
              }}
              className={MENU_ITEM}
            >
              <Layers className="h-4 w-4" />
              Add Collection
            </button>
          </div>
        )}
      </div>
      <button
        onClick={onToggleBulkDelete}
        disabled={isLoading}
        className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
        title={isBulkDeleteMode ? 'Cancel Bulk Delete' : 'Bulk Delete'}
      >
        <Minus className="h-4 w-4" />
      </button>
    </>
  );
};

export function CollectionModeFooter({
  selectedCount,
  isLoading,
  onCancel,
  onNext,
}: {
  selectedCount: number;
  isLoading: boolean;
  onCancel: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 pt-4 border-t border-neutral-700 flex items-center justify-between">
      <span className="text-text-secondary text-sm">
        {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-white hover:bg-neutral-700 rounded transition-colors">
          Cancel
        </button>
        <button
          onClick={onNext}
          disabled={selectedCount === 0 || isLoading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function BulkDeleteFooter({
  selectedCount,
  totalCount,
  isLoading,
  onToggleAll,
  onDelete,
}: {
  selectedCount: number;
  totalCount: number;
  isLoading: boolean;
  onToggleAll: () => void;
  onDelete: () => void;
}) {
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  return (
    <div className="mt-4 pt-4 border-t border-neutral-700 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button onClick={onToggleAll} className="px-3 py-1.5 text-sm text-white hover:bg-neutral-700 rounded transition-colors">
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-text-secondary text-sm">
          {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
        </span>
      </div>
      <button
        onClick={onDelete}
        disabled={selectedCount === 0 || isLoading}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <Trash2 className="h-4 w-4" />
        Delete Selected ({selectedCount})
      </button>
    </div>
  );
}
