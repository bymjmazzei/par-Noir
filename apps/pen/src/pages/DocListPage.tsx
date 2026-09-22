import { useEffect, useMemo, useState } from 'react';
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
  type LocalDocSummary
} from '../services/penLocalStore';
import { fetchPenCatalog, fetchStorageTier } from '../services/penApi';
import {
  loadBrowseDensity,
  loadHomeView,
  loadPinnedCategoryIds,
  saveBrowseDensity,
  saveHomeView,
  togglePinnedCategory,
  type PenBrowseDensity,
  type PenHomeView
} from '../services/penClassPrefs';
import {
  createDocFromPersonalOrStarter,
  createProjectFromLibrary
} from '../services/penPublish';
import {
  listPersonalTemplates,
  personalTemplatesAsPenTemplates
} from '../services/penPersonalTemplates';
import { PenDashboard } from '../components/dashboard/PenDashboard';
import { FormDocIcon } from '../components/FormDocIcon';
import { TemplateLivePreview } from '../components/TemplateLivePreview';

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

function resolveDocCategoryId(d: LocalDocSummary): string | null {
  const classId = resolveDocClassId(d);
  if (!classId) return null;
  const form = getClass(classId);
  return form?.parentId || null;
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
    <th className={`${className} px-3 py-2 ${align === 'right' ? 'text-right' : ''}`}>
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
  bulkMode,
  selected,
  onToggle
}: {
  d: LocalDocSummary;
  bulkMode: boolean;
  selected: boolean;
  onToggle: (docId: string) => void;
}) {
  const classId = resolveDocClassId(d);
  const form = classId ? getClass(classId) : undefined;
  const category = form?.parentId ? getClass(form.parentId) : undefined;
  return (
    <tr
      className={`${selected ? 'bg-blue-50/40' : ''} hover:bg-neutral-50`}
      onClick={() => {
        if (bulkMode) onToggle(d.docId);
      }}
    >
      <td className="pen-explorer-action w-10 px-2 py-2 text-center">
        {bulkMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(d.docId)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 accent-black"
            aria-label={`Select ${d.title || 'document'}`}
          />
        ) : null}
      </td>
      <td className="pen-explorer-icon w-10 px-1 py-2">
        <FormDocIcon classId={classId} />
      </td>
      <td className="pen-explorer-name-cell px-3 py-2">
        {bulkMode ? (
          <span className="truncate font-medium text-black">{d.title || 'Untitled'}</span>
        ) : (
          <Link to={`/d/${d.docId}`} className="truncate font-medium text-black hover:underline">
            {d.title || 'Untitled'}
          </Link>
        )}
      </td>
      <td className="hidden px-3 py-2 text-xs text-black sm:table-cell">
        {category?.title || '—'}
      </td>
      <td className="hidden px-3 py-2 text-xs text-black md:table-cell">
        {form?.title || '—'}
      </td>
      <td className="hidden px-3 py-2 text-xs text-black lg:table-cell">{d.templateId}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-black">
        {new Date(d.updatedAt).toLocaleString()}
      </td>
    </tr>
  );
}

