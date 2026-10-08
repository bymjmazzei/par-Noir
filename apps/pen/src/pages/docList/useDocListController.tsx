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

import { useNavigate } from 'react-router-dom';
import type { PenSession } from '../../services/penSession';
import type { LocalDocSummary } from '../../services/penLocalStore';
import type { PenAddIntent, ExplorerSort } from './docListTypes';
import { DEFAULT_EXPLORER_SORT } from './docListTypes';
import {
  isConsumerClass,
  sortDocs,
  BulkInlineControls,
  MinusIcon,
  DocExplorerTable,
  DocGalleryGrid,
  NotebookExplorerRow,
  DocGalleryCard,
  NotebookGalleryCard,
  CreateNewGalleryTile,
  PersonalTemplateGalleryCard
} from './docListExplorer';

export type DocListReadyState = {
  phase: 'ready';
  [key: string]: unknown;
};

export type DocListControllerState = DocListReadyState;

export function useDocListController(props: {
  session: PenSession;
  docs: LocalDocSummary[];
  onDocsChange: () => void;
  onDocsRemoved?: (docIds: string[]) => void;
  addIntent?: PenAddIntent | null;
  onAddIntentConsumed?: () => void;
}): DocListControllerState {
  const { session, docs, onDocsChange, onDocsRemoved, addIntent = null, onAddIntentConsumed } = props;
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
  const deleteInFlight = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [blankWizardOpen, setBlankWizardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pins, setPins] = useState(() => loadPinnedCategoryIds(session.pnIdentifier));
  const [showAll, setShowAll] = useState(() => loadPinnedCategoryIds(session.pnIdentifier).length === 0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [storageTier, setStorageTier] = useState<string | null>(null);
  const [browseDensity, setBrowseDensity] = useState<PenBrowseDensity>(() =>
    loadBrowseDensity(session.pnIdentifier)
  );
  const [activeFeedClassId, setActiveFeedClassId] = useState('all');
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
        if (c.classes.length) {
          const remoteClasses = c.classes.filter(isConsumerClass);
          const classIds = new Set(remoteClasses.map((cl) => cl.id));
          setClasses([
            ...remoteClasses,
            ...listConsumerClasses().filter(
              (cl) =>
                (cl.id === 'widgets' || cl.parentId === 'widgets') && !classIds.has(cl.id)
            )
          ]);
        }
        if (c.templates.length) {
          const remoteTemplates = c.templates.filter((t) => {
            const form = getClass(t.classId) || c.classes.find((cl) => cl.id === t.classId);
            return !form || isConsumerClass(form);
          });
          const templateIds = new Set(remoteTemplates.map((t) => t.id));
          setTemplates([
            ...remoteTemplates,
            ...listStarterTemplates().filter(
              (t) =>
                t.classId.startsWith('widgets.') &&
                !templateIds.has(t.id)
            )
          ]);
        }
      })
      .catch(() => undefined);
    fetchStorageTier(session.accessToken, session.pnIdentifier).then(setStorageTier);
  }, [session.accessToken, session.pnIdentifier]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('template');
    if (!id) return;
    navigate(`/templates?template=${encodeURIComponent(id)}`);
  }, [navigate]);

  useEffect(() => {
    const onPrefs = () => {
      setPins(loadPinnedCategoryIds(session.pnIdentifier));
      setFolderTick((n) => n + 1);
    };
    window.addEventListener('pen-prefs-merged', onPrefs);
    return () => window.removeEventListener('pen-prefs-merged', onPrefs);
  }, [session.pnIdentifier]);

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
    setPickerOpen(false);
    setBulkDeleteMode(false);
    navigate('/templates');
  }

  function openMyTemplatesNotebook() {
    const nb = ensureMyTemplatesNotebook(session.pnIdentifier);
    setFolderTick((n) => n + 1);
    setCurrentFolderId(nb.id);
    setExpandedNotebookIds((prev) => new Set(prev).add(nb.id));
    setPickerOpen(false);
  }

  function createNotebookHere() {
    const name = window.prompt('Notebook name');
    if (!name?.trim()) return;
    createFolder(session.pnIdentifier, name.trim(), currentFolderId);
    setFolderTick((n) => n + 1);
  }

  useEffect(() => {
    if (!addIntent) return;
    if (addIntent === 'notebook') createNotebookHere();
    else if (addIntent === 'templates') openTemplatesView();
    else if (addIntent === 'my-templates') openMyTemplatesNotebook();
    else if (addIntent === 'blank') {
      setBlankWizardOpen(true);
    }
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
    if (density === 'feed') {
      setBulkDeleteMode(false);
      setSelectedIds(new Set());
    }
  }

  useEffect(() => {
    setActiveFeedClassId('all');
  }, [currentFolderId]);

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
    if (browseDensity === 'feed') {
      setBrowseDensity('list');
      saveBrowseDensity(session.pnIdentifier, 'list');
    }
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
    if (!ids.length || deleteInFlight.current) return;
    const ok = window.confirm(
      ids.length === 1
        ? 'Delete this document? This cannot be undone.'
        : `Delete ${ids.length} documents? This cannot be undone.`
    );
    if (!ok) return;
    void (async () => {
      deleteInFlight.current = true;
      setError(null);
      try {
        for (const docId of ids) {
          await deleteDocCloud({ userPnIdentifier: session.pnIdentifier, docId });
        }
        deleteLocalDocs(session.pnIdentifier, ids);
        setSelectedIds(new Set());
        setBulkDeleteMode(false);
        if (onDocsRemoved) onDocsRemoved(ids);
        else onDocsChange();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete document(s)');
      } finally {
        deleteInFlight.current = false;
      }
    })();
  }

  function startRename(docId: string, title: string) {
    setRenamingId(docId);
    setRenameDraft(title);
  }

  function commitRename() {
    if (!renamingId) return;
    const title = renameDraft;
    const docId = renamingId;
    renameLocalDoc(session.pnIdentifier, docId, title);
    setRenamingId(null);
    setRenameDraft('');
    onDocsChange();
    void updateDocMetaCloud({
      userPnIdentifier: session.pnIdentifier,
      docId,
      title
    }).catch(() => {
      /* offline — local wins until sync */
    });
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameDraft('');
  }

  function handleMoveDoc(docId: string, folderId: string | null) {
    moveLocalDocToFolder(session.pnIdentifier, docId, folderId);
    onDocsChange();
    void updateDocMetaCloud({
      userPnIdentifier: session.pnIdentifier,
      docId,
      folderId
    }).catch(() => {
      /* offline */
    });
  }

  function handleDeleteDoc(docId: string) {
    if (deleteInFlight.current) return;
    const ok = window.confirm('Delete this document? This cannot be undone.');
    if (!ok) return;
    void (async () => {
      deleteInFlight.current = true;
      setError(null);
      try {
        await deleteDocCloud({ userPnIdentifier: session.pnIdentifier, docId });
        deleteLocalDocs(session.pnIdentifier, [docId]);
        if (onDocsRemoved) onDocsRemoved([docId]);
        else onDocsChange();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete document');
      } finally {
        deleteInFlight.current = false;
      }
    })();
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

  const libraryRailItems = useMemo(() => buildSocialTemplateRailItems(), []);

  const docsForActiveRail = useMemo(
    () =>
      sortedDocs.filter((d) =>
        libraryDocMatchesRailSelection(resolveSummaryClassId(d), activeFeedClassId)
      ),
    [sortedDocs, activeFeedClassId]
  );

  const allDocsForActiveRail = useMemo(
    () =>
      docs.filter((d) =>
        libraryDocMatchesRailSelection(resolveSummaryClassId(d), activeFeedClassId)
      ),
    [docs, activeFeedClassId]
  );

  const folderDocsForActiveRail = useMemo(
    () =>
      folderDocs.filter((d) =>
        libraryDocMatchesRailSelection(resolveSummaryClassId(d), activeFeedClassId)
      ),
    [folderDocs, activeFeedClassId]
  );

  const librarySubtitle = currentFolder ? (
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
  );

  const trashTools =
    docs.length > 0 || allFolders.length > 0 ? (
      <div className="flex items-center justify-end gap-2">
        {bulkDeleteMode && browseDensity !== 'feed' && (
          <BulkInlineControls
            visibleDocs={browseDensity === 'list' ? listVisibleDocs : sortedDocs}
            selectedIds={selectedIds}
            onSelectAll={() =>
              selectAllVisible(browseDensity === 'list' ? listVisibleDocs : sortedDocs)
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
            bulkDeleteMode ? 'text-black' : 'text-neutral-600 hover:text-black'
          }`}
        >
          <MinusIcon />
        </button>
      </div>
    ) : null;

  return {
    phase: 'ready',
    session,
    docs,
    onDocsChange,
    onDocsRemoved,
    addIntent,
    onAddIntentConsumed,
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
  };
}
