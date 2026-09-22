import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getClass,
  getTemplate,
  listConsumerClasses,
  listStarterTemplates,
  listTemplatesByClass,
  requireTemplate,
  searchPenCatalog,
  type PenClass,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { PenSession } from '../App';
import {
  deleteLocalDocs,
  loadLocalDoc,
  moveLocalDocToFolder,
  renameLocalDoc,
  type LocalDocSummary
} from '../services/penLocalStore';
import {
  createFolder,
  deleteFolder,
  ensureMyTemplatesNotebook,
  listChildFolders,
  listFolders,
  MY_TEMPLATES_NOTEBOOK_NAME,
  renameFolder,
  type PenFolder
} from '../services/penFolders';
import { fetchPenCatalog, fetchStorageTier } from '../services/penApi';
import {
  loadBrowseDensity,
  loadPinnedCategoryIds,
  saveBrowseDensity,
  togglePinnedCategory,
  type PenBrowseDensity
} from '../services/penClassPrefs';
import {
  createDocFromPersonalOrStarter,
  createProjectFromLibrary
} from '../services/penPublish';
import {
  listPersonalTemplates,
  personalTemplatesAsPenTemplates
} from '../services/penPersonalTemplates';
import { FormDocIcon } from '../components/FormDocIcon';
import { TemplateLivePreview } from '../components/TemplateLivePreview';
import { DocItemMenu } from '../components/DocItemMenu';
import { TemplatesBrowse } from '../components/TemplatesBrowse';
import { resolveDocLibraryStatus } from '../services/penDocStatus';

export type PenAddIntent = 'notebook' | 'templates' | 'my-templates';

type LibraryMode = 'library' | 'templates';

type DrillLevel = 'category' | 'form' | 'template';

type ExplorerSortKey = 'name' | 'category' | 'form' | 'template' | 'updated';

type ExplorerSort = {
  key: ExplorerSortKey;
  dir: 'asc' | 'desc';
};

const DEFAULT_EXPLORER_SORT: ExplorerSort = { key: 'updated', dir: 'desc' };

function isConsumerClass(c: PenClass): boolean {
  return !c.audience || c.audience === 'consumer';
}

function resolveDocClassId(d: LocalDocSummary): string | undefined {
  if (d.classId) return d.classId;
  return getTemplate(d.templateId)?.classId;
}

function sortDocs(docs: LocalDocSummary[], sort: ExplorerSort): LocalDocSummary[] {
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...docs].sort((a, b) => {
    const classA = resolveDocClassId(a);
    const classB = resolveDocClassId(b);
    const formA = classA ? getClass(classA) : undefined;
    const formB = classB ? getClass(classB) : undefined;
    const catA = formA?.parentId ? getClass(formA.parentId) : undefined;
    const catB = formB?.parentId ? getClass(formB.parentId) : undefined;

    let cmp = 0;
    switch (sort.key) {
      case 'name':
        cmp = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        break;
      case 'category':
        cmp = (catA?.title || '').localeCompare(catB?.title || '', undefined, {
          sensitivity: 'base'
        });
        break;
      case 'form':
        cmp = (formA?.title || '').localeCompare(formB?.title || '', undefined, {
          sensitivity: 'base'
        });
        break;
      case 'template':
        cmp = a.templateId.localeCompare(b.templateId);
        break;
      case 'updated':
      default:
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
    }
    if (cmp !== 0) return cmp * mul;
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  });
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  className = ''
}: {
  label: string;
  sortKey: ExplorerSortKey;
  sort: ExplorerSort;
  onSort: (key: ExplorerSortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th className={`${className} px-3 py-1 ${align === 'right' ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 text-[11px] uppercase tracking-wide ${
          active ? 'font-bold text-black' : 'font-normal text-neutral-600'
        } ${align === 'right' ? 'ml-auto' : ''}`}
      >
        {label}
        <span className="inline-block w-3 text-[10px]">{arrow.trim() || '\u00a0'}</span>
      </button>
    </th>
  );
}

function DocExplorerRow({
  d,
  pn,
  bulkMode,
  selected,
  onToggle,
  renaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  folders,
  onMove,
  onDelete,
  onOpen,
  indented = false
}: {
  d: LocalDocSummary;
  pn: string;
  bulkMode: boolean;
  selected: boolean;
  onToggle: (docId: string) => void;
  renaming: boolean;
  renameDraft: string;
  onRenameDraft: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  folders: Array<{ id: string; name: string }>;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
  onOpen: () => void;
  indented?: boolean;
}) {
  const classId = resolveDocClassId(d);
  const form = classId ? getClass(classId) : undefined;
  const category = form?.parentId ? getClass(form.parentId) : undefined;
  const clickTimer = useRef<number | null>(null);
  const status = resolveDocLibraryStatus(pn, d.docId);
  return (
    <tr
      className={`${selected ? 'bg-blue-50/40' : ''} hover:bg-neutral-50`}
      onClick={() => {
        if (bulkMode) onToggle(d.docId);
      }}
    >
      <td className="pen-explorer-action px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={selected}
          disabled={!bulkMode}
          onChange={() => onToggle(d.docId)}
          onClick={(e) => e.stopPropagation()}
          className={`h-4 w-4 accent-black ${bulkMode ? '' : 'invisible'}`}
          tabIndex={bulkMode ? 0 : -1}
          aria-hidden={!bulkMode}
          aria-label={`Select ${d.title || 'document'}`}
        />
      </td>
      <td className="pen-explorer-icon px-1 py-2">
        <FormDocIcon classId={classId} />
      </td>
      <td
        className={`pen-explorer-name-cell px-3 py-2 ${indented ? 'pen-explorer-name-indent' : ''}`}
      >
        {bulkMode ? (
          <span className="truncate font-medium text-black">{d.title || 'Untitled'}</span>
        ) : renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => onRenameDraft(e.target.value)}
            onBlur={() => onCommitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancelRename();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full border-b border-neutral-400 bg-transparent font-medium text-black outline-none"
          />
        ) : (
          <button
            type="button"
            className="truncate text-left font-medium text-black hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              if (clickTimer.current != null) return;
              clickTimer.current = window.setTimeout(() => {
                clickTimer.current = null;
                onOpen();
              }, 250);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (clickTimer.current != null) {
                window.clearTimeout(clickTimer.current);
                clickTimer.current = null;
              }
              onStartRename();
            }}
          >
            {d.title || 'Untitled'}
          </button>
        )}
      </td>
      <td className="pen-explorer-col-category px-3 py-2 text-xs text-black">
        {category?.title || '—'}
      </td>
      <td className="pen-explorer-col-form px-3 py-2 text-xs text-black">
        {form?.title || '—'}
      </td>
      <td className="pen-explorer-col-status max-w-[14rem] truncate px-3 py-2 text-xs text-black">
        {status}
      </td>
      <td className="pen-explorer-col-updated whitespace-nowrap px-3 py-2 text-left text-xs text-black">
        <div className="flex items-center gap-1">
          <span className="min-w-0 truncate">{new Date(d.updatedAt).toLocaleString()}</span>
          <span className="pen-explorer-menu-slot">
            {!bulkMode ? (
              <DocItemMenu
                folders={folders}
                onRename={onStartRename}
                onMove={onMove}
                onDelete={onDelete}
              />
            ) : null}
          </span>
        </div>
      </td>
    </tr>
  );
}

