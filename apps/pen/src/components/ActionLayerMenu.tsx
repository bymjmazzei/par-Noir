/**
 * Import widget: popup with My widgets, All widgets, and search.
 * Choosing one copies its layers into the host section.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  listStarterTemplates,
  type PenPageLayer,
  type PenSectionContent,
  type PenTemplate
} from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { fetchPublicPenTemplates } from '../services/penCentralIndex';
import { personalTemplatesAsPenTemplates } from '../services/penPersonalTemplates';
import { loadPublishedWidgetSections } from '../services/publishedWidgetIr';
import { publicWidgetCatalog } from '../services/widgetCatalog';
import { insertWidgetCopy } from '../services/widgetInsert';
import { placeGiphySticker, searchGiphyStickers, type GiphyStickerHit } from '../services/giphyStickers';

function sourceLayers(template: PenTemplate): PenPageLayer[] {
  return template.seedSections?.[0]?.layers || [];
}

export function ActionLayerMenu({
  session,
  docId,
  section,
  onInserted,
  onCancel,
  classId = 'widgets.widget'
}: {
  session?: PenSession | null;
  docId: string;
  section: PenSectionContent;
  onInserted: (section: PenSectionContent, groupId: string) => void;
  onCancel: () => void;
  classId?: 'widgets.widget' | 'widgets.sticker';
}) {
  const sticker = classId === 'widgets.sticker';
  const noun = sticker ? 'sticker' : 'widget';
  const pn = session?.pnIdentifier || '';
  const starters = listStarterTemplates().filter((t) => t.classId === classId);
  const yours = pn
    ? personalTemplatesAsPenTemplates(pn).filter((t) => t.classId === classId)
    : [];
  const [remote, setRemote] = useState<PenTemplate[]>([]);
  const [tab, setTab] = useState<'mine' | 'all'>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giphyQuery, setGiphyQuery] = useState('');
  const [giphyHits, setGiphyHits] = useState<GiphyStickerHit[]>([]);
  const [giphyBusy, setGiphyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicPenTemplates({ limit: 200 })
      .then(async (entries) => {
        const published = await loadPublishedWidgetSections(entries);
        if (cancelled) return;
        setRemote(
          publicWidgetCatalog(entries, published).templates.filter((template) => template.classId === classId)
        );
      })
      .catch(() => {
        if (!cancelled) setRemote([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tab === 'mine' ? yours : [...starters, ...remote];
    if (!q) return rows;
    return rows.filter((template) => template.title.toLowerCase().includes(q));
  }, [query, remote, starters, tab, yours]);

  async function pick(template: PenTemplate) {
    if (!session?.pnIdentifier) {
      setError(`Unlock to add a ${noun}`);
      return;
    }
    const layers = sourceLayers(template);
    setBusy(true);
    setError(null);
    try {
      const next = await insertWidgetCopy({
        session,
        docId,
        host: section,
        layers,
        name: template.title,
        templateId: template.id
      });
      onInserted(next.section, next.groupId);
    } catch {
      setError(`Could not add ${noun}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label={sticker ? 'Add sticker' : 'Add widget'}
        className="flex max-h-[70vh] w-full max-w-sm flex-col rounded border border-neutral-200 bg-white text-[12px] text-neutral-800 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
          <span className="font-semibold">{sticker ? 'Add sticker' : 'Import widget'}</span>
          <button type="button" className="text-neutral-500 hover:text-black" onClick={onCancel}>
            Close
          </button>
        </div>
        <div className="px-3 pt-2">
          <input
            aria-label={sticker ? 'Search stickers' : 'Search widgets'}
            value={query}
            placeholder="Search"
            className="w-full rounded border border-neutral-300 px-2 py-1 text-[12px]"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex gap-2 px-3 pt-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            className={`rounded px-2 py-1 ${tab === 'mine' ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}
            onClick={() => setTab('mine')}
          >
            {sticker ? 'My stickers' : 'My widgets'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={`rounded px-2 py-1 ${tab === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-100'}`}
            onClick={() => setTab('all')}
          >
            {sticker ? 'All stickers' : 'All widgets'}
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 py-2">
          {shown.length === 0 && (
            <p className="px-1 py-2 text-neutral-500">{sticker ? 'No stickers' : 'No widgets'}</p>
          )}
          {shown.map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={busy}
              className="w-full rounded px-2 py-1 text-left hover:bg-neutral-50 disabled:opacity-50"
              onClick={() => void pick(template)}
            >
              {template.title}
            </button>
          ))}
        </div>
        {sticker && (
          <div className="border-t border-neutral-200 px-3 py-2">
            <form
              className="flex gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                setGiphyBusy(true);
                setError(null);
                void searchGiphyStickers(giphyQuery)
                  .then(setGiphyHits)
                  .catch(() => setError('GIPHY search is unavailable'))
                  .finally(() => setGiphyBusy(false));
              }}
            >
              <input
                aria-label="Search GIPHY"
                value={giphyQuery}
                placeholder="Search GIPHY"
                className="w-full rounded border border-neutral-300 px-2 py-1 text-[12px]"
                onChange={(event) => setGiphyQuery(event.target.value)}
              />
              <button type="submit" className="rounded bg-neutral-900 px-2 text-white" disabled={giphyBusy}>
                Search
              </button>
            </form>
            <p className="pt-1 text-[10px] text-neutral-500">Powered by GIPHY</p>
            <div className="mt-1 flex max-h-28 flex-col gap-0.5 overflow-auto">
              {giphyHits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="w-full rounded px-1 py-1 text-left hover:bg-neutral-50"
                  onClick={() => {
                    const placed = placeGiphySticker(section, hit);
                    onInserted(placed.section, placed.layerId);
                  }}
                >
                  {hit.title || 'Sticker'}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="px-3 pb-2 text-red-600">{error}</p>}
      </div>
    </div>
  );
}
