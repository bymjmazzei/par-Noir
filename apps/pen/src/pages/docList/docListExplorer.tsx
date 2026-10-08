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
import type { PenSession } from '../../services/penSession';
import {
  deleteLocalDocs,
  loadLocalDoc,
  moveLocalDocToFolder,
  renameLocalDoc,
  type LocalDocSummary
} from '../../services/penLocalStore';
import { deleteDocCloud, updateDocMetaCloud } from '../../services/penCloudStore';
import {
  createFolder,
  deleteFolder,
  ensureMyTemplatesNotebook,
  listChildFolders,
  listFolders,
  MY_TEMPLATES_NOTEBOOK_NAME,
  renameFolder,
  type PenFolder
} from '../../services/penFolders';
import { fetchPenCatalog, fetchStorageTier } from '../../services/penApi';
import {
  loadBrowseDensity,
  loadPinnedCategoryIds,
  saveBrowseDensity,
  togglePinnedCategory,
  type PenBrowseDensity
} from '../../services/penClassPrefs';
import {
  createDocFromPersonalOrStarter,
  createProjectFromLibrary
} from '../../services/penPublish';
import {
  listPersonalTemplates,
  personalTemplatesAsPenTemplates
} from '../../services/penPersonalTemplates';
import { FormDocIcon } from '../../components/FormDocIcon';
import { ExplorerFolderGlyph } from '../../components/ExplorerFolderGlyph';
import { DocGalleryPreview } from '../../components/DocGalleryPreview';
import { SocialFeedPhonePreview } from '../../components/SocialFeedPhonePreview';
import { DocItemMenu } from '../../components/DocItemMenu';
import {
  CreateNewGalleryThumb,
  NotebookGalleryThumb,
  TemplateGalleryThumb
} from '../../components/TemplateGalleryThumb';
import { PenNotebookPage } from '../../components/PenNotebookPage';
import { DocFeedScroller } from '../../components/DocFeedScroller';
import { ClassFeedRail } from '../../components/ClassFeedRail';
import {
  buildSocialTemplateRailItems,
  libraryDocMatchesRailSelection,
  resolveSummaryClassId
} from '../../services/classFeedRailItems';
import { BlankDocWizard } from '../../components/BlankDocWizard';
import { createBlankDoc } from '../../services/createBlankDoc';
import { resolveDocLibraryStatus } from '../../services/penDocStatus';
import { categoryIdForClass } from '@par-noir/pen-protocol';

import type { ExplorerSort, ExplorerSortKey } from './docListTypes';
import { DEFAULT_EXPLORER_SORT } from './docListTypes';

export function isConsumerClass(c: PenClass): boolean {
  return !c.audience || c.audience === 'consumer';
}

function resolveDocClassId(d: LocalDocSummary): string | undefined {
  if (d.classId) return d.classId;
  return getTemplate(d.templateId)?.classId;
}

