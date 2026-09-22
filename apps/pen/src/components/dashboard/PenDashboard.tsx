import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  docToPlainText,
  getClass,
  getTemplate,
  normalizeSection
} from '@par-noir/pen-protocol';
import { LayoutSurface } from '../../layout';
import type { PenSession } from '../../App';
import type { LocalDocSummary } from '../../services/penLocalStore';
import { loadLocalDoc } from '../../services/penLocalStore';
import { createDocFromTemplate } from '../../services/createDocFromTemplate';
import {
  DASHBOARD_SLOTS,
  loadDashboardPrefs,
  setDashboardBind,
  setDashboardLayout,
  type DashboardPrefs,
  type DashboardSlotId
} from '../../services/penClassPrefs';

function resolveClassId(d: LocalDocSummary): string | undefined {
  if (d.classId) return d.classId;
  return getTemplate(d.templateId)?.classId;
}

function previewLines(pn: string, docId: string): string[] {
  const bundle = loadLocalDoc(pn, docId);
  if (!bundle) return [];
  const lines: string[] = [];
  for (const raw of bundle.sections) {
    const sec = normalizeSection(raw);
    const text = docToPlainText(sec.doc).trim();
    if (text) {
      for (const line of text.split(/\n+/)) {
        if (line.trim()) lines.push(line.trim());
        if (lines.length >= 8) return lines;
      }
    }
  }
  return lines;
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
      .slice(0, 8);
    if (!notes.length) {
      return <p className="p-3 text-sm text-stone-500">No notes yet. Create one from New…</p>;
    }
    return (
      <ul className="divide-y divide-stone-100 text-sm">
        {notes.map((d) => (
          <li key={d.docId}>
            <Link to={`/d/${d.docId}`} className="block truncate px-3 py-2 hover:bg-stone-50">
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
      <div className="flex h-full flex-col items-start justify-center gap-2 p-3">
        <p className="text-sm text-stone-500">No {meta.title.toLowerCase()} linked.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onCreate(slot);
            }}
            className="rounded bg-stone-900 px-2 py-1 text-xs text-white disabled:opacity-50"
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
            className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 disabled:opacity-50"
          >
            Choose…
          </button>
        </div>
      </div>
    );
  }

  const lines = previewLines(session.pnIdentifier, boundId);
  const title =
    docs.find((d) => d.docId === boundId)?.title ||
    loadLocalDoc(session.pnIdentifier, boundId)?.manifest.title ||
    boundId;

  return (
    <div className="flex h-full flex-col">
      <Link
        to={`/d/${boundId}`}
        className="shrink-0 border-b border-stone-100 px-3 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
        onClick={(e) => e.stopPropagation()}
      >
        {title}
      </Link>
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-2 text-xs text-stone-600">
        {lines.length ? (
          lines.map((line, i) => (
            <li key={i} className="truncate">
              {line}
            </li>
          ))
        ) : (
          <li className="text-stone-400">Empty — open to edit</li>
        )}
      </ul>
      <button
        type="button"
        className="shrink-0 border-t border-stone-100 px-3 py-1.5 text-left text-[11px] text-stone-500 hover:bg-stone-50"
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chooser, setChooser] = useState<DashboardSlotId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleLayout = useMemo(() => {
    const hidden = new Set(prefs.hidden || []);
    return prefs.layout.filter((i) => !hidden.has(i.id as DashboardSlotId));
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
  const chooserDocs =
    chooserMeta?.classId
      ? docs.filter((d) => resolveClassId(d) === chooserMeta.classId)
      : [];

  return (
    <div className="relative">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <LayoutSurface
        className="h-[min(70vh,36rem)] w-full rounded-lg border border-stone-200 bg-stone-100/80"
        items={visibleLayout}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChange={(layout) => {
          const next = setDashboardLayout(session.pnIdentifier, layout);
          setPrefs(next);
        }}
        renderItem={(item) => {
          const slot = item.id as DashboardSlotId;
          const title = DASHBOARD_SLOTS.find((s) => s.id === slot)?.title || slot;
          return (
            <div className="flex h-full flex-col">
              <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                {title}
              </div>
              <div className="min-h-0 flex-1">
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
