/**
 * Browse widgets in-editor: My widgets, All widgets, and search.
 * Tiles are screenshots only (shipped poster, published poster, committed still).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CURATED_WIDGET_CATEGORIES,
  listStarterTemplates,
  type CuratedWidgetCategory,
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
import { previewBundleFromTemplate } from './TemplateGalleryThumb';
import type { GalleryMedia } from '../services/penGalleryPreview';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { resolvePublicMediaSignedUrl } from '../services/penPublicFeedMedia';
import { curatedWidgetPosterSrc } from '../services/widgetPosters';

type WidgetPickerPreview =
  | { kind: 'template'; index: number }
  | { kind: 'giphy'; index: number };

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function sourceLayers(template: PenTemplate): PenPageLayer[] {
  return template.seedSections?.[0]?.layers || [];
}

function NamedBlackTile({ name }: { name: string }) {
  return (
    <div className="pen-named-black-tile">
      <span className="pen-named-black-tile-text">{name}</span>
    </div>
  );
}

function CatalogMediaThumb({
  media,
  session,
  docId = 'preview'
}: {
  media: GalleryMedia;
  session?: PenSession | null;
  docId?: string;
}) {
  const { resolved } = useResolvedMediaSrc(media.src, { docId, session });
  return (
    <div className="pen-white-media-thumb flex items-center justify-center bg-white">
      {resolved ? (
        media.kind === 'video' ? (
          <video
            src={resolved}
            className="max-h-full max-w-full object-contain"
            muted
            playsInline
          />
        ) : (
          <img
            src={resolved}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        )
      ) : null}
    </div>
  );
}

function PosterImage({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <NamedBlackTile name={title} />;
  return (
    <div className="pen-white-media-thumb flex items-center justify-center bg-white">
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full object-contain"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

function PublicPosterThumb({
  fileId,
  title,
  session
}: {
  fileId: string;
  title: string;
  session?: PenSession | null;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    void resolvePublicMediaSignedUrl(fileId, 'poster', session?.accessToken)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, session?.accessToken]);
  if (failed) return <NamedBlackTile name={title} />;
  return <PosterImage src={src} title={title} />;
}

function WidgetTemplateThumb({
  template,
  pn,
  session,
  posterFileId
}: {
  template: PenTemplate;
  pn: string;
  session?: PenSession | null;
  posterFileId?: string;
}) {
  const curated = curatedWidgetPosterSrc(template.id);
  if (curated) return <PosterImage src={curated} title={template.title} />;
  if (posterFileId) {
    return <PublicPosterThumb fileId={posterFileId} title={template.title} session={session} />;
  }
  const manifest = previewBundleFromTemplate(pn, template)?.manifest;
  const still = manifest?.galleryPreviewPosterRef || manifest?.galleryPreviewRef;
  if (!manifest || !still) {
    return <NamedBlackTile name={template.title} />;
  }
  const media: GalleryMedia = {
    src: still,
    kind: manifest.galleryPreviewPosterRef || manifest.galleryPreviewKind !== 'video' ? 'image' : 'video'
  };
  return <CatalogMediaThumb media={media} session={session} docId={manifest.docId} />;
}

export function ActionLayerMenu({
  session,
  docId,
  section,
  onInserted,
  onCancel,
  classId = 'widgets.widget',
  contentWidthPx
}: {
  session?: PenSession | null;
  docId: string;
  section: PenSectionContent;
  contentWidthPx?: number;
  onInserted: (section: PenSectionContent, groupId: string) => void;
  onCancel: () => void;
  classId?: 'widgets.widget' | 'widgets.sticker';
}) {
  const sticker = classId === 'widgets.sticker';
  const noun = sticker ? 'sticker' : 'widget';
  const pn = session?.pnIdentifier || '';
  const starters = listStarterTemplates().filter(
    (t) => t.classId === classId && sourceLayers(t).length > 0
  );
  const yours = pn
    ? personalTemplatesAsPenTemplates(pn).filter((t) => t.classId === classId)
    : [];
  const [remote, setRemote] = useState<PenTemplate[]>([]);
  const [posters, setPosters] = useState<Map<string, string>>(() => new Map());
  const [tab, setTab] = useState<'mine' | 'all'>('all');
  const [category, setCategory] = useState<'all' | CuratedWidgetCategory>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giphyQuery, setGiphyQuery] = useState('');
  const [giphyHits, setGiphyHits] = useState<GiphyStickerHit[]>([]);
  const [giphyBusy, setGiphyBusy] = useState(false);
  const [preview, setPreview] = useState<WidgetPickerPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicPenTemplates({ limit: 200 })
      .then(async (entries) => {
        const published = await loadPublishedWidgetSections(entries);
        if (cancelled) return;
        const catalog = publicWidgetCatalog(entries, published);
        setRemote(catalog.templates.filter((template) => template.classId === classId));
        setPosters(catalog.posters);
      })
      .catch(() => {
        if (!cancelled) {
          setRemote([]);
          setPosters(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const shownTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = tab === 'mine' ? yours : [...starters, ...remote];
    if (!sticker && category !== 'all') {
      rows = rows.filter((template) => template.widgetCategory === category);
    }
    if (!q) return rows;
    const categoryLabels = new Map(CURATED_WIDGET_CATEGORIES.map((c) => [c.id, c.label.toLowerCase()]));
    return rows.filter((template) => {
      const catLabel = template.widgetCategory
        ? categoryLabels.get(template.widgetCategory as CuratedWidgetCategory) || ''
        : '';
      return (
        template.title.toLowerCase().includes(q) ||
        template.description.toLowerCase().includes(q) ||
        catLabel.includes(q)
      );
    });
  }, [category, query, remote, starters, sticker, tab, yours]);

  const shownGiphy = useMemo(() => {
    if (!sticker) return [];
    const q = query.trim().toLowerCase();
    if (!q) return giphyHits;
    return giphyHits.filter((hit) => (hit.title || '').toLowerCase().includes(q));
  }, [giphyHits, query, sticker]);

  const emptyGallery = shownTemplates.length === 0 && shownGiphy.length === 0;

  const previewListLength =
    preview?.kind === 'template' ? shownTemplates.length : preview?.kind === 'giphy' ? shownGiphy.length : 0;
  const previewTemplate =
    preview?.kind === 'template' ? shownTemplates[preview.index] : undefined;
  const previewGiphy = preview?.kind === 'giphy' ? shownGiphy[preview.index] : undefined;

  function goPreviewRelative(delta: number) {
    if (!preview || previewListLength < 2) return;
    const next = preview.index + delta;
    if (next < 0 || next >= previewListLength) return;
    setPreview({ kind: preview.kind, index: next });
  }

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPreviewRelative(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goPreviewRelative(1);
      } else if (event.key === 'Escape') {
        setPreview(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, previewListLength]);

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
        templateId: template.id,
        contentWidthPx
      });
      setPreview(null);
      onInserted(next.section, next.groupId);
    } catch {
      setError(`Could not add ${noun}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pen-action-layer-overlay" onClick={onCancel}>
      <div
        role="dialog"
        aria-label={sticker ? 'Add sticker' : 'Add widget'}
        className="pen-action-layer-panel text-[12px] text-neutral-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
          <span className="mr-2 font-semibold">{sticker ? 'Stickers' : 'Widgets'}</span>
          <input
            aria-label={sticker ? 'Search stickers' : 'Search widgets'}
            value={query}
            placeholder="Search"
            className="min-w-[10rem] flex-1 rounded border border-neutral-300 px-2 py-1 text-[12px]"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex gap-2" role="tablist">
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
          <button type="button" className="text-neutral-500 hover:text-black" onClick={onCancel}>
            Close
          </button>
        </div>
        {!sticker && tab === 'all' ? (
          <div className="flex flex-wrap gap-1 border-b border-neutral-200 px-4 py-2">
            <button
              type="button"
              className={`rounded px-2 py-0.5 text-[11px] ${category === 'all' ? 'bg-teal-800 text-white' : 'bg-neutral-100'}`}
              onClick={() => setCategory('all')}
            >
              All
            </button>
            {CURATED_WIDGET_CATEGORIES.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`rounded px-2 py-0.5 text-[11px] ${category === chip.id ? 'bg-teal-800 text-white' : 'bg-neutral-100'}`}
                onClick={() => setCategory(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}

        {sticker && (
          <form
            className="flex gap-2 border-b border-neutral-100 px-4 py-2"
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
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-[12px]"
              onChange={(event) => setGiphyQuery(event.target.value)}
            />
            <button type="submit" className="rounded bg-neutral-900 px-3 py-1 text-white" disabled={giphyBusy}>
              Search
            </button>
            <span className="self-center text-[10px] text-neutral-500">Powered by GIPHY</span>
          </form>
        )}

        <div className="pen-gallery-wrap pen-templates-gallery pen-action-layer-gallery min-h-0 flex-1 overflow-auto bg-white">
          {emptyGallery && (
            <p className="px-4 py-6 text-neutral-500">{sticker ? 'No stickers' : 'No widgets'}</p>
          )}
          <div className="pen-gallery">
            <div className="pen-gallery-tiles">
              {shownTemplates.map((template, index) => (
                <div key={template.id} className="pen-gallery-slot">
                  <button
                    type="button"
                    disabled={busy}
                    className="pen-gallery-tile disabled:opacity-50"
                    onClick={() => setPreview({ kind: 'template', index })}
                  >
                    <div className="pen-gallery-tile-title">
                      <span className="pen-gallery-tile-title-text">{template.title}</span>
                    </div>
                    <span className="pen-gallery-tile-preview">
                      <WidgetTemplateThumb
                        template={template}
                        pn={pn}
                        session={session}
                        posterFileId={posters.get(template.id)}
                      />
                    </span>
                  </button>
                </div>
              ))}
              {shownGiphy.map((hit, index) => (
                <div key={hit.id} className="pen-gallery-slot">
                  <button
                    type="button"
                    className="pen-gallery-tile"
                    onClick={() => setPreview({ kind: 'giphy', index })}
                  >
                    <div className="pen-gallery-tile-title">
                      <span className="pen-gallery-tile-title-text">{hit.title || 'Sticker'}</span>
                    </div>
                    <span className="pen-gallery-tile-preview">
                      <div className="pen-white-media-thumb flex items-center justify-center bg-white p-2">
                        <img
                          src={hit.url}
                          alt={hit.title || 'Sticker'}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="border-t border-neutral-100 px-4 py-2 text-red-600">{error}</p>}

        {preview && (previewTemplate || previewGiphy) ? (
          <div
            className="pen-template-preview-overlay"
            role="presentation"
            onClick={() => setPreview(null)}
          >
            {preview.index > 0 ? (
              <button
                type="button"
                className="pen-template-preview-nav pen-template-preview-nav--prev"
                aria-label={`Previous ${noun}`}
                title="Previous"
                onClick={(event) => {
                  event.stopPropagation();
                  goPreviewRelative(-1);
                }}
              >
                <ChevronIcon dir="left" />
              </button>
            ) : null}
            {preview.index < previewListLength - 1 ? (
              <button
                type="button"
                className="pen-template-preview-nav pen-template-preview-nav--next"
                aria-label={`Next ${noun}`}
                title="Next"
                onClick={(event) => {
                  event.stopPropagation();
                  goPreviewRelative(1);
                }}
              >
                <ChevronIcon dir="right" />
              </button>
            ) : null}
            <div
              className="pen-template-preview-modal pen-widget-picker-preview-modal"
              role="dialog"
              aria-modal="true"
              aria-label={
                previewTemplate?.title || previewGiphy?.title || (sticker ? 'Sticker preview' : 'Widget preview')
              }
              onClick={(event) => event.stopPropagation()}
            >
              <div className="pen-template-preview-modal-bar">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-black">
                    {previewTemplate?.title || previewGiphy?.title || noun}
                  </h2>
                  {previewTemplate?.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{previewTemplate.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="pen-template-icon-btn"
                  aria-label="Close preview"
                  title="Close"
                  onClick={() => setPreview(null)}
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="pen-template-preview-modal-body pen-widget-picker-preview-stage">
                {previewTemplate ? (
                  <WidgetTemplateThumb
                    template={previewTemplate}
                    pn={pn}
                    session={session}
                    posterFileId={posters.get(previewTemplate.id)}
                  />
                ) : previewGiphy ? (
                  <div className="pen-white-media-thumb flex items-center justify-center bg-white p-4">
                    <img
                      src={previewGiphy.url}
                      alt={previewGiphy.title || 'Sticker'}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>
              <div className="pen-template-preview-modal-actions">
                <button
                  type="button"
                  className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    if (previewTemplate) {
                      void pick(previewTemplate);
                      return;
                    }
                    if (previewGiphy) {
                      const placed = placeGiphySticker(section, previewGiphy);
                      onInserted(placed.section, placed.layerId);
                      setPreview(null);
                    }
                  }}
                >
                  {busy ? 'Adding…' : sticker ? 'Add sticker' : 'Add widget'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
