import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, File, Globe, Grid, List, MoreVertical, RefreshCw } from 'lucide-react';
import type { OwnerAccount, OwnerFileRow } from '../model';
import type { OwnerFilesTransport } from '../transport';
import { OwnerFileThumb } from './OwnerFileThumb';
import { OwnerFileViewer } from './OwnerFileViewer';

export type OwnerExplorerViewMode = 'grid' | 'list';

/** Host theme variables (id-dashboard light/dark); fallbacks keep dark-only hosts unchanged. */
const TEXT_PRIMARY = 'text-[color:var(--text-primary,#fff)]';
const TEXT_MUTED = 'text-[color:var(--text-secondary,#a3a3a3)]';
const HOVER_TEXT_PRIMARY = 'hover:text-[color:var(--text-primary,#fff)]';
const HOVER_SURFACE = 'hover:bg-[color:var(--hover,#262626)]';
const ROW_SURFACE = `bg-[color:var(--modal-bg,rgb(38_38_38/0.5))] ${HOVER_SURFACE} border border-[color:var(--border,transparent)]`;
const THUMB_SURFACE = 'bg-[color:var(--hover,rgb(64_64_64/0.5))]';

export interface OwnerExplorerSection {
  account: OwnerAccount;
  rows: OwnerFileRow[];
  icon?: React.ReactNode;
  /** Account toolbar slot (Disconnect, add menu, refresh, bulk mode). */
  headerActions?: React.ReactNode;
  /** Between header and files (quota, notices). */
  banner?: React.ReactNode;
  /** Replaces the file list (e.g. layout setup progress). */
  body?: React.ReactNode;
  /** Under the files (bulk delete / collection footers). */
  footer?: React.ReactNode;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
}

export interface OwnerExplorerSelection {
  active: boolean;
  selectedIds: Set<string>;
  /** Collection ordering badges (1-based). */
  order?: Map<string, number>;
  onToggle: (row: OwnerFileRow) => void;
}

export interface OwnerFileExplorerProps {
  transport: OwnerFilesTransport;
  sections: OwnerExplorerSection[];
  viewMode: OwnerExplorerViewMode;
  onViewModeChange: (mode: OwnerExplorerViewMode) => void;
  selection?: OwnerExplorerSelection;
  /** Row action menu items. `close` dismisses the menu. */
  renderRowMenu?: (row: OwnerFileRow, close: () => void) => React.ReactNode;
  /** Override row open (default: built-in decrypted viewer). */
  onOpenRow?: (row: OwnerFileRow) => void;
  renderViewerActions?: (row: OwnerFileRow, close: () => void) => React.ReactNode;
  onDownload?: (row: OwnerFileRow, blob?: Blob) => void;
  /** Controlled viewer row (apps that open rows from elsewhere). */
  viewingRow?: OwnerFileRow | null;
  onViewingRowChange?: (row: OwnerFileRow | null) => void;
}