function NotebookExplorerRow({
  notebook,
  expanded,
  onToggleExpand,
  onRename,
  onDelete
}: {
  notebook: PenFolder;
  expanded: boolean;
  onToggleExpand: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="hover:bg-neutral-50">
      <td className="pen-explorer-action px-2 py-2 text-center">
        <span className="inline-block h-4 w-4" aria-hidden />
      </td>
      <td className="pen-explorer-icon px-1 py-2">
        <button
          type="button"
          className="pen-explorer-chevron"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse notebook' : 'Expand notebook'}
          title={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </td>
      <td className="pen-explorer-name-cell px-3 py-2">
        <button
          type="button"
          onClick={onToggleExpand}
          onDoubleClick={(e) => {
            e.preventDefault();
            onRename();
          }}
          className="truncate font-medium text-black hover:underline"
        >
          {notebook.name}
        </button>
      </td>
      <td className="pen-explorer-col-category px-3 py-2 text-xs text-neutral-500">Notebook</td>
      <td className="pen-explorer-col-form px-3 py-2 text-xs text-black">—</td>
      <td className="pen-explorer-col-status px-3 py-2 text-xs text-neutral-500">—</td>
      <td className="pen-explorer-col-updated whitespace-nowrap px-3 py-2 text-left text-xs text-black">
        <div className="flex items-center gap-1">
          <span className="min-w-0 truncate">{new Date(notebook.createdAt).toLocaleString()}</span>
          <span className="pen-explorer-menu-slot">
            <DocItemMenu
              folders={[]}
              showMove={false}
              onRename={onRename}
              onMove={() => undefined}
              onDelete={onDelete}
            />
          </span>
        </div>
      </td>
    </tr>
  );
}

function DocExplorerTable({
  pn,
  docs,
  notebooks,
  personalTemplatesByNotebook = {},
  personalTemplates = [],
  moveFolders,
  sort,
  onSort,
  bulkMode,
  selectedIds,
  onToggle,
  renamingId,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onMoveDoc,
  onDeleteDoc,
  expandedNotebookIds,
  onToggleNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onOpenDoc,
  onOpenPersonalTemplate
}: {
  pn: string;
  docs: LocalDocSummary[];
  notebooks: PenFolder[];
  personalTemplatesByNotebook?: Record<string, Array<{ id: string; title: string }>>;
  personalTemplates?: Array<{ id: string; title: string }>;
  moveFolders: Array<{ id: string; name: string }>;
  sort: ExplorerSort;
  onSort: (key: ExplorerSortKey) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggle: (docId: string) => void;
  renamingId: string | null;
  renameDraft: string;
  onRenameDraft: (v: string) => void;
  onStartRename: (docId: string, title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onDeleteDoc: (docId: string) => void;
  expandedNotebookIds: Set<string>;
  onToggleNotebook: (notebookId: string) => void;
  onRenameNotebook: (notebook: PenFolder) => void;
  onDeleteNotebook: (notebookId: string) => void;
  onOpenDoc: (docId: string) => void;
  onOpenPersonalTemplate?: (templateId: string) => void;
}) {
  const rootDocs = notebooks.length === 0 ? docs : docs.filter((d) => !d.folderId);
  const docsInNotebook = (notebookId: string) =>
    docs.filter((d) => d.folderId === notebookId);

  function renderDocRow(d: LocalDocSummary, indented: boolean) {
    return (
      <DocExplorerRow
        key={d.docId}
        d={d}
        pn={pn}
        bulkMode={bulkMode}
        selected={selectedIds.has(d.docId)}
        onToggle={onToggle}
        renaming={renamingId === d.docId}
        renameDraft={renameDraft}
        onRenameDraft={onRenameDraft}
        onStartRename={() => onStartRename(d.docId, d.title || '')}
        onCommitRename={onCommitRename}
        onCancelRename={onCancelRename}
        folders={moveFolders}
        onMove={(folderId) => onMoveDoc(d.docId, folderId)}
        onDelete={() => onDeleteDoc(d.docId)}
        onOpen={() => onOpenDoc(d.docId)}
        indented={indented}
      />
    );
  }

  return (
    <div className="pen-explorer" data-bulk={bulkMode ? 'true' : 'false'}>
      <div className="pen-explorer-sheet">
        <div className="pen-explorer-scroll">
          <table className="text-left text-sm">
            <thead className="text-[11px] tracking-wide">
              <tr>
                <th className="pen-explorer-action px-2 py-1 text-center" aria-label="Select" />
                <th className="pen-explorer-icon px-1 py-1" aria-hidden />
                <SortHeader
                  label="Name"
                  sortKey="name"
                  sort={sort}
                  onSort={onSort}
                  className="pen-explorer-name-header"
                />
                <SortHeader
                  label="Category"
                  sortKey="category"
                  sort={sort}
                  onSort={onSort}
                  className="pen-explorer-col-category"
                />
                <SortHeader
                  label="Form"
                  sortKey="form"
                  sort={sort}
                  onSort={onSort}
                  className="pen-explorer-col-form"
                />
                <th className="pen-explorer-col-status px-3 py-1 text-left">
                  <span className="text-[11px] font-normal uppercase tracking-wide text-neutral-600">
                    Status
                  </span>
                </th>
                <SortHeader
                  label="Updated"
                  sortKey="updated"
                  sort={sort}
                  onSort={onSort}
                  align="left"
                  className="pen-explorer-col-updated"
                />
              </tr>
            </thead>
            <tbody>
              {!bulkMode &&
                notebooks.map((nb) => (
                  <Fragment key={nb.id}>
                    <NotebookExplorerRow
                      notebook={nb}
                      expanded={expandedNotebookIds.has(nb.id)}
                      onToggleExpand={() => onToggleNotebook(nb.id)}
                      onRename={() => onRenameNotebook(nb)}
                      onDelete={() => onDeleteNotebook(nb.id)}
                    />
                    {expandedNotebookIds.has(nb.id) &&
                      sortDocs(docsInNotebook(nb.id), sort).map((d) => renderDocRow(d, true))}
                    {expandedNotebookIds.has(nb.id) &&
                      (personalTemplatesByNotebook[nb.id] || []).map((t) => (
                        <tr
                          key={t.id}
                          className="cursor-pointer hover:bg-neutral-50"
                          onClick={() => onOpenPersonalTemplate?.(t.id)}
                        >
                          <td className="pen-explorer-action px-2 py-2" />
                          <td className="pen-explorer-icon px-1 py-2" />
                          <td className="pen-explorer-name-cell pen-explorer-name-indent px-3 py-2 font-medium text-black">
                            {t.title}
                          </td>
                          <td className="pen-explorer-col-category px-3 py-2 text-xs text-neutral-500">
                            —
                          </td>
                          <td className="pen-explorer-col-form px-3 py-2 text-xs text-neutral-500">
                            Template
                          </td>
                          <td className="pen-explorer-col-status px-3 py-2 text-xs text-neutral-500">
                            Saved
                          </td>
                          <td className="pen-explorer-col-updated px-3 py-2 text-xs text-neutral-500">
                            —
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              {sortDocs(rootDocs, sort).map((d) => renderDocRow(d, false))}
              {personalTemplates.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer hover:bg-neutral-50"
                  onClick={() => onOpenPersonalTemplate?.(t.id)}
                >
                  <td className="pen-explorer-action px-2 py-2" />
                  <td className="pen-explorer-icon px-1 py-2" />
                  <td className="pen-explorer-name-cell px-3 py-2 font-medium text-black">
                    {t.title}
                  </td>
                  <td className="pen-explorer-col-category px-3 py-2 text-xs text-neutral-500">
                    —
                  </td>
                  <td className="pen-explorer-col-form px-3 py-2 text-xs text-neutral-500">
                    Template
                  </td>
                  <td className="pen-explorer-col-status px-3 py-2 text-xs text-neutral-500">
                    Saved
                  </td>
                  <td className="pen-explorer-col-updated px-3 py-2 text-xs text-neutral-500">
                    —
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function NotebookGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 19.5v-15Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 3v18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function DocGalleryCard({
  pn,
  d,
  bulkMode,
  selected,
  onToggle,
  folders,
  renaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onMove,
  onDelete
}: {
  pn: string;
  d: LocalDocSummary;
  bulkMode: boolean;
  selected: boolean;
  onToggle: (docId: string) => void;
  folders: Array<{ id: string; name: string }>;
  renaming: boolean;
  renameDraft: string;
  onRenameDraft: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}) {
  const bundle = loadLocalDoc(pn, d.docId);
  const title = d.title || 'Untitled';

  const titleRow = (
    <div className="pen-gallery-tile-title">
      {renaming ? (
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => onRenameDraft(e.target.value)}
          onBlur={() => onCommitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommitRename();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancelRename();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="pen-gallery-tile-title-text"
        />
      ) : (
        <div
          className="pen-gallery-tile-title-text"
          title={title}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!bulkMode) onStartRename();
          }}
        >
          {title}
        </div>
      )}
      {!bulkMode && !renaming && (
        <DocItemMenu
          folders={folders}
          onRename={onStartRename}
          onMove={onMove}
          onDelete={onDelete}
        />
      )}
    </div>
  );

  const preview = (
    <div className="pen-gallery-tile-preview">
      {bulkMode && (
        <div className="absolute left-1 top-1 z-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(d.docId)}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 accent-black"
            aria-label={`Select ${title}`}
          />
        </div>
      )}
      {bundle ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[178px] w-[100px] -translate-x-1/2 origin-top">
            <TemplateLivePreview
              manifest={bundle.manifest}
              sections={bundle.sections}
              compact
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center bg-neutral-100 text-[10px] text-neutral-500">
          —
        </div>
      )}
    </div>
  );

  if (bulkMode) {
    return (
      <div className="pen-gallery-slot">
        <button
          type="button"
          onClick={() => onToggle(d.docId)}
          className={`pen-gallery-tile ${selected ? 'ring-2 ring-black ring-offset-1' : ''}`}
        >
          {titleRow}
          {preview}
        </button>
      </div>
    );
  }

  return (
    <div className="pen-gallery-slot">
      <div className="pen-gallery-tile">
        {titleRow}
        <Link to={`/d/${d.docId}`} className="pen-gallery-tile-preview-link">
          {preview}
        </Link>
      </div>
    </div>
  );
}

function NotebookGalleryCard({
  notebook,
  onOpen,
  onRename,
  onDelete
}: {
  notebook: PenFolder;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="pen-gallery-slot">
      <div className="pen-gallery-tile">
        <div className="pen-gallery-tile-title">
          <button
            type="button"
            onClick={onOpen}
            onDoubleClick={(e) => {
              e.preventDefault();
              onRename();
            }}
            className="pen-gallery-tile-title-text text-left"
            title={notebook.name}
          >
            {notebook.name}
          </button>
          <DocItemMenu
            folders={[]}
            showMove={false}
            onRename={onRename}
            onMove={() => undefined}
            onDelete={onDelete}
          />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="pen-gallery-tile-preview flex items-center justify-center bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
        >
          <NotebookGlyph />
        </button>
      </div>
    </div>
  );
}

function CreateNewGalleryTile({ onClick }: { onClick: () => void }) {
  return (
    <div className="pen-gallery-slot">
      <button type="button" onClick={onClick} className="pen-gallery-tile">
        <div className="pen-gallery-tile-title">
          <span className="pen-gallery-tile-title-text">Create new</span>
        </div>
        <span className="pen-gallery-tile-preview flex items-center justify-center bg-white text-2xl font-light text-neutral-500">
          +
        </span>
      </button>
    </div>
  );
}

function PersonalTemplateGalleryCard({
  title,
  onOpen
}: {
  title: string;
  onOpen: () => void;
}) {
  return (
    <div className="pen-gallery-slot">
      <button type="button" onClick={onOpen} className="pen-gallery-tile">
        <div className="pen-gallery-tile-title">
          <span className="pen-gallery-tile-title-text">{title}</span>
        </div>
        <span className="pen-gallery-tile-preview flex items-center justify-center bg-neutral-100 text-xs text-neutral-500">
          Template
        </span>
      </button>
    </div>
  );
}

function DocGalleryGrid({
  pn,
  docs,
  childFolders,
  personalTemplates = [],
  moveFolders,
  bulkMode,
  selectedIds,
  onToggle,
  onCreateNew,
  onOpenPersonalTemplate,
  renamingId,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onMoveDoc,
  onDeleteDoc,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder
}: {
  pn: string;
  docs: LocalDocSummary[];
  childFolders: PenFolder[];
  personalTemplates?: Array<{ id: string; title: string }>;
  moveFolders: Array<{ id: string; name: string }>;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggle: (docId: string) => void;
  onCreateNew: () => void;
  onOpenPersonalTemplate?: (templateId: string) => void;
  renamingId: string | null;
  renameDraft: string;
  onRenameDraft: (v: string) => void;
  onStartRename: (docId: string, title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onDeleteDoc: (docId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onRenameFolder: (folder: PenFolder) => void;
  onDeleteFolder: (folderId: string) => void;
}) {
  return (
    <div className="pen-gallery-wrap">
      <div className="pen-gallery-head" aria-hidden />
      <div className="pen-gallery">
        <div className="pen-gallery-tiles">
          {!bulkMode && <CreateNewGalleryTile onClick={onCreateNew} />}
          {!bulkMode &&
            childFolders.map((f) => (
              <NotebookGalleryCard
                key={f.id}
                notebook={f}
                onOpen={() => onOpenFolder(f.id)}
                onRename={() => onRenameFolder(f)}
                onDelete={() => onDeleteFolder(f.id)}
              />
            ))}
          {!bulkMode &&
            personalTemplates.map((t) => (
              <PersonalTemplateGalleryCard
                key={t.id}
                title={t.title}
                onOpen={() => onOpenPersonalTemplate?.(t.id)}
              />
            ))}
          {docs.map((d) => (
            <DocGalleryCard
              key={d.docId}
              pn={pn}
              d={d}
              bulkMode={bulkMode}
              selected={selectedIds.has(d.docId)}
              onToggle={onToggle}
              folders={moveFolders}
              renaming={renamingId === d.docId}
              renameDraft={renameDraft}
              onRenameDraft={onRenameDraft}
              onStartRename={() => onStartRename(d.docId, d.title || '')}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onMove={(folderId) => onMoveDoc(d.docId, folderId)}
              onDelete={() => onDeleteDoc(d.docId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BulkInlineControls({
  visibleDocs,
  selectedIds,
  onSelectAll,
  onDelete
}: {
  visibleDocs: LocalDocSummary[];
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onDelete: () => void;
}) {
  const selectedCount = visibleDocs.filter((d) => selectedIds.has(d.docId)).length;
  const allSelected = visibleDocs.length > 0 && selectedCount === visibleDocs.length;
  return (
    <div className="pen-library-bulk-inline text-sm">
      <button
        type="button"
        onClick={onSelectAll}
        className="font-bold text-black hover:opacity-60"
      >
        {allSelected ? 'Deselect all' : 'Select all'}
      </button>
      <span className="text-neutral-600">{selectedCount} selected</span>
      <button
        type="button"
        onClick={onDelete}
        disabled={selectedCount === 0}
        className="font-bold text-red-600 hover:opacity-70 disabled:opacity-30"
      >
        Delete ({selectedCount})
      </button>
    </div>
  );
}

/** Quiet file-manager home — templates browse is an in-page view. */
export function DocListPage({
  session,
  docs,
  onDocsChange,
  addIntent = null,
  onAddIntentConsumed
}: {
  session: PenSession;
  docs: LocalDocSummary[];
  onDocsChange: () => void;
  addIntent?: PenAddIntent | null;
  onAddIntentConsumed?: () => void;
}) {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<PenClass[]>(listConsumerClasses());
  const [templates, setTemplates] = useState<PenTemplate[]>(() =>
    listStarterTemplates().filter((t) => {
      const form = getClass(t.classId);
      return !form || isConsumerClass(form);
    })
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('library');
  const [search, setSearch] = useState('');
  const [pins, setPins] = useState(() => loadPinnedCategoryIds(session.pnIdentifier));
  const [showAll, setShowAll] = useState(() => loadPinnedCategoryIds(session.pnIdentifier).length === 0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [storageTier, setStorageTier] = useState<string | null>(null);
  const [browseDensity, setBrowseDensity] = useState<PenBrowseDensity>(() =>
    loadBrowseDensity(session.pnIdentifier)
  );
  const [explorerSort, setExplorerSort] = useState<ExplorerSort>(DEFAULT_EXPLORER_SORT);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [libraryPickMode, setLibraryPickMode] = useState(false);
  const [librarySelectedIds, setLibrarySelectedIds] = useState<Set<string>>(() => new Set());
  const [folderTick, setFolderTick] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<Set<string>>(() => new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    fetchPenCatalog(session.accessToken)
      .then((c) => {
        if (c.classes.length) setClasses(c.classes.filter(isConsumerClass));
        if (c.templates.length) {
          setTemplates(
            c.templates.filter((t) => {
              const form = getClass(t.classId) || c.classes.find((cl) => cl.id === t.classId);
              return !form || isConsumerClass(form);
            })
          );
        }
      })
      .catch(() => undefined);
    fetchStorageTier(session.accessToken, session.pnIdentifier).then(setStorageTier);
  }, [session.accessToken, session.pnIdentifier]);

  const categories = useMemo(
    () => classes.filter((c) => !c.parentId && isConsumerClass(c)),
    [classes]
  );

  const visibleCategories = useMemo(() => {
    if (showAll || pins.length === 0) return categories;
    return categories.filter((c) => pins.includes(c.id));
  }, [categories, pins, showAll]);

  const forms = useMemo(
    () =>
      categoryId
        ? classes.filter((c) => c.parentId === categoryId && isConsumerClass(c))
        : [],
    [classes, categoryId]
  );

  const formTemplates = useMemo(
    () => (formId ? listTemplatesByClass(formId, templates) : []),
    [formId, templates]
  );

  const searchHits = useMemo(
    () => searchPenCatalog(search, { classes, templates, audience: 'consumer' }),
    [search, classes, templates]
  );

  const allFolders = useMemo(() => {
    void folderTick;
    return listFolders(session.pnIdentifier);
  }, [session.pnIdentifier, folderTick]);

  const rootNotebooks = useMemo(() => {
    void folderTick;
    return listChildFolders(session.pnIdentifier, null);
  }, [session.pnIdentifier, folderTick]);

  const childFolders = useMemo(() => {
    void folderTick;
    return listChildFolders(session.pnIdentifier, currentFolderId);
  }, [session.pnIdentifier, currentFolderId, folderTick]);

  const moveFolderOptions = useMemo(
    () => allFolders.map((f) => ({ id: f.id, name: f.name })),
    [allFolders]
  );

  const currentFolder = useMemo(
    () => (currentFolderId ? allFolders.find((f) => f.id === currentFolderId) : null),
    [allFolders, currentFolderId]
  );

  const folderDocs = useMemo(() => {
    return docs.filter((d) => (d.folderId || null) === currentFolderId);
  }, [docs, currentFolderId]);

  const inMyTemplatesNotebook = currentFolder?.name === MY_TEMPLATES_NOTEBOOK_NAME;

  const myPersonalTemplates = useMemo(() => {
    void folderTick;
    if (!inMyTemplatesNotebook) return [];
    return listPersonalTemplates(session.pnIdentifier).map((t) => ({
      id: t.id,
      title: t.title
    }));
  }, [session.pnIdentifier, inMyTemplatesNotebook, folderTick]);

  const personalTemplatesByNotebook = useMemo(() => {
    void folderTick;
    const nb = allFolders.find((f) => f.name === MY_TEMPLATES_NOTEBOOK_NAME && f.parentId === null);
    if (!nb) return {} as Record<string, Array<{ id: string; title: string }>>;
    return {
      [nb.id]: listPersonalTemplates(session.pnIdentifier).map((t) => ({
        id: t.id,
        title: t.title
      }))
    };
  }, [session.pnIdentifier, allFolders, folderTick]);

  async function openPersonalTemplate(templateId: string) {
    setBusy(true);
    setError(null);
    try {
      const bundle = await createDocFromPersonalOrStarter({
        session,
        templateId
      });
      onDocsChange();
      navigate(`/d/${bundle.manifest.docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open template');
    } finally {
      setBusy(false);
    }
  }

  function toggleNotebookExpand(notebookId: string) {
    setExpandedNotebookIds((prev) => {
      const next = new Set(prev);
      if (next.has(notebookId)) next.delete(notebookId);
      else next.add(notebookId);
      return next;
    });
  }

  const level: DrillLevel = formId ? 'template' : categoryId ? 'form' : 'category';

  const feedEntitled = storageTier === 'self-hosted';

  function formLocked(form: PenClass): boolean {
    return form.entitlement === 'self-hosted' && !feedEntitled;
  }

  function openTemplatesView() {
    setLibraryMode('templates');
    setPickerOpen(false);
    setBulkDeleteMode(false);
  }

  function openMyTemplatesNotebook() {
    const nb = ensureMyTemplatesNotebook(session.pnIdentifier);
    setFolderTick((n) => n + 1);
    setLibraryMode('library');
    setCurrentFolderId(nb.id);
    setExpandedNotebookIds((prev) => new Set(prev).add(nb.id));
    setPickerOpen(false);
  }

  function createNotebookHere() {
    const name = window.prompt('Notebook name');
    if (!name?.trim()) return;
    createFolder(session.pnIdentifier, name.trim(), currentFolderId);
    setFolderTick((n) => n + 1);
    setLibraryMode('library');
  }

  useEffect(() => {
    if (!addIntent) return;
    if (addIntent === 'notebook') createNotebookHere();
    else if (addIntent === 'templates') openTemplatesView();
    else if (addIntent === 'my-templates') openMyTemplatesNotebook();
    onAddIntentConsumed?.();
    // Intentionally intent-driven only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addIntent]);

  function toggleLibraryDoc(docId: string) {
    setLibrarySelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  async function createFromLibrarySelection() {
    const sources = docs
      .filter((d) => librarySelectedIds.has(d.docId))
      .map((d) => ({ docId: d.docId, title: d.title || 'Untitled' }));
    if (!sources.length) return;
    setBusy(true);
    setError(null);
    try {
      const bundle = await createProjectFromLibrary({
        session,
        sourceDocs: sources
      });
      onDocsChange();
      setPickerOpen(false);
      setLibraryPickMode(false);
      setLibrarySelectedIds(new Set());
      navigate(`/d/${bundle.manifest.docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create project');
    } finally {
      setBusy(false);
    }
  }

  function setDensity(density: PenBrowseDensity) {
    setBrowseDensity(density);
    saveBrowseDensity(session.pnIdentifier, density);
  }

  function cycleExplorerSort(key: ExplorerSortKey) {
    setExplorerSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      // Dates default newest-first; text columns default A→Z.
      return { key, dir: key === 'updated' ? 'desc' : 'asc' };
    });
  }

  function toggleBulkMode() {
    setBulkDeleteMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }

  function toggleDocSelection(docId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  function selectAllVisible(visible: LocalDocSummary[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visible.every((d) => next.has(d.docId));
      if (allSelected) {
        visible.forEach((d) => next.delete(d.docId));
      } else {
        visible.forEach((d) => next.add(d.docId));
      }
      return next;
    });
  }

  function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const ok = window.confirm(
      ids.length === 1
        ? 'Delete this document? This cannot be undone.'
        : `Delete ${ids.length} documents? This cannot be undone.`
    );
    if (!ok) return;
    deleteLocalDocs(session.pnIdentifier, ids);
    setSelectedIds(new Set());
    setBulkDeleteMode(false);
    onDocsChange();
  }

  function startRename(docId: string, title: string) {
    setRenamingId(docId);
    setRenameDraft(title);
  }

  function commitRename() {
    if (!renamingId) return;
    renameLocalDoc(session.pnIdentifier, renamingId, renameDraft);
    setRenamingId(null);
    setRenameDraft('');
    onDocsChange();
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameDraft('');
  }

  function handleMoveDoc(docId: string, folderId: string | null) {
    moveLocalDocToFolder(session.pnIdentifier, docId, folderId);
    onDocsChange();
  }

  function handleDeleteDoc(docId: string) {
    const ok = window.confirm('Delete this document? This cannot be undone.');
    if (!ok) return;
    deleteLocalDocs(session.pnIdentifier, [docId]);
    onDocsChange();
  }

  function handleCreateFolder() {
    const name = window.prompt('Notebook name');
    if (!name?.trim()) return;
    createFolder(session.pnIdentifier, name.trim(), currentFolderId);
    setFolderTick((n) => n + 1);
    setPickerOpen(false);
  }

  function handleRenameFolder(folder: PenFolder) {
    const name = window.prompt('Rename notebook', folder.name);
    if (name == null) return;
    renameFolder(session.pnIdentifier, folder.id, name);
    setFolderTick((n) => n + 1);
  }

  function handleDeleteFolder(folderId: string) {
    const ok = window.confirm(
      'Delete this notebook? Documents inside will move back to My Library.'
    );
    if (!ok) return;
    for (const d of docs) {
      if (d.folderId === folderId) {
        moveLocalDocToFolder(session.pnIdentifier, d.docId, null);
      }
    }
    deleteFolder(session.pnIdentifier, folderId);
    if (currentFolderId === folderId) setCurrentFolderId(null);
    setExpandedNotebookIds((prev) => {
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });
    setFolderTick((n) => n + 1);
    onDocsChange();
  }

  async function createDoc(templateId: string) {
    setBusy(true);
    setError(null);
    try {
      const personalList = listPersonalTemplates(session.pnIdentifier);
      const isPersonal = personalList.some((t) => t.id === templateId);
      if (!isPersonal) {
        const template =
          templates.find((t) => t.id === templateId) || requireTemplate(templateId);
        const form = getClass(template.classId);
        if (form?.entitlement === 'self-hosted' && !feedEntitled) {
          throw new Error('self_hosted_plan_required');
        }
      }

      const bundle = await createDocFromPersonalOrStarter({
        session,
        templateId
      });
      if (currentFolderId) {
        moveLocalDocToFolder(
          session.pnIdentifier,
          bundle.manifest.docId,
          currentFolderId
        );
      }
      onDocsChange();
      setPickerOpen(false);
      navigate(`/d/${bundle.manifest.docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  function breadcrumbTitle(): string {
    if (libraryPickMode) return 'From My Library';
    if (search.trim()) return 'Search';
    if (formId) {
      const f = getClass(formId);
      const c = f?.parentId ? getClass(f.parentId) : null;
      return [c?.title, f?.title].filter(Boolean).join(' · ') || 'Templates';
    }
    if (categoryId) return getClass(categoryId)?.title || 'Forms';
    return 'New from template';
  }

  function templateBreadcrumb(t: PenTemplate): string {
    const form = getClass(t.classId);
    const cat = form?.parentId ? getClass(form.parentId) : undefined;
    return [cat?.title, form?.title, t.title].filter(Boolean).join(' › ');
  }

  const sortedDocs = useMemo(
    () => sortDocs(folderDocs, explorerSort),
    [folderDocs, explorerSort]
  );

  const listVisibleDocs = useMemo(() => {
    const nested = docs.filter(
      (d) => d.folderId && expandedNotebookIds.has(d.folderId)
    );
    const root = docs.filter((d) => !d.folderId);
    return sortDocs([...nested, ...root], explorerSort);
  }, [docs, expandedNotebookIds, explorerSort]);

  return (
    <div className="pen-library-page bg-white">
      <div className="pen-library-notebook flex-1">
        <div className="pen-library-notebook-inner">
          <div className="pen-explorer-rail" aria-hidden />

          {libraryMode === 'templates' ? (
            <TemplatesBrowse
              session={session}
              density={browseDensity}
              onDensity={setDensity}
              onBack={() => setLibraryMode('library')}
              onCreated={(docId) => {
                onDocsChange();
                navigate(`/d/${docId}`);
              }}
              onSaved={() => {
                setFolderTick((n) => n + 1);
                onDocsChange();
              }}
            />
          ) : (
            <>
          <div className="pen-library-heading">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-black">My Library</h1>
              <p className="text-sm text-neutral-500">
                {currentFolder ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => setCurrentFolderId(null)}
                    >
                      My Library
                    </button>
                    <span aria-hidden>/</span>
                    <span className="font-medium text-black">{currentFolder.name}</span>
                  </span>
                ) : (
                  'Open a file or start from a template.'
                )}
              </p>
            </div>
            {(docs.length > 0 || allFolders.length > 0) && (
              <div className="pen-library-heading-tools">
                <div
                  className="flex items-center justify-end gap-0"
                  role="group"
                  aria-label="Browse density"
                >
                  <button
                    type="button"
                    title="List"
                    aria-label="List view"
                    aria-pressed={browseDensity === 'list'}
                    onClick={() => setDensity('list')}
                    className={`inline-flex h-8 w-8 items-center justify-center ${
                      browseDensity === 'list'
                        ? 'text-black'
                        : 'text-neutral-600 hover:text-neutral-800'
                    }`}
                  >
                    <ListIcon />
                  </button>
                  <button
                    type="button"
                    title="Gallery"
                    aria-label="Gallery view"
                    aria-pressed={browseDensity === 'gallery'}
                    onClick={() => setDensity('gallery')}
                    className={`inline-flex h-8 w-8 items-center justify-center ${
                      browseDensity === 'gallery'
                        ? 'text-black'
                        : 'text-neutral-600 hover:text-neutral-800'
                    }`}
                  >
                    <GalleryIcon />
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {bulkDeleteMode && (
                    <BulkInlineControls
                      visibleDocs={browseDensity === 'list' ? listVisibleDocs : sortedDocs}
                      selectedIds={selectedIds}
                      onSelectAll={() =>
                        selectAllVisible(
                          browseDensity === 'list' ? listVisibleDocs : sortedDocs
                        )
                      }
                      onDelete={confirmBulkDelete}
                    />
                  )}
                  <button
                    type="button"
                    title={bulkDeleteMode ? 'Cancel selection' : 'Select to delete'}
                    aria-label={bulkDeleteMode ? 'Cancel selection' : 'Select to delete'}
                    aria-pressed={bulkDeleteMode}
                    onClick={toggleBulkMode}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent outline-none ${
                      bulkDeleteMode
                        ? 'text-black'
                        : 'text-neutral-600 hover:text-black'
                    }`}
                  >
                    <MinusIcon />
                  </button>
                </div>
              </div>
            )}
          </div>

          {docs.length === 0 && allFolders.length === 0 ? (
            <div className="pen-library-body px-6 py-16 text-center">
              <p className="text-neutral-500">No documents yet.</p>
              <button
                type="button"
                className="mt-4 text-sm font-bold text-black underline"
                onClick={openTemplatesView}
              >
                Browse templates
              </button>
            </div>
          ) : (
            <div className="pen-library-body">
              {browseDensity === 'gallery' ? (
                <DocGalleryGrid
                  pn={session.pnIdentifier}
                  docs={sortedDocs}
                  childFolders={childFolders}
                  personalTemplates={myPersonalTemplates}
                  moveFolders={moveFolderOptions}
                  bulkMode={bulkDeleteMode}
                  selectedIds={selectedIds}
                  onToggle={toggleDocSelection}
                  onCreateNew={openTemplatesView}
                  onOpenPersonalTemplate={(id) => void openPersonalTemplate(id)}
                  renamingId={renamingId}
                  renameDraft={renameDraft}
                  onRenameDraft={setRenameDraft}
                  onStartRename={startRename}
                  onCommitRename={commitRename}
                  onCancelRename={cancelRename}
                  onMoveDoc={handleMoveDoc}
                  onDeleteDoc={handleDeleteDoc}
                  onOpenFolder={setCurrentFolderId}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                />
              ) : currentFolderId ? (
                <DocExplorerTable
                  pn={session.pnIdentifier}
                  docs={folderDocs}
                  notebooks={[]}
                  personalTemplates={myPersonalTemplates}
                  moveFolders={moveFolderOptions}
                  sort={explorerSort}
                  onSort={cycleExplorerSort}
                  bulkMode={bulkDeleteMode}
                  selectedIds={selectedIds}
                  onToggle={toggleDocSelection}
                  renamingId={renamingId}
                  renameDraft={renameDraft}
                  onRenameDraft={setRenameDraft}
                  onStartRename={startRename}
                  onCommitRename={commitRename}
                  onCancelRename={cancelRename}
                  onMoveDoc={handleMoveDoc}
                  onDeleteDoc={handleDeleteDoc}
                  expandedNotebookIds={expandedNotebookIds}
                  onToggleNotebook={toggleNotebookExpand}
                  onRenameNotebook={handleRenameFolder}
                  onDeleteNotebook={handleDeleteFolder}
                  onOpenDoc={(docId) => navigate(`/d/${docId}`)}
                  onOpenPersonalTemplate={(id) => void openPersonalTemplate(id)}
                />
              ) : (
                <DocExplorerTable
                  pn={session.pnIdentifier}
                  docs={docs}
                  notebooks={rootNotebooks}
                  personalTemplatesByNotebook={personalTemplatesByNotebook}
                  moveFolders={moveFolderOptions}
                  sort={explorerSort}
                  onSort={cycleExplorerSort}
                  bulkMode={bulkDeleteMode}
                  selectedIds={selectedIds}
                  onToggle={toggleDocSelection}
                  renamingId={renamingId}
                  renameDraft={renameDraft}
                  onRenameDraft={setRenameDraft}
                  onStartRename={startRename}
                  onCommitRename={commitRename}
                  onCancelRename={cancelRename}
                  onMoveDoc={handleMoveDoc}
                  onDeleteDoc={handleDeleteDoc}
                  expandedNotebookIds={expandedNotebookIds}
                  onToggleNotebook={toggleNotebookExpand}
                  onRenameNotebook={handleRenameFolder}
                  onDeleteNotebook={handleDeleteFolder}
                  onOpenDoc={(docId) => navigate(`/d/${docId}`)}
                  onOpenPersonalTemplate={(id) => void openPersonalTemplate(id)}
                />
              )}
            </div>
          )}
            </>
          )}

          <footer className="pen-library-footer">
            <p className="pen-library-footer-copy">© par Noir</p>
          </footer>
        </div>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div
            className="absolute inset-0"
            onClick={() => docs.length > 0 && setPickerOpen(false)}
            aria-hidden
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="shrink-0 border-b border-stone-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {(categoryId || formId || search.trim() || libraryPickMode) && (
                    <button
                      type="button"
                      className="shrink-0 text-sm text-neutral-600 hover:text-black"
                      onClick={() => {
                        if (libraryPickMode) {
                          setLibraryPickMode(false);
                          setLibrarySelectedIds(new Set());
                          return;
                        }
                        if (search.trim()) {
                          setSearch('');
                          return;
                        }
                        if (formId) setFormId(null);
                        else if (categoryId) setCategoryId(null);
                      }}
                    >
                      ←
                    </button>
                  )}
                  <h2 className="truncate text-sm font-bold text-black">{breadcrumbTitle()}</h2>
                </div>
                {docs.length > 0 && (
                  <button
                    type="button"
                    className="shrink-0 text-sm text-neutral-600 hover:text-black"
                    onClick={() => {
                      setPickerOpen(false);
                      setLibraryPickMode(false);
                      setLibrarySelectedIds(new Set());
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
              {!libraryPickMode && (
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search categories, forms, templates…"
                  className="mt-2 w-full rounded border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-stone-500"
                />
              )}
              {!libraryPickMode && !search.trim() && level === 'category' && (
                <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={showAll}
                    onChange={(e) => setShowAll(e.target.checked)}
                  />
                  Show all categories
                  {pins.length > 0 && !showAll && (
                    <span className="text-neutral-600">({pins.length} pinned)</span>
                  )}
                </label>
              )}
              {libraryPickMode && (
                <p className="mt-2 text-xs text-neutral-600">
                  Select documents to port into one project space.
                </p>
              )}
            </div>

            {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {libraryPickMode ? (
                <>
                  <ul className="divide-y divide-stone-100">
                    {docs.length === 0 && (
                      <li className="px-3 py-6 text-center text-sm text-neutral-600">
                        No documents in My Library yet.
                      </li>
                    )}
                    {docs.map((d) => (
                      <li key={d.docId}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-neutral-50">
                          <input
                            type="checkbox"
                            checked={librarySelectedIds.has(d.docId)}
                            onChange={() => toggleLibraryDoc(d.docId)}
                            className="h-4 w-4 accent-black"
                          />
                          <FormDocIcon classId={resolveDocClassId(d)} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-black">
                              {d.title || 'Untitled'}
                            </div>
                            <div className="truncate text-xs text-black">
                              {getClass(resolveDocClassId(d) || '')?.title || d.templateId}
                            </div>
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-stone-200 bg-white px-3 py-3">
                    <span className="text-sm text-neutral-600">
                      {librarySelectedIds.size} selected
                    </span>
                    <button
                      type="button"
                      disabled={busy || librarySelectedIds.size === 0}
                      onClick={() => void createFromLibrarySelection()}
                      className="font-bold text-black hover:opacity-60 disabled:opacity-30"
                    >
                      Create project
                    </button>
                  </div>
                </>
              ) : search.trim() ? (
                <ul className="divide-y divide-stone-100">
                  {searchHits.templates.map((t) => {
                    const form = getClass(t.classId);
                    const locked = form ? formLocked(form) : false;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          disabled={busy || locked}
                          onClick={() => createDoc(t.id)}
                          className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50 disabled:opacity-50"
                        >
                          <div className="font-medium text-stone-900">{t.title}</div>
                          <div className="mt-0.5 text-xs text-stone-500">
                            {templateBreadcrumb(t)}
                            {locked ? ' · Self-hosted plan required' : ''}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  {searchHits.forms.map((f) => (
                    <li key={`form-${f.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setCategoryId(f.parentId || null);
                          setFormId(f.id);
                        }}
                        className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50"
                      >
                        <div className="font-medium text-stone-900">{f.title}</div>
                        <div className="mt-0.5 text-xs text-stone-500">
                          Form · {getClass(f.parentId || '')?.title || f.parentId}
                        </div>
                      </button>
                    </li>
                  ))}
                  {searchHits.categories.map((c) => (
                    <li key={`cat-${c.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setCategoryId(c.id);
                          setFormId(null);
                        }}
                        className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50"
                      >
                        <div className="font-medium text-stone-900">{c.title}</div>
                        <div className="mt-0.5 text-xs text-stone-500">Category</div>
                      </button>
                    </li>
                  ))}
                  {!searchHits.templates.length &&
                    !searchHits.forms.length &&
                    !searchHits.categories.length && (
                      <li className="px-3 py-6 text-center text-sm text-stone-500">No matches</li>
                    )}
                </ul>
              ) : level === 'category' ? (
                <ul className="divide-y divide-stone-100">
                  <li>
                    <button
                      type="button"
                      onClick={handleCreateFolder}
                      className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50"
                    >
                      <div className="font-medium text-black">New notebook</div>
                      <div className="mt-0.5 text-xs text-neutral-600">
                        Organize documents in My Library
                      </div>
                    </button>
                  </li>
                  {listPersonalTemplates(session.pnIdentifier).length > 0 && (
                    <li className="bg-stone-50 px-3 py-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                        Yours
                      </div>
                      <ul className="divide-y divide-stone-100 rounded-md border border-stone-200 bg-white">
                        {personalTemplatesAsPenTemplates(session.pnIdentifier).map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => createDoc(t.id)}
                              className="w-full px-3 py-2.5 text-left hover:bg-stone-50 disabled:opacity-50"
                            >
                              <div className="font-medium text-stone-900">{t.title}</div>
                              <div className="mt-0.5 text-xs text-stone-500">{t.description}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                  {visibleCategories.map((c) => {
                    const pinned = pins.includes(c.id);
                    return (
                      <li key={c.id} className="flex items-stretch gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryId(c.id);
                            setFormId(null);
                          }}
                          className="min-w-0 flex-1 rounded-lg px-3 py-3 text-left hover:bg-stone-50"
                        >
                          <div className="font-medium text-stone-900">{c.title}</div>
                          <div className="mt-0.5 text-xs text-stone-500">{c.description}</div>
                        </button>
                        <button
                          type="button"
                          title={pinned ? 'Unpin' : 'Pin'}
                          aria-pressed={pinned}
                          onClick={() =>
                            setPins(togglePinnedCategory(session.pnIdentifier, c.id))
                          }
                          className={`shrink-0 px-3 text-sm ${
                            pinned ? 'text-amber-700' : 'text-stone-400 hover:text-stone-600'
                          }`}
                        >
                          {pinned ? '★' : '☆'}
                        </button>
                      </li>
                    );
                  })}
                  {visibleCategories.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-stone-500">
                      No pinned categories. Enable Show all or pin one.
                    </li>
                  )}
                </ul>
              ) : level === 'form' ? (
                <ul className="divide-y divide-stone-100">
                  {categoryId === 'projects' && (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setLibraryPickMode(true);
                          setLibrarySelectedIds(new Set());
                        }}
                        className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50"
                      >
                        <div className="font-medium text-black">From My Library…</div>
                        <div className="mt-0.5 text-xs text-neutral-600">
                          Select existing documents and port them into one project space
                        </div>
                      </button>
                    </li>
                  )}
                  {forms.map((f) => {
                    const locked = formLocked(f);
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            if (locked) return;
                            setFormId(f.id);
                          }}
                          className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50 disabled:opacity-50"
                        >
                          <div className="font-medium text-stone-900">{f.title}</div>
                          <div className="mt-0.5 text-xs text-stone-500">
                            {locked
                              ? 'Self-hosted plan required'
                              : f.description}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {formTemplates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => createDoc(t.id)}
                        className="w-full rounded-lg px-3 py-3 text-left hover:bg-stone-50 disabled:opacity-50"
                      >
                        <div className="font-medium text-stone-900">{t.title}</div>
                        <div className="mt-0.5 text-xs text-stone-500">{t.description}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
