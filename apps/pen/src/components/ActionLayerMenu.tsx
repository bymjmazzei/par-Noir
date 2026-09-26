/**
 * New widget: list widget templates and copy one into the host section.
 */
import { useEffect, useState } from 'react';
import {
  getTemplate,
  listStarterTemplates,
  type PenPageLayer,
  type PenSectionContent,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { fetchPublicPenTemplates } from '../services/penCentralIndex';
import { personalTemplatesAsPenTemplates } from '../services/penPersonalTemplates';
import { publicWidgetCatalog } from '../services/widgetCatalog';
import { insertWidgetCopy } from '../services/widgetInsert';

function sourceLayers(
  template: PenTemplate,
  sources: Map<string, string>
): PenPageLayer[] {
  const own = template.seedSections?.[0]?.layers;
  if (own?.length) return own;
  const sourceId = sources.get(template.id);
  if (!sourceId) return [];
  return getTemplate(sourceId)?.seedSections?.[0]?.layers || [];
}

export function ActionLayerMenu({
  session,
  section,
  onInserted,
  onCancel
}: {
  session?: PenSession | null;
  section: PenSectionContent;
  onInserted: (section: PenSectionContent, groupId: string) => void;
  onCancel: () => void;
}) {
  const pn = session?.pnIdentifier || '';
  const starters = listStarterTemplates().filter((t) => t.classId === 'widgets.widget');
  const yours = pn
    ? personalTemplatesAsPenTemplates(pn).filter((t) => t.classId === 'widgets.widget')
    : [];
  const [remote, setRemote] = useState<PenTemplate[]>([]);
  const [sources, setSources] = useState<Map<string, string>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicPenTemplates({ limit: 200 })
      .then((entries) => {
        if (cancelled) return;
        const published = publicWidgetCatalog(entries);
        setRemote(published.templates);
        setSources(published.sources);
      })
      .catch(() => {
        if (!cancelled) {
          setRemote([]);
          setSources(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(template: PenTemplate) {
    if (!session?.pnIdentifier) {
      setError('Unlock to add a widget');
      return;
    }
    const layers = sourceLayers(template, sources);
    if (!layers.length) {
      setError('This widget has no layers to copy');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await insertWidgetCopy({
        session,
        host: section,
        layers,
        name: template.title
      });
      onInserted(next.section, next.groupId);
    } catch {
      setError('Could not add widget');
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    ...starters.map((t) => ({ template: t, group: 'Starters' })),
    ...yours.map((t) => ({ template: t, group: 'Yours' })),
    ...remote.map((t) => ({ template: t, group: 'Public' }))
  ];

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-[11px] text-neutral-700">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-neutral-500">New widget</span>
        <button type="button" className="text-neutral-500 hover:text-black" onClick={onCancel}>
          Close
        </button>
      </div>
      <div className="flex max-h-48 flex-col gap-0.5 overflow-auto">
        {rows.map((row, i) => {
          const showGroup = i === 0 || rows[i - 1]?.group !== row.group;
          return (
            <div key={row.template.id}>
              {showGroup && (
                <div className="px-1 pt-1 text-[10px] uppercase tracking-wide text-neutral-400">
                  {row.group}
                </div>
              )}
              <button
                type="button"
                disabled={busy}
                className="w-full rounded px-1 py-1 text-left hover:bg-white disabled:opacity-50"
                onClick={() => void pick(row.template)}
              >
                {row.template.title}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