export function OwnerFileMenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors disabled:opacity-50 ${HOVER_SURFACE} ${
        danger ? 'text-red-500 hover:text-red-600' : `${TEXT_MUTED} ${HOVER_TEXT_PRIMARY}`
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MenuState {
  row: OwnerFileRow;
  top: number;
  left: number;
}

const MENU_WIDTH = 176;

function RowMenuPortal({
  menu,
  onClose,
  children
}: {
  menu: MenuState;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-owner-file-menu]')) return;
      if (ref.current && !ref.current.contains(target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      className="fixed w-44 bg-[color:var(--modal-bg,#171717)] border border-[color:var(--border,#404040)] rounded-lg shadow-xl z-[100] py-1"
      style={{ top: menu.top, left: menu.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export function OwnerFileExplorer({
  transport,
  sections,
  viewMode,
  onViewModeChange,
  selection,
  renderRowMenu,
  onOpenRow,
  renderViewerActions,
  onDownload,
  viewingRow,
  onViewingRowChange
}: OwnerFileExplorerProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [internalViewing, setInternalViewing] = useState<OwnerFileRow | null>(null);
  const controlled = viewingRow !== undefined;
  const viewing = controlled ? viewingRow : internalViewing;
  const setViewing = useCallback(
    (row: OwnerFileRow | null) => {
      if (!controlled) setInternalViewing(row);
      onViewingRowChange?.(row);
    },
    [controlled, onViewingRowChange]
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeViewer = useCallback(() => setViewing(null), [setViewing]);
  const selecting = Boolean(selection?.active);

  const openRow = (row: OwnerFileRow) => {
    if (selecting) {
      selection!.onToggle(row);
      return;
    }
    if (row.pending) return;
    if (onOpenRow) onOpenRow(row);
    else setViewing(row);
  };

  const openMenu = (row: OwnerFileRow, button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setMenu((prev) => (prev?.row.key === row.key ? null : { row, top: rect.bottom + 6, left }));
  };

  const selectionBadge = (row: OwnerFileRow, className: string) => {
    if (!selecting) return null;
    const ordered = selection!.order?.get(row.id);
    return (
      <div className={className} onClick={(e) => e.stopPropagation()}>
        {ordered ? (
          <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
            {ordered}
          </div>
        ) : (
          <input
            type="checkbox"
            checked={selection!.selectedIds.has(row.id)}
            onChange={() => selection!.onToggle(row)}
            className="w-5 h-5 rounded border-[color:var(--input-border,#525252)] bg-[color:var(--input-bg,#262626)] text-blue-600"
          />
        )}
      </div>
    );
  };

  const menuButton = (row: OwnerFileRow, className: string) =>
    renderRowMenu && !selecting && !row.pending ? (
      <button
        type="button"
        data-owner-file-menu={row.key}
        onClick={(e) => {
          e.stopPropagation();
          openMenu(row, e.currentTarget);
        }}
        className={className}
        title="File actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    ) : null;

  const renderGrid = (rows: OwnerFileRow[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {rows.map((row) => {
        const selected = selection?.selectedIds.has(row.id);
        return (
          <div
            key={row.key}
            data-owner-file={row.key}
            className={`relative ${ROW_SURFACE} rounded-lg overflow-hidden transition-colors group ${
              selecting ? 'cursor-default' : 'cursor-pointer'
            } ${selected ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => openRow(row)}
          >
            {selectionBadge(row, 'absolute top-2 left-2 z-30')}
            <div className={`relative aspect-square ${THUMB_SURFACE} overflow-hidden`}>
              <OwnerFileThumb transport={transport} row={row} />
              {row.pending && (
                <>
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                    <div className="text-center">
                      <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-2" />
                      <div className="text-white text-xs font-semibold">{row.pending.progress}%</div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700 z-30">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${row.pending.progress}%` }} />
                  </div>
                </>
              )}
              {row.visibility === 'public' && !row.pending && (
                <div className="absolute bottom-2 left-2 bg-green-500/80 rounded-full p-1 z-10" title="Public">
                  <Globe className="h-3 w-3 text-white" />
                </div>
              )}
              <div className="absolute top-2 right-2 z-20">
                {menuButton(row, 'bg-neutral-900/80 hover:bg-neutral-800/90 rounded-full p-1.5 text-white')}
              </div>
              {!selecting && !row.pending && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                  <Eye className="h-6 w-6 text-white" />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className={`${TEXT_PRIMARY} text-xs truncate mb-1`} title={row.displayName}>
                {row.displayName}
              </p>
              <p className={`${TEXT_MUTED} text-xs`}>{formatSize(row.size) || '\u00a0'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderList = (rows: OwnerFileRow[]) => (
    <div className="space-y-2">
      {rows.map((row) => {
        const selected = selection?.selectedIds.has(row.id);
        return (
          <div
            key={row.key}
            data-owner-file={row.key}
            className={`flex items-center gap-3 p-3 ${ROW_SURFACE} rounded-lg transition-colors ${
              selecting ? 'cursor-default' : 'cursor-pointer'
            } ${selected ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => openRow(row)}
          >
            {selectionBadge(row, 'flex-shrink-0')}
            <div className={`w-12 h-12 flex-shrink-0 rounded overflow-hidden ${THUMB_SURFACE}`}>
              <OwnerFileThumb transport={transport} row={row} compact />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`${TEXT_PRIMARY} text-sm truncate`}>{row.displayName}</p>
                {row.pending && <RefreshCw className="h-3 w-3 text-blue-500 animate-spin flex-shrink-0" />}
                {row.visibility === 'public' && !row.pending && (
                  <Globe className="h-3 w-3 text-green-500 flex-shrink-0" aria-label="Public" />
                )}
              </div>
              <p className={`${TEXT_MUTED} text-xs`}>
                {row.pending ? `Uploading ${row.pending.progress}%` : formatSize(row.size)}
              </p>
            </div>
            {menuButton(row, `p-1.5 rounded-lg ${THUMB_SURFACE} ${HOVER_SURFACE} ${TEXT_MUTED} ${HOVER_TEXT_PRIMARY}`)}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div
          key={section.account.accountKey}
          data-owner-account={section.account.accountKey}
          className="bg-[color:var(--secondary,rgb(23_23_23/0.6))] border border-[color:var(--border,#404040)] rounded-xl p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {section.icon}
              <span className={`${TEXT_PRIMARY} font-semibold truncate`}>{section.account.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
              {section.headerActions}
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : `${TEXT_MUTED} ${HOVER_TEXT_PRIMARY}`
                }`}
                title="List View"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : `${TEXT_MUTED} ${HOVER_TEXT_PRIMARY}`
                }`}
                title="Grid View"
              >
                <Grid className="h-4 w-4" />
              </button>
            </div>
          </div>
          {section.banner}
          {section.error && <p className="text-red-500 text-sm mb-3">{section.error}</p>}
          {section.body ??
            (section.loading && section.rows.length === 0 ? (
              <div className="text-center py-12">
                <RefreshCw className={`h-8 w-8 ${TEXT_MUTED} animate-spin mx-auto mb-4`} />
                <p className={TEXT_MUTED}>Loading files...</p>
              </div>
            ) : section.rows.length === 0 ? (
              <div className="text-center py-12">
                <File className={`h-12 w-12 ${TEXT_MUTED} mx-auto mb-4`} />
                <p className={TEXT_MUTED}>{section.emptyMessage || 'No files found for this account'}</p>
              </div>
            ) : viewMode === 'grid' ? (
              renderGrid(section.rows)
            ) : (
              renderList(section.rows)
            ))}
          {section.footer}
        </div>
      ))}
      {menu && renderRowMenu && (
        <RowMenuPortal menu={menu} onClose={closeMenu}>
          {renderRowMenu(menu.row, closeMenu)}
        </RowMenuPortal>
      )}
      {viewing && (
        <OwnerFileViewer
          transport={transport}
          row={viewing}
          onClose={closeViewer}
          onDownload={onDownload}
          actions={renderViewerActions?.(viewing, closeViewer)}
        />
      )}
    </div>
  );
}
