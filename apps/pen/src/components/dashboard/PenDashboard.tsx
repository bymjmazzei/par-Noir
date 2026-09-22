import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  docToHtml,
  getClass,
  getTemplate,
  normalizeSection
} from '@par-noir/pen-protocol';
import { PackedGrid } from '../../layout';
import type { PenSession } from '../../App';
import type { LocalDocSummary } from '../../services/penLocalStore';
import { loadLocalDoc } from '../../services/penLocalStore';
import { createDocFromTemplate } from '../../services/createDocFromTemplate';
import { TemplateLivePreview } from '../TemplateLivePreview';
import {
  DASHBOARD_SLOTS,
  loadDashboardPrefs,
  setDashboardBind,
  setDashboardLayout,
  type DashboardPrefs,
  type DashboardSlotId
} from '../../services/penClassPrefs';

const SLOT_TINT: Record<DashboardSlotId, string> = {
  calendar: 'from-teal-900 to-teal-800',
  schedule: 'from-stone-800 to-stone-700',
  todo: 'from-amber-900 to-amber-800',
  recent_notes: 'from-sky-950 to-sky-900'
};

function resolveClassId(d: LocalDocSummary): string | undefined {
  if (d.classId) return d.classId;
  return getTemplate(d.templateId)?.classId;
}

function MiniDocPreview({ pn, docId }: { pn: string; docId: string }) {
  const bundle = loadLocalDoc(pn, docId);
  if (!bundle) {
    return <p className="p-3 text-xs text-stone-400">Missing doc</p>;
  }
  const form = getClass(bundle.manifest.classId);
  if (form?.parentId === 'social') {
    return (
      <div className="h-full overflow-hidden bg-stone-100/80 p-2">
        <TemplateLivePreview
          manifest={bundle.manifest}
          sections={bundle.sections}
          compact
        />
      </div>
    );
  }
  const html = bundle.sections
    .slice(0, 2)
    .map((s) => docToHtml(normalizeSection(s).doc))
    .filter(Boolean)
    .join('');
  return (
    <div
      className="pen-rich-html h-full overflow-hidden bg-gradient-to-b from-stone-50 to-white p-3 text-[11px] leading-snug text-stone-700"
      dangerouslySetInnerHTML={{
        __html: html || '<p class="text-stone-400">Empty</p>'
      }}
    />
  );
}

