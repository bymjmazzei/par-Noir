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

import type { DocListReadyState } from './useDocListController';
import {
  DocExplorerTable,
  DocGalleryGrid,
  BulkInlineControls,
  MinusIcon,
  NotebookExplorerRow,
  DocGalleryCard,
  NotebookGalleryCard,
  CreateNewGalleryTile,
  PersonalTemplateGalleryCard
} from './docListExplorer';

export function DocListShell(state: DocListReadyState) {
  const {
    session,
    docs,
    onDocsChange,
    onDocsRemoved,
    activeFeedClassId,
    allDocsForActiveRail,
    allFolders,
    blankWizardOpen,
    breadcrumbTitle,
    browseDensity,
    bulkDeleteMode,
    busy,
    cancelRename,
    categories,
    categoryId,
    childFolders,
    classes,
    commitRename,
    confirmBulkDelete,
    createDoc,
    createFromLibrarySelection,
    createNotebookHere,
    currentFolder,
    currentFolderId,
    cycleExplorerSort,
    deleteInFlight,
    docsForActiveRail,
    error,
    expandedNotebookIds,
    explorerSort,
    folderDocs,
    folderDocsForActiveRail,
    folderTick,
    formId,
    formLocked,
    formTemplates,
    forms,
    handleCreateFolder,
    handleDeleteDoc,
    handleDeleteFolder,
    handleMoveDoc,
    handleRenameFolder,
    libraryPickMode,
    libraryRailItems,
    librarySelectedIds,
    listVisibleDocs,
    moveFolderOptions,
    myPersonalTemplates,
    navigate,
    openMyTemplatesNotebook,
    openPersonalTemplate,
    openTemplatesView,
    personalTemplatesByNotebook,
    pickerOpen,
    pins,
    renameDraft,
    renamingId,
    rootNotebooks,
    search,
    searchHits,
    selectAllVisible,
    selectedIds,
    setDensity,
    showAll,
    sortedDocs,
    startRename,
    storageTier,
    templateBreadcrumb,
    templates,
    toggleBulkMode,
    toggleDocSelection,
    toggleLibraryDoc,
    toggleNotebookExpand,
    visibleCategories,
  } = state;
  return (
    <>
    <PenNotebookPage
      density={browseDensity}
      onDensity={setDensity}
      title="My Library"
      subtitle={librarySubtitle}
      showDensityTools={docs.length > 0 || allFolders.length > 0}
      toolsExtra={trashTools}
    >
      {docs.length === 0 && allFolders.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-neutral-500">No documents yet.</p>
          <button
            type="button"
            className="mt-4 text-sm font-bold text-black underline"
            onClick={openTemplatesView}
          >
            Browse templates
          </button>
        </div>
      ) : browseDensity === 'feed' ? (
        <DocFeedScroller
          pn={session.pnIdentifier}
          docs={sortedDocs}
          session={session}
          activeClassId={activeFeedClassId}
          onActiveClassId={setActiveFeedClassId}
          onOpenDoc={(docId) => navigate(`/d/${docId}`)}
        />
      ) : (
        <>
          <div className="pen-doc-feed-rail">
            <ClassFeedRail
              items={libraryRailItems}
              activeId={activeFeedClassId}
              onSelect={setActiveFeedClassId}
            />
          </div>
          {browseDensity === 'gallery' ? (
            <DocGalleryGrid
              pn={session.pnIdentifier}
              docs={docsForActiveRail}
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
              session={session}
            />
          ) : currentFolderId ? (
            <DocExplorerTable
              pn={session.pnIdentifier}
              docs={folderDocsForActiveRail}
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
              docs={allDocsForActiveRail}
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
        </>
      )}
    </PenNotebookPage>

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

      {blankWizardOpen ? (
        <BlankDocWizard
          busy={busy}
          error={error}
          onCancel={() => {
            setBlankWizardOpen(false);
            setError(null);
          }}
          onCreate={async (choice) => {
            setBusy(true);
            setError(null);
            try {
              const bundle = await createBlankDoc({ session, choice });
              setBlankWizardOpen(false);
              onDocsChange();
              navigate(`/d/${bundle.manifest.docId}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not create document');
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
}