function DocExplorerTable({
  docs,
  sort,
  onSort,
  bulkMode,
  selectedIds,
  onToggle,
  onToggleBulk,
  onSelectAll,
  onDelete
}: {
  docs: LocalDocSummary[];
  sort: ExplorerSort;
  onSort: (key: ExplorerSortKey) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggle: (docId: string) => void;
  onToggleBulk: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="pen-explorer overflow-hidden" data-bulk={bulkMode ? 'true' : 'false'}>
      {bulkMode && (
        <BulkDeleteBar
          compact
          visibleDocs={docs}
          selectedIds={selectedIds}
          onSelectAll={onSelectAll}
          onDelete={onDelete}
          onCancel={onToggleBulk}
        />
      )}
      <div className="pen-explorer-sheet">
        <div className="pen-explorer-rail" aria-hidden />
        <table className="w-full table-fixed text-left text-sm">
          <thead className="sticky top-0 text-[11px] tracking-wide">
            <tr>
              <th className="pen-explorer-action w-10 px-2 py-2 text-center">
                <button
                  type="button"
                  title={bulkMode ? 'Cancel selection' : 'Select to delete'}
                  aria-label={bulkMode ? 'Cancel selection' : 'Select to delete'}
                  aria-pressed={bulkMode}
                  onClick={onToggleBulk}
                  className={`inline-flex h-7 w-7 items-center justify-center ${
                    bulkMode ? 'font-bold text-black' : 'text-neutral-600 hover:text-black'
                  }`}
                >
                  <MinusIcon />
                </button>
              </th>
              <th className="pen-explorer-icon w-10 px-1 py-2" aria-hidden />
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
                className="hidden w-28 sm:table-cell"
              />
              <SortHeader
                label="Form"
                sortKey="form"
                sort={sort}
                onSort={onSort}
                className="hidden w-28 md:table-cell"
              />
              <SortHeader
                label="Template"
                sortKey="template"
                sort={sort}
                onSort={onSort}
                className="hidden w-40 lg:table-cell"
              />
              <SortHeader
                label="Updated"
                sortKey="updated"
                sort={sort}
                onSort={onSort}
                align="right"
                className="w-40"
              />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <DocExplorerRow
                key={d.docId}
                d={d}
                bulkMode={bulkMode}
                selected={selectedIds.has(d.docId)}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
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

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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

function DocGalleryCard({
  pn,
  d,
  bulkMode,
  selected,
  onToggle
}: {
  pn: string;
  d: LocalDocSummary;
  bulkMode: boolean;
  selected: boolean;
  onToggle: (docId: string) => void;
}) {
  const bundle = loadLocalDoc(pn, d.docId);
  const classId = resolveDocClassId(d);
  const body = (
    <>
      <div className="relative h-48 overflow-hidden bg-neutral-50">
        {bulkMode && (
          <div className="absolute left-2 top-2 z-10">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(d.docId)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 accent-black"
              aria-label={`Select ${d.title || 'document'}`}
            />
          </div>
        )}
        {bundle ? (
          <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden pt-2">
            <TemplateLivePreview
              manifest={bundle.manifest}
              sections={bundle.sections}
              compact
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-600">
            No preview
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-blue-500 px-3 py-2">
        <FormDocIcon classId={classId} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-black">{d.title}</div>
          <div className="truncate text-[11px] text-black">
            {getClass(classId || '')?.title || d.templateId}
          </div>
        </div>
      </div>
    </>
  );

  if (bulkMode) {
    return (
      <button
        type="button"
        onClick={() => onToggle(d.docId)}
        className={`flex flex-col overflow-hidden text-left ${
          selected ? 'ring-2 ring-black' : ''
        }`}
      >
        {body}
      </button>
    );
  }

  return (
    <Link to={`/d/${d.docId}`} className="group flex flex-col overflow-hidden">
      {body}
    </Link>
  );
}

function CreateNewGalleryTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[14rem] flex-col items-center justify-center gap-3 border border-dashed border-neutral-300 text-black hover:border-black"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center text-2xl font-light">+</span>
      <span className="text-sm font-bold">Create new</span>
    </button>
  );
}

function DocGalleryGrid({
  pn,
  docs,
  bulkMode,
  selectedIds,
  onToggle,
  onCreateNew
}: {
  pn: string;
  docs: LocalDocSummary[];
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggle: (docId: string) => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {!bulkMode && <CreateNewGalleryTile onClick={onCreateNew} />}
      {docs.map((d) => (
        <DocGalleryCard
          key={d.docId}
          pn={pn}
          d={d}
          bulkMode={bulkMode}
          selected={selectedIds.has(d.docId)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function BulkDeleteBar({
  visibleDocs,
  selectedIds,
  onSelectAll,
  onDelete,
  onCancel,
  compact
}: {
  visibleDocs: LocalDocSummary[];
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onDelete: () => void;
  onCancel: () => void;
  /** When true, sits above table headers (no extra bottom rule outside the explorer). */
  compact?: boolean;
}) {
  const selectedCount = visibleDocs.filter((d) => selectedIds.has(d.docId)).length;
  const allSelected = visibleDocs.length > 0 && selectedCount === visibleDocs.length;
  return (
    <div className={compact ? 'pen-explorer-bulk-bar' : 'mb-3 flex flex-wrap items-center justify-between gap-3'}>
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onSelectAll}
          className="font-bold text-black hover:opacity-60"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-neutral-600">{selectedCount} selected</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <button type="button" onClick={onCancel} className="text-neutral-600 hover:text-black">
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={selectedCount === 0}
          className="font-bold text-red-600 hover:opacity-70 disabled:opacity-30"
        >
          Delete ({selectedCount})
        </button>
      </div>
    </div>
  );
}

/** Quiet file-manager home — not a CMS dashboard. Templates open as a sheet. */
export function DocListPage({
  session,
  docs,
  onDocsChange
}: {
  session: PenSession;
  docs: LocalDocSummary[];
  onDocsChange: () => void;
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
  const [search, setSearch] = useState('');
  const [pins, setPins] = useState(() => loadPinnedCategoryIds(session.pnIdentifier));
  const [showAll, setShowAll] = useState(() => loadPinnedCategoryIds(session.pnIdentifier).length === 0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [storageTier, setStorageTier] = useState<string | null>(null);
  const [homeView, setHomeView] = useState<PenHomeView>(() => loadHomeView(session.pnIdentifier));
  const [browseDensity, setBrowseDensity] = useState<PenBrowseDensity>(() =>
    loadBrowseDensity(session.pnIdentifier)
  );
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => new Set());
  const [explorerSort, setExplorerSort] = useState<ExplorerSort>(DEFAULT_EXPLORER_SORT);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [libraryPickMode, setLibraryPickMode] = useState(false);
  const [librarySelectedIds, setLibrarySelectedIds] = useState<Set<string>>(() => new Set());

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

  const docsByCategory = useMemo(() => {
    const sorted = [...docs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const groups: Array<{ categoryId: string; title: string; docs: LocalDocSummary[] }> = [];
    const byId = new Map<string, LocalDocSummary[]>();
    const other: LocalDocSummary[] = [];

    for (const d of sorted) {
      const catId = resolveDocCategoryId(d);
      if (!catId) {
        other.push(d);
        continue;
      }
      const list = byId.get(catId) || [];
      list.push(d);
      byId.set(catId, list);
    }

    for (const cat of categories) {
      const list = byId.get(cat.id);
      if (list?.length) groups.push({ categoryId: cat.id, title: cat.title, docs: list });
    }
    for (const [catId, list] of byId) {
      if (categories.some((c) => c.id === catId)) continue;
      if (!list.length) continue;
      const title = getClass(catId)?.title || catId;
      groups.push({ categoryId: catId, title, docs: list });
    }
    if (other.length) {
      groups.push({ categoryId: '_other', title: 'Other', docs: other });
    }
    return groups;
  }, [docs, categories]);

  useEffect(() => {
    if (homeView !== 'category') return;
    setExpandedCats(new Set(docsByCategory.map((g) => g.categoryId)));
  }, [homeView, docsByCategory]);

  const level: DrillLevel = formId ? 'template' : categoryId ? 'form' : 'category';

  const feedEntitled = storageTier === 'self-hosted';

  function formLocked(form: PenClass): boolean {
    return form.entitlement === 'self-hosted' && !feedEntitled;
  }

  function resetDrill() {
    setCategoryId(null);
    setFormId(null);
  }

  function openPicker() {
    setSearch('');
    resetDrill();
    setLibraryPickMode(false);
    setLibrarySelectedIds(new Set());
    setPickerOpen(true);
  }

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

  function setView(view: PenHomeView) {
    setHomeView(view);
    saveHomeView(session.pnIdentifier, view);
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

  function toggleExpanded(id: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    () => sortDocs(docs, explorerSort),
    [docs, explorerSort]
  );

  const sortedDocsByCategory = useMemo(
    () =>
      docsByCategory.map((g) => ({
        ...g,
        docs: sortDocs(g.docs, explorerSort)
      })),
    [docsByCategory, explorerSort]
  );

  return (
    <div className="min-h-[calc(100vh-2.5rem)] bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-black">My Library</h1>
            <p className="text-sm text-neutral-500">Open a file or start from a template.</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openPicker}
                title="New document"
                aria-label="New document"
                className="inline-flex h-8 w-8 items-center justify-center text-black hover:opacity-60"
              >
                <PlusIcon />
              </button>
            </div>
            {docs.length > 0 && (
              <>
                <div
                  className="flex items-center gap-0 text-sm"
                  role="group"
                  aria-label="Document list view"
                >
                  {(
                    [
                      ['all', 'All'],
                      ['category', 'Category'],
                      ['dashboard', 'Dashboard']
                    ] as const
                  ).map(([id, label], i) => (
                    <span key={id} className="flex items-center">
                      {i > 0 && <span className="px-2 text-neutral-300">|</span>}
                      <button
                        type="button"
                        aria-pressed={homeView === id}
                        onClick={() => {
                          setView(id);
                          if (id === 'dashboard') {
                            setBulkDeleteMode(false);
                            setSelectedIds(new Set());
                          }
                        }}
                        className={
                          homeView === id
                            ? 'font-bold text-black'
                            : 'font-normal text-neutral-600 hover:text-neutral-800'
                        }
                      >
                        {label}
                      </button>
                    </span>
                  ))}
                </div>
                {(homeView === 'all' || homeView === 'category') && (
                  <div className="flex items-center gap-3" role="group" aria-label="Browse density">
                    <button
                      type="button"
                      title="List"
                      aria-label="List view"
                      aria-pressed={browseDensity === 'list'}
                      onClick={() => setDensity('list')}
                      className={`inline-flex h-8 w-8 items-center justify-center ${
                        browseDensity === 'list'
                          ? 'font-bold text-black'
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
                          ? 'font-bold text-black'
                          : 'text-neutral-600 hover:text-neutral-800'
                      }`}
                    >
                      <GalleryIcon />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-neutral-500">No documents yet.</p>
            <button
              type="button"
              className="mt-4 text-sm font-bold text-black underline"
              onClick={openPicker}
            >
              Choose a template
            </button>
          </div>
        ) : homeView === 'dashboard' ? (
          <PenDashboard session={session} docs={docs} onDocsChange={onDocsChange} />
        ) : homeView === 'all' ? (
          <>
            {browseDensity === 'gallery' ? (
              <>
                {bulkDeleteMode && (
                  <BulkDeleteBar
                    visibleDocs={sortedDocs}
                    selectedIds={selectedIds}
                    onSelectAll={() => selectAllVisible(sortedDocs)}
                    onDelete={confirmBulkDelete}
                    onCancel={toggleBulkMode}
                  />
                )}
                <DocGalleryGrid
                  pn={session.pnIdentifier}
                  docs={sortedDocs}
                  bulkMode={bulkDeleteMode}
                  selectedIds={selectedIds}
                  onToggle={toggleDocSelection}
                  onCreateNew={openPicker}
                />
              </>
            ) : (
              <DocExplorerTable
                docs={sortedDocs}
                sort={explorerSort}
                onSort={cycleExplorerSort}
                bulkMode={bulkDeleteMode}
                selectedIds={selectedIds}
                onToggle={toggleDocSelection}
                onToggleBulk={toggleBulkMode}
                onSelectAll={() => selectAllVisible(sortedDocs)}
                onDelete={confirmBulkDelete}
              />
            )}
          </>
        ) : (
          <div className="space-y-1">
            {bulkDeleteMode && browseDensity === 'gallery' && (
              <BulkDeleteBar
                visibleDocs={sortedDocsByCategory.flatMap((g) => g.docs)}
                selectedIds={selectedIds}
                onSelectAll={() =>
                  selectAllVisible(sortedDocsByCategory.flatMap((g) => g.docs))
                }
                onDelete={confirmBulkDelete}
                onCancel={toggleBulkMode}
              />
            )}
            {sortedDocsByCategory.map((g) => {
              const open = expandedCats.has(g.categoryId);
              return (
                <div key={g.categoryId}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleExpanded(g.categoryId)}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm"
                  >
                    <span className="w-3 shrink-0 text-neutral-600" aria-hidden>
                      {open ? '▾' : '▸'}
                    </span>
                    <span className="font-bold text-black">{g.title}</span>
                    <span className="text-xs text-neutral-600">{g.docs.length}</span>
                  </button>
                  {open &&
                    (browseDensity === 'gallery' ? (
                      <div className="pb-3 pl-5">
                        <DocGalleryGrid
                          pn={session.pnIdentifier}
                          docs={g.docs}
                          bulkMode={bulkDeleteMode}
                          selectedIds={selectedIds}
                          onToggle={toggleDocSelection}
                          onCreateNew={openPicker}
                        />
                      </div>
                    ) : (
                      <div className="pb-3 pl-5">
                        <DocExplorerTable
                          docs={g.docs}
                          sort={explorerSort}
                          onSort={cycleExplorerSort}
                          bulkMode={bulkDeleteMode}
                          selectedIds={selectedIds}
                          onToggle={toggleDocSelection}
                          onToggleBulk={toggleBulkMode}
                          onSelectAll={() => selectAllVisible(g.docs)}
                          onDelete={confirmBulkDelete}
                        />
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
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
