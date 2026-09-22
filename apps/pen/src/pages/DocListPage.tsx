import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  emptySection,
  getClass,
  getTemplate,
  listConsumerClasses,
  listStarterTemplates,
  listTemplatesByClass,
  requireTemplate,
  searchPenCatalog,
  signGenesis,
  hashSectionContent,
  notaryHashForGenesis,
  attachNotary,
  type PenClass,
  type PenDocManifest,
  type PenHistoryChain,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { generateGroupId, generateChatKey } from '@par-noir/dm-crypto';
import type { PenSession } from '../App';
import type { LocalDocSummary } from '../services/penLocalStore';
import { saveLocalDoc } from '../services/penLocalStore';
import { fetchPenCatalog, fetchStorageTier, requestNotaryStamp } from '../services/penApi';
import {
  loadHomeView,
  loadPinnedCategoryIds,
  saveHomeView,
  togglePinnedCategory,
  type PenHomeView
} from '../services/penClassPrefs';
import { resolveSigningKeys } from '../services/penKeys';

function randomDocId(): string {
  return `pen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

type DrillLevel = 'category' | 'form' | 'template';

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

function DocRow({ d }: { d: LocalDocSummary }) {
  return (
    <li>
      <Link
        to={`/d/${d.docId}`}
        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-stone-50"
      >
        <div className="min-w-0">
          <div className="truncate font-medium text-stone-900">{d.title}</div>
          <div className="truncate text-xs text-stone-500">{d.templateId}</div>
        </div>
        <div className="shrink-0 text-xs text-stone-400">
          {new Date(d.updatedAt).toLocaleString()}
        </div>
      </Link>
    </li>
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
  const [pickerOpen, setPickerOpen] = useState(docs.length === 0);
  const [search, setSearch] = useState('');
  const [pins, setPins] = useState(() => loadPinnedCategoryIds(session.pnIdentifier));
  const [showAll, setShowAll] = useState(() => loadPinnedCategoryIds(session.pnIdentifier).length === 0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [storageTier, setStorageTier] = useState<string | null>(null);
  const [homeView, setHomeView] = useState<PenHomeView>(() => loadHomeView(session.pnIdentifier));
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => new Set());

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
    setPickerOpen(true);
  }

  function setView(view: PenHomeView) {
    setHomeView(view);
    saveHomeView(session.pnIdentifier, view);
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
      const template =
        templates.find((t) => t.id === templateId) || requireTemplate(templateId);
      const form = getClass(template.classId);
      if (form?.entitlement === 'self-hosted' && !feedEntitled) {
        throw new Error('self_hosted_plan_required');
      }

      const docId = randomDocId();
      const now = new Date().toISOString();
      const sections = template.sections.map((s) => emptySection(s.slug));
      const commitment = hashSectionContent(
        new TextEncoder().encode(JSON.stringify(sections))
      );
      const keys = resolveSigningKeys(session);

      let genesis = signGenesis({
        docId,
        templateId: template.id,
        authorPn: session.pnIdentifier,
        clientCreatedAt: now,
        contentCommitment: commitment,
        secretKey: keys.secretKey,
        publicKey: keys.publicKey
      });

      try {
        const notary = await requestNotaryStamp(
          session.accessToken,
          notaryHashForGenesis(genesis)
        );
        attachNotary(genesis, notary);
      } catch {
        /* optional */
      }

      const groupId = generateGroupId();
      sessionStorage.setItem(`pen_doc_key:${docId}`, generateChatKey());
      sessionStorage.setItem(`pen_group_id:${docId}`, groupId);

      const manifest: PenDocManifest = {
        docId,
        title: `Untitled ${template.title}`,
        docType: template.docType,
        classId: template.classId,
        templateId: template.id,
        templateVersion: template.version,
        groupId,
        toc: template.sections.map((s) => s.slug),
        createdAt: now,
        updatedAt: now,
        genesisProof: genesis
      };

      const chain: PenHistoryChain = { docId, genesis, links: [] };
      saveLocalDoc(session.pnIdentifier, { manifest, sections, chain });
      onDocsChange();
      setPickerOpen(false);
      navigate(`/d/${docId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  function breadcrumbTitle(): string {
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
    () =>
      [...docs].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [docs]
  );

  return (
    <div className="min-h-[calc(100vh-2.5rem)] bg-stone-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Documents</h1>
            <p className="text-sm text-stone-500">Open a file or start from a template.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {docs.length > 0 && (
              <div
                className="flex rounded border border-stone-300 bg-white text-sm"
                role="group"
                aria-label="Document list view"
              >
                <button
                  type="button"
                  aria-pressed={homeView === 'all'}
                  onClick={() => setView('all')}
                  className={`px-2.5 py-1.5 ${
                    homeView === 'all'
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  aria-pressed={homeView === 'category'}
                  onClick={() => setView('category')}
                  className={`border-l border-stone-300 px-2.5 py-1.5 ${
                    homeView === 'category'
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  By category
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={openPicker}
              className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
            >
              New…
            </button>
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
            <p className="text-stone-600">No documents yet.</p>
            <button
              type="button"
              className="mt-4 text-sm text-sky-700 underline"
              onClick={openPicker}
            >
              Choose a template
            </button>
          </div>
        ) : homeView === 'all' ? (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {sortedDocs.map((d) => (
              <DocRow key={d.docId} d={d} />
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            {docsByCategory.map((g) => {
              const open = expandedCats.has(g.categoryId);
              return (
                <div
                  key={g.categoryId}
                  className="overflow-hidden rounded-lg border border-stone-200 bg-white"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleExpanded(g.categoryId)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-stone-50"
                  >
                    <span className="font-medium text-stone-900">
                      {g.title}
                      <span className="ml-2 text-xs font-normal text-stone-400">
                        {g.docs.length}
                      </span>
                    </span>
                    <span className="text-stone-400">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && (
                    <ul className="divide-y divide-stone-100 border-t border-stone-100">
                      {g.docs.map((d) => (
                        <DocRow key={d.docId} d={d} />
                      ))}
                    </ul>
                  )}
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
                  {(categoryId || formId || search.trim()) && (
                    <button
                      type="button"
                      className="shrink-0 text-sm text-stone-500 hover:text-stone-800"
                      onClick={() => {
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
                  <h2 className="truncate text-sm font-semibold text-stone-900">
                    {breadcrumbTitle()}
                  </h2>
                </div>
                {docs.length > 0 && (
                  <button
                    type="button"
                    className="shrink-0 text-sm text-stone-500 hover:text-stone-800"
                    onClick={() => setPickerOpen(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories, forms, templates…"
                className="mt-2 w-full rounded border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-stone-500"
              />
              {!search.trim() && level === 'category' && (
                <label className="mt-2 flex items-center gap-2 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={showAll}
                    onChange={(e) => setShowAll(e.target.checked)}
                  />
                  Show all categories
                  {pins.length > 0 && !showAll && (
                    <span className="text-stone-400">({pins.length} pinned)</span>
                  )}
                </label>
              )}
            </div>

            {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {search.trim() ? (
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