function WidgetBody({
  slot,
  prefs,
  session,
  docs,
  busy,
  onCreate,
  onChoose
}: {
  slot: DashboardSlotId;
  prefs: DashboardPrefs;
  session: PenSession;
  docs: LocalDocSummary[];
  busy: boolean;
  onCreate: (slot: DashboardSlotId) => void;
  onChoose: (slot: DashboardSlotId) => void;
}) {
  const meta = DASHBOARD_SLOTS.find((s) => s.id === slot)!;

  if (slot === 'recent_notes') {
    const notes = docs
      .filter((d) => {
        const c = resolveClassId(d);
        return c === 'social.note' || c === 'projects.journal';
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
    if (!notes.length) {
      return <p className="p-4 text-sm text-stone-500">No notes yet. Create one from New…</p>;
    }
    return (
      <ul className="divide-y divide-white/10 text-sm">
        {notes.map((d) => (
          <li key={d.docId}>
            <Link
              to={`/d/${d.docId}`}
              className="block truncate px-3 py-2.5 text-stone-800 hover:bg-teal-50/80"
              onClick={(e) => e.stopPropagation()}
            >
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const boundId = prefs.binds[slot];
  if (!boundId) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 bg-gradient-to-br from-stone-50 to-stone-100/80 p-4">
        <p className="text-sm text-stone-500">No {meta.title.toLowerCase()} linked.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onCreate(slot);
            }}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onChoose(slot);
            }}
            className="rounded-md border border-stone-300 bg-white/80 px-3 py-1.5 text-xs text-stone-700 disabled:opacity-50"
          >
            Choose…
          </button>
        </div>
      </div>
    );
  }

  const title =
    docs.find((d) => d.docId === boundId)?.title ||
    loadLocalDoc(session.pnIdentifier, boundId)?.manifest.title ||
    boundId;

  return (
    <div className="flex h-full flex-col">
      <Link
        to={`/d/${boundId}`}
        className="shrink-0 truncate border-b border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-medium text-stone-900 hover:bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {title}
      </Link>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MiniDocPreview pn={session.pnIdentifier} docId={boundId} />
      </div>
      <button
        type="button"
        className="shrink-0 border-t border-stone-200/80 bg-white/60 px-3 py-1.5 text-left text-[11px] text-stone-500 hover:bg-white"
        onClick={(e) => {
          e.stopPropagation();
          onChoose(slot);
        }}
      >
        Change…
      </button>
    </div>
  );
}

export function PenDashboard({
  session,
  docs,
  onDocsChange
}: {
  session: PenSession;
  docs: LocalDocSummary[];
  onDocsChange: () => void;
}) {
  const [prefs, setPrefs] = useState(() => loadDashboardPrefs(session.pnIdentifier));
  const [busy, setBusy] = useState(false);
  const [chooser, setChooser] = useState<DashboardSlotId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleLayout = useMemo(() => {
    const hidden = new Set(prefs.hidden || []);
    return prefs.layout.filter((i) => !hidden.has(i.id));
  }, [prefs]);

  async function handleCreate(slot: DashboardSlotId) {
    const meta = DASHBOARD_SLOTS.find((s) => s.id === slot);
    if (!meta?.templateId) return;
    setBusy(true);
    setError(null);
    try {
      const bundle = await createDocFromTemplate({
        session,
        templateId: meta.templateId
      });
      const next = setDashboardBind(session.pnIdentifier, slot, bundle.manifest.docId);
      setPrefs(next);
      onDocsChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  function handleChoose(slot: DashboardSlotId) {
    setChooser(slot);
  }

  function confirmChoose(docId: string) {
    if (!chooser) return;
    const next = setDashboardBind(session.pnIdentifier, chooser, docId);
    setPrefs(next);
    setChooser(null);
  }

  const chooserMeta = chooser ? DASHBOARD_SLOTS.find((s) => s.id === chooser) : null;
  const chooserDocs = chooserMeta?.classId
    ? docs.filter((d) => resolveClassId(d) === chooserMeta.classId)
    : [];

  return (
    <div className="relative">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <PackedGrid
        className="min-h-[min(70vh,36rem)] w-full gap-4 p-1"
        tiles={visibleLayout}
        onChange={(layout) => {
          const next = setDashboardLayout(session.pnIdentifier, layout);
          setPrefs(next);
        }}
        renderTile={(tile) => {
          const slot = tile.id;
          const title = DASHBOARD_SLOTS.find((s) => s.id === slot)?.title || slot;
          return (
            <div className="flex h-full min-h-[12rem] flex-col overflow-hidden rounded-xl border border-stone-800/10 bg-white shadow-[0_8px_30px_rgba(28,25,23,0.08)] ring-1 ring-stone-900/5">
              <div
                className={`flex shrink-0 items-center justify-between bg-gradient-to-r px-3 py-2 text-white ${SLOT_TINT[slot]}`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                  {title}
                </span>
                <span className="text-[10px] opacity-60" title="Drag tile to swap">
                  ⋮⋮
                </span>
              </div>
              <div className="min-h-0 flex-1 bg-stone-50/50" onPointerDown={(e) => e.stopPropagation()}>
                <WidgetBody
                  slot={slot}
                  prefs={prefs}
                  session={session}
                  docs={docs}
                  busy={busy}
                  onCreate={handleCreate}
                  onChoose={handleChoose}
                />
              </div>
            </div>
          );
        }}
      />

      {chooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-stone-900">
                Choose {chooserMeta?.title}
              </h3>
              <button
                type="button"
                className="text-sm text-stone-500"
                onClick={() => setChooser(null)}
              >
                Cancel
              </button>
            </div>
            <ul className="max-h-[50vh] divide-y divide-stone-100 overflow-auto">
              {chooserDocs.map((d) => (
                <li key={d.docId}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm hover:bg-stone-50"
                    onClick={() => confirmChoose(d.docId)}
                  >
                    <div className="font-medium text-stone-900">{d.title}</div>
                    <div className="text-xs text-stone-500">
                      {getClass(resolveClassId(d) || '')?.title || d.templateId}
                    </div>
                  </button>
                </li>
              ))}
              {!chooserDocs.length && (
                <li className="px-4 py-8 text-center text-sm text-stone-500">
                  No matching docs. Create one instead.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