export function sortDocs(docs: LocalDocSummary[], sort: ExplorerSort): LocalDocSummary[] {
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
    <th className={`${className} px-3 ${align === 'right' ? 'text-right' : ''}`}>
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
      className={`pen-explorer-row ${selected ? 'pen-explorer-row--selected' : ''} ${
        indented ? 'pen-explorer-row--child' : ''
      }`}
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
      <td
        className={`pen-explorer-name-cell px-3 py-2 ${indented ? 'pen-explorer-name-indent' : ''}`}
      >
        {bulkMode ? (
          <span className="pen-explorer-name-label truncate font-medium text-black">
            <span className="pen-explorer-twisty-spacer" aria-hidden />
            <FormDocIcon classId={classId} compact />
            <span className="min-w-0 truncate">{d.title || 'Untitled'}</span>
          </span>
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
            className="pen-explorer-name-label truncate text-left font-medium text-black hover:underline"
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
            <span className="pen-explorer-twisty-spacer" aria-hidden />
            <FormDocIcon classId={classId} compact />
            <span className="min-w-0 truncate">{d.title || 'Untitled'}</span>
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
    <tr
      className={`pen-explorer-row pen-explorer-row--folder ${
        expanded ? 'pen-explorer-row--folder-open' : ''
      }`}
    >
      <td className="pen-explorer-action px-2 py-2 text-center">
        <span className="inline-block h-4 w-4" aria-hidden />
      </td>
      <td className="pen-explorer-name-cell px-3 py-2">
        <button
          type="button"
          onClick={onToggleExpand}
          onDoubleClick={(e) => {
            e.preventDefault();
            onRename();
          }}
          className="pen-explorer-name-label truncate text-black hover:underline"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${notebook.name}` : `Expand ${notebook.name}`}
        >
          <span className="pen-explorer-chevron" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <ExplorerFolderGlyph open={expanded} />
          <span className="min-w-0 truncate">{notebook.name}</span>
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

export function DocExplorerTable({
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
      <div className="pen-explorer-scroll">
        <table className="pen-explorer-table text-left text-sm">
          <thead className="text-[11px] tracking-wide">
            <tr>
              <th className="pen-explorer-action px-2 text-center" aria-label="Select" />
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
              <th className="pen-explorer-col-status px-3 text-left">
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
                        className="pen-explorer-row pen-explorer-row--child cursor-pointer"
                        onClick={() => onOpenPersonalTemplate?.(t.id)}
                      >
                        <td className="pen-explorer-action px-2 py-2" />
                        <td className="pen-explorer-name-cell pen-explorer-name-indent px-3 py-2 font-medium text-black">
                          <span className="pen-explorer-name-label">
                            <span className="pen-explorer-twisty-spacer" aria-hidden />
                            <span className="min-w-0 truncate">{t.title}</span>
                          </span>
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
                className="pen-explorer-row cursor-pointer"
                onClick={() => onOpenPersonalTemplate?.(t.id)}
              >
                <td className="pen-explorer-action px-2 py-2" />
                <td className="pen-explorer-name-cell px-3 py-2 font-medium text-black">
                  <span className="pen-explorer-name-label">
                    <span className="pen-explorer-twisty-spacer" aria-hidden />
                    <span className="min-w-0 truncate">{t.title}</span>
                  </span>
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
  );
}

export function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12zM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  onDelete,
  session
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
  session?: PenSession | null;
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
          preferAbove
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
        categoryIdForClass(bundle.manifest.classId || '') === 'social' ? (
          <SocialFeedPhonePreview
            density="thumb"
            manifest={bundle.manifest}
            sections={bundle.sections}
            session={session}
            templateId={
              bundle.manifest.templateId ||
              bundle.manifest.basedOnTemplateId ||
              bundle.manifest.docId
            }
            phoneActiveFeedId="public"
          />
        ) : (
          <DocGalleryPreview
            manifest={bundle.manifest}
            sections={bundle.sections}
            session={session}
          />
        )
      ) : (
        <div className="pen-gallery-doc-page pen-gallery-doc-page--paper">
          <div className="pen-gallery-doc-paper-title">{title}</div>
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
            preferAbove
            onRename={onRename}
            onMove={() => undefined}
            onDelete={onDelete}
          />
        </div>
        <button type="button" onClick={onOpen} className="pen-gallery-tile-preview">
          <NotebookGalleryThumb />
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
        <span className="pen-gallery-tile-preview">
          <CreateNewGalleryThumb />
        </span>
      </button>
    </div>
  );
}

function PersonalTemplateGalleryCard({
  pn,
  templateId,
  title,
  onOpen,
  session
}: {
  pn: string;
  templateId: string;
  title: string;
  onOpen: () => void;
  session?: PenSession | null;
}) {
  return (
    <div className="pen-gallery-slot">
      <button type="button" onClick={onOpen} className="pen-gallery-tile">
        <div className="pen-gallery-tile-title">
          <span className="pen-gallery-tile-title-text">{title}</span>
        </div>
        <span className="pen-gallery-tile-preview">
          <TemplateGalleryThumb pn={pn} templateId={templateId} session={session} />
        </span>
      </button>
    </div>
  );
}

export function DocGalleryGrid({
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
  onDeleteFolder,
  session
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
  session?: PenSession | null;
}) {
  return (
    <div className="pen-gallery-wrap">
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
                pn={pn}
                templateId={t.id}
                title={t.title}
                onOpen={() => onOpenPersonalTemplate?.(t.id)}
                session={session}
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
              session={session}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BulkInlineControls({
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
