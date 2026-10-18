/**
 * Browse widgets in-editor: My widgets, All widgets, quick presets, and search.
 * Catalog picks copy layers into the host section; presets use placePageWidget.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  emptySection,
  listStarterTemplates,
  placePageWidget,
  placeWidgetLayer,
  type PageWidgetPreset,
  type PenDocManifest,
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
import {
  LAYERS_PAGE_WIDGET_PRESETS,
  LAYERS_WIDGET_ELEMENTS
} from './layersAddMenu';
import { previewBundleFromTemplate } from './TemplateGalleryThumb';
import { resolveGalleryMedia, type GalleryMedia } from '../services/penGalleryPreview';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { resolvePublicMediaSignedUrl } from '../services/penPublicFeedMedia';

function sourceLayers(template: PenTemplate): PenPageLayer[] {
  return template.seedSections?.[0]?.layers || [];
}

function previewManifest(title: string): PenDocManifest {
  const now = new Date().toISOString();
  return {
    docId: 'preview',
    title,
    docType: 'widget',
    classId: 'widgets.widget',
    templateId: 'preview',
    templateVersion: '1',
    groupId: 'preview',
    toc: ['card'],
    createdAt: now,
    updatedAt: now
  };
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
  if (posterFileId) {
    return <PublicPosterThumb fileId={posterFileId} title={template.title} session={session} />;
  }
  const bundle = previewBundleFromTemplate(pn, template);
  if (!bundle) {
    return <NamedBlackTile name={template.title} />;
  }
  const media = resolveGalleryMedia(bundle.manifest, bundle.sections);
  if (!media) {
    return <NamedBlackTile name={template.title} />;
  }
  return (
    <CatalogMediaThumb
      media={media}
      session={session}
      docId={bundle.manifest.docId}
    />
  );
}

function SectionLayersThumb({
  title,
  section,
  session
}: {
  title: string;
  section: PenSectionContent;
  session?: PenSession | null;
}) {
  const media = resolveGalleryMedia(previewManifest(title), [section]);
  if (media) {
    return <CatalogMediaThumb media={media} session={session} />;
  }
  return <div className="pen-white-media-thumb bg-white" aria-hidden />;
}

export function ActionLayerMenu({
  session,
  docId,
  section,
  onInserted,
  onPlaceElement,
  onCancel,
  classId = 'widgets.widget'
}: {
  session?: PenSession | null;
  docId: string;
  section: PenSectionContent;
  onInserted: (section: PenSectionContent, groupId: string) => void;
  onPlaceElement?: (element: 'input' | 'button' | 'time' | 'html') => void;
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
  const [posters, setPosters] = useState<Map<string, string>>(() => new Map());
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

  const shownPresets = useMemo(() => {
    if (sticker || tab !== 'all') return [];
    const q = query.trim().toLowerCase();
    if (!q) return LAYERS_PAGE_WIDGET_PRESETS;
    return LAYERS_PAGE_WIDGET_PRESETS.filter(({ label }) => label.toLowerCase().includes(q));
  }, [query, sticker, tab]);

  const shownElements = useMemo(() => {
    if (sticker || tab !== 'all' || !onPlaceElement) return [];
    const q = query.trim().toLowerCase();
    if (!q) return LAYERS_WIDGET_ELEMENTS;
    return LAYERS_WIDGET_ELEMENTS.filter(({ label }) => label.toLowerCase().includes(q));
  }, [onPlaceElement, query, sticker, tab]);

  const shownTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tab === 'mine' ? yours : [...starters, ...remote];
    if (!q) return rows;
    return rows.filter((template) => template.title.toLowerCase().includes(q));
  }, [query, remote, starters, tab, yours]);

  const shownGiphy = useMemo(() => {
    if (!sticker) return [];
    const q = query.trim().toLowerCase();
    if (!q) return giphyHits;
    return giphyHits.filter((hit) => (hit.title || '').toLowerCase().includes(q));
  }, [giphyHits, query, sticker]);

  const emptyGallery =
    shownPresets.length === 0 &&
    shownElements.length === 0 &&
    shownTemplates.length === 0 &&
    shownGiphy.length === 0;

  function pickPreset(preset: PageWidgetPreset) {
    if (!session?.pnIdentifier) {
      setError(`Unlock to add a ${noun}`);
      return;
    }
    setError(null);
    const placed = placePageWidget(section, preset);
    onInserted(placed.section, placed.groupId);
  }

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
              {shownPresets.map(({ preset, label }) => {
                const placed = placePageWidget(emptySection('body'), preset);
                return (
                  <div key={`preset:${preset}`} className="pen-gallery-slot">
                    <button
                      type="button"
                      disabled={busy}
                      className="pen-gallery-tile disabled:opacity-50"
                      onClick={() => pickPreset(preset)}
                    >
                      <div className="pen-gallery-tile-title">
                        <span className="pen-gallery-tile-title-text">{label}</span>
                      </div>
                      <span className="pen-gallery-tile-preview">
                        <SectionLayersThumb title={label} section={placed.section} session={session} />
                      </span>
                    </button>
                  </div>
                );
              })}
              {shownElements.map(({ element, label }) => {
                const placed = placeWidgetLayer(emptySection('body'), null, element);
                return (
                  <div key={`element:${element}`} className="pen-gallery-slot">
                    <button
                      type="button"
                      disabled={busy}
                      className="pen-gallery-tile disabled:opacity-50"
                      onClick={() => onPlaceElement?.(element)}
                    >
                      <div className="pen-gallery-tile-title">
                        <span className="pen-gallery-tile-title-text">{label}</span>
                      </div>
                      <span className="pen-gallery-tile-preview">
                        <SectionLayersThumb title={label} section={placed.section} session={session} />
                      </span>
                    </button>
                  </div>
                );
              })}
              {shownTemplates.map((template) => (
                <div key={template.id} className="pen-gallery-slot">
                  <button
                    type="button"
                    disabled={busy}
                    className="pen-gallery-tile disabled:opacity-50"
                    onClick={() => void pick(template)}
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
              {shownGiphy.map((hit) => (
                <div key={hit.id} className="pen-gallery-slot">
                  <button
                    type="button"
                    className="pen-gallery-tile"
                    onClick={() => {
                      const placed = placeGiphySticker(section, hit);
                      onInserted(placed.section, placed.layerId);
                    }}
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
      </div>
    </div>
  );
}
