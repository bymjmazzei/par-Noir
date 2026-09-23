import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import {
  collectFontFamiliesFromDoc,
  defaultEditorPagePresentation,
  docToHtml,
  getTextLayerDoc,
  isGooglePenFont,
  isPageLayerId,
  mergePagePresentation,
  normalizeSection,
  PAGE_LAYER_ID,
  patchLayerStyle,
  recomputeGroupBounds,
  updateLayerLayout,
  type PenDocManifest,
  type PenPageLayer,
  type PenPageLayout,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { LayoutSurface, type LayoutItem } from '../layout';
import { LayersPopover, layerDisplayLabel, pageLayerLabel } from './LayersPanel';
import { IconLayers } from './icons/PenIcons';
import {
  LayerObjectToolbar,
  layerPreviewStyle,
  pageFrameStyle
} from './LayerObjectToolbar';
import { ensureGoogleFontsLoaded } from '../services/penGoogleFonts';
import type { PenSession } from '../services/penSession';

function layerToItem(layer: PenPageLayer): LayoutItem {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    zIndex: layer.zIndex,
    positionLocked: layer.positionLocked
  };
}

function pageFrameClass(pageLayout: PenPageLayout | undefined): string {
  if (pageLayout === 'letter') return 'pen-page-letter';
  if (pageLayout === 'a4') return 'pen-page-a4';
  return 'max-w-[22rem] aspect-[3/4]';
}

function bodyMarginStyle(presentation: PenPagePresentation): CSSProperties {
  const pad = Math.max(8, Math.min(72, Number(presentation.padding) || 40));
  return {
    padding: `${pad}px`,
    fontFamily: presentation.fontFamily || 'Georgia',
    fontSize: `${presentation.fontSize || 16}px`,
    color: presentation.textColor || '#111111',
    textAlign: presentation.textAlign || 'left'
  };
}

function opaqueWrapShell(layer: PenPageLayer): CSSProperties {
  const shell = { ...layerPreviewStyle(layer) };
  // Body text must not show through — wrap objects are in-flow floats, not overlays.
  const bg = shell.backgroundColor;
  if (!bg || bg === 'transparent' || String(bg).startsWith('rgba(')) {
    shell.backgroundColor = '#ffffff';
  }
  shell.opacity = 1;
  return shell;
}

type LiveGeom = { x: number; y: number; w: number; h: number };

/**
 * Real float (right) in Body flow — text wraps around it.
 * X → margin-right inset, Y → margin-top. Commit on pointer up.
 */
function BodyWrapObject({
  layer,
  allLayers,
  presentation,
  selected,
  pageEl,
  onSelect,
  onCommit
}: {
  layer: PenPageLayer;
  allLayers: PenPageLayer[];
  presentation: PenPagePresentation;
  selected: boolean;
  pageEl: HTMLElement | null;
  onSelect: () => void;
  onCommit: (geom: LiveGeom & { bodyWrap: 'right' }) => void;
}) {
  const locked = Boolean(layer.positionLocked);
  const [live, setLive] = useState<LiveGeom>({
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h
  });
  const liveRef = useRef(live);
  liveRef.current = live;
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    orig: LiveGeom;
  } | null>(null);

  useEffect(() => {
    setLive({ x: layer.x, y: layer.y, w: layer.w, h: layer.h });
  }, [layer.x, layer.y, layer.w, layer.h, layer.id]);

  const pageH = pageEl?.clientHeight || 400;
  const pageW = pageEl?.clientWidth || 320;
  const wPct = Math.max(12, Math.min(70, live.w));
  const hPx = Math.max(48, Math.round((Math.max(10, Math.min(70, live.h)) / 100) * pageH));
  const yPx = Math.max(0, Math.round((Math.max(0, Math.min(80, live.y)) / 100) * pageH));
  const maxInsetPct = Math.max(0, 100 - wPct - 2);
  const rightInsetPx = Math.round(
    (Math.max(0, Math.min(maxInsetPct, 100 - live.x - live.w)) / 100) * pageW
  );

  const style: CSSProperties = {
    ...opaqueWrapShell(layer),
    float: 'right',
    width: `${wPct}%`,
    height: `${hPx}px`,
    marginTop: `${yPx}px`,
    marginBottom: '0.5em',
    marginLeft: '0.75em',
    marginRight: `${rightInsetPx}px`,
    shapeOutside: 'margin-box',
    position: 'relative',
    zIndex: 2,
    cursor: locked ? 'default' : 'grab',
    boxSizing: 'border-box'
  };

  function onPointerDownMove(e: ReactPointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    if (locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...liveRef.current }
    };
  }

  function onPointerDownResize(e: ReactPointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    if (locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...liveRef.current }
    };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || !pageEl) return;
    const r = pageEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dx = ((e.clientX - drag.startX) / r.width) * 100;
    const dy = ((e.clientY - drag.startY) / r.height) * 100;
    if (drag.mode === 'move') {
      setLive({
        x: Math.max(0, Math.min(88, drag.orig.x + dx)),
        y: Math.max(0, Math.min(80, drag.orig.y + dy)),
        w: drag.orig.w,
        h: drag.orig.h
      });
    } else {
      setLive({
        x: drag.orig.x,
        y: drag.orig.y,
        w: Math.max(12, Math.min(70, drag.orig.w + dx)),
        h: Math.max(10, Math.min(70, drag.orig.h + dy))
      });
    }
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onCommit({ ...liveRef.current, bodyWrap: 'right' });
  }

  let inner: ReactNode = null;
  if (layer.kind === 'image' && layer.imageSrc) {
    inner = (
      <img
        src={layer.imageSrc}
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
      />
    );
  } else if (layer.kind === 'video' && layer.videoSrc) {
    inner = (
      <video
        src={layer.videoSrc}
        className="h-full w-full object-contain"
        controls
        playsInline
      />
    );
  } else if (layer.kind === 'text') {
    const html = docToHtml(getTextLayerDoc(layer));
    inner = (
      <div
        className="pen-rich-html h-full w-full overflow-hidden p-2 text-sm"
        style={{
          fontFamily: presentation.fontFamily || undefined,
          color: presentation.textColor || '#111'
        }}
        title={layerDisplayLabel(layer, allLayers)}
        dangerouslySetInnerHTML={{
          __html: html || '<p class="text-neutral-400">Text</p>'
        }}
      />
    );
  }
  if (!inner) return null;

  return (
    <div
      data-wrap="right"
      role="button"
      tabIndex={0}
      className={`overflow-hidden ${
        selected ? 'ring-2 ring-sky-500' : 'ring-1 ring-stone-300'
      }`}
      style={style}
      onPointerDown={onPointerDownMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {inner}
      {selected && !locked && (
        <div
          className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-sky-500"
          onPointerDown={onPointerDownResize}
        />
      )}
    </div>
  );
}

/** Editable page surface — Body (section.doc) under optional overlay layers. */
export function EditablePagePreview({
  manifest,
  section,
  activeLayerId,
  onSelectLayer,
  onSectionChange,
  onPageLayoutChange,
  onPresentationChange,
  onSnapChange,
  session
}: {
  manifest: PenDocManifest;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  onPageLayoutChange?: (layout: PenPageLayout) => void;
  onPresentationChange?: (next: Partial<PenPagePresentation>) => void;
  onSnapChange?: (enabled: boolean) => void;
  session?: PenSession | null;
}) {
  const layersBtnRef = useRef<HTMLButtonElement>(null);
  const pageFrameRef = useRef<HTMLDivElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([PAGE_LAYER_ID]);
  const [fontsReady, setFontsReady] = useState(true);
  const prepared = useMemo(() => normalizeSection(section), [section]);
  const layers = prepared.layers || [];
  const wrapLayers = useMemo(
    () => layers.filter((l) => l.visible !== false && Boolean(l.bodyWrap)),
    [layers]
  );
  /** Absolute stack only — wrap objects live in Body float flow. */
  const absoluteLayers = useMemo(
    () => layers.filter((l) => l.visible !== false && !l.bodyWrap),
    [layers]
  );
  const items = absoluteLayers.map(layerToItem);
  const groupIds = useMemo(
    () => new Set(layers.filter((l) => l.kind === 'group').map((l) => l.id)),
    [layers]
  );
  const presentation = mergePagePresentation(
    defaultEditorPagePresentation(),
    (() => {
      const raw = manifest.pagePresentation;
      if (!raw) return undefined;
      if (
        raw.backgroundColor === '#000000' &&
        !raw.backgroundImage &&
        !raw.backgroundGradient &&
        !raw.backgroundVideo
      ) {
        return { ...raw, backgroundColor: 'transparent' };
      }
      return raw;
    })()
  );
  const snapEnabled = Boolean(manifest.snapToPageGuides);

  const activeObject = layers.find((l) => l.id === activeLayerId) || null;
  const pageActive = isPageLayerId(activeLayerId);
  const multiSelected = selectedIds.filter((id) => id !== PAGE_LAYER_ID).length >= 2;
  const layersButtonTitle = multiSelected
    ? 'Multiple'
    : pageActive
      ? pageLayerLabel(manifest.pageLayout)
      : activeObject
        ? layerDisplayLabel(activeObject, layers)
        : 'Layers';

  useEffect(() => {
    const families = collectFontFamiliesFromDoc({
      sections: [prepared],
      pagePresentationFontFamily: presentation.fontFamily
    });
    const google = families.filter((f) => isGooglePenFont(f));
    if (google.length) {
      setFontsReady(false);
      ensureGoogleFontsLoaded(google);
      const done = () => setFontsReady(true);
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        void document.fonts.ready.then(done).catch(done);
      } else {
        done();
      }
    } else {
      setFontsReady(true);
    }
  }, [prepared, presentation.fontFamily]);

  function onLayoutChange(nextItems: LayoutItem[]) {
    let next = updateLayerLayout(prepared, nextItems);
    const groups = new Set(
      (next.layers || [])
        .filter((l) => l.parentGroupId)
        .map((l) => l.parentGroupId!)
    );
    for (const gid of groups) {
      next = recomputeGroupBounds(next, gid);
    }
    onSectionChange(next);
  }

  function onWrapCommit(
    layerId: string,
    patch: LiveGeom & { bodyWrap: 'right' }
  ) {
    const layer = prepared.layers?.find((l) => l.id === layerId);
    if (!layer) return;
    let next = updateLayerLayout(prepared, [
      {
        id: layerId,
        x: patch.x,
        y: patch.y,
        w: patch.w,
        h: patch.h,
        zIndex: layer.zIndex
      }
    ]);
    next = patchLayerStyle(next, layerId, { bodyWrap: patch.bodyWrap });
    onSectionChange(next);
  }

  function selectLayer(id: string | null) {
    const next = id || PAGE_LAYER_ID;
    onSelectLayer(next);
    setSelectedIds([next]);
  }

  function getLinkedIds(id: string): string[] {
    if (!groupIds.has(id)) return [];
    return layers.filter((l) => l.parentGroupId === id).map((l) => l.id);
  }

  const frameStyle: CSSProperties = pageFrameStyle(presentation);
  const bodyHtml = docToHtml(prepared.doc);
  const bodyStyle = bodyMarginStyle(presentation);

  return (
    <div className="relative flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-2 py-1.5">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          Page
        </span>
        {onPageLayoutChange && (
          <select
            className="h-6 shrink-0 border-0 bg-transparent text-[11px] font-bold text-black outline-none"
            value={manifest.pageLayout || 'flow'}
            title="Page layout"
            onChange={(e) => {
              onPageLayoutChange(e.target.value as PenPageLayout);
              selectLayer(PAGE_LAYER_ID);
            }}
          >
            <option value="flow">Flow</option>
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        )}
        {onSnapChange && (
          <button
            type="button"
            title={snapEnabled ? 'Snap to page center on' : 'Snap to page center off'}
            aria-pressed={snapEnabled}
            className={`shrink-0 rounded px-1.5 text-[10px] font-bold uppercase tracking-wide ${
              snapEnabled ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-black'
            }`}
            onClick={() => onSnapChange(!snapEnabled)}
          >
            Snap
          </button>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-1">
          <LayerObjectToolbar
            target={
              pageActive || !activeObject
                ? { kind: 'page' }
                : { kind: 'layer', layer: activeObject }
            }
            presentation={presentation}
            section={prepared}
            session={session}
            docId={manifest.docId}
            onPresentationChange={onPresentationChange}
            onSectionChange={onSectionChange}
          />
          <button
            ref={layersBtnRef}
            type="button"
            aria-expanded={layersOpen}
            aria-pressed={layersOpen}
            aria-label={layersButtonTitle}
            title={layersButtonTitle}
            className={`inline-flex max-w-[10rem] items-center gap-1 truncate px-1 text-[11px] font-bold ${
              layersOpen ? 'text-black' : 'text-neutral-500 hover:text-black'
            }`}
            onClick={() => setLayersOpen((o) => !o)}
          >
            <IconLayers className="shrink-0" />
            <span className="truncate">{layersButtonTitle}</span>
          </button>
        </div>
      </div>

      <LayersPopover
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        anchorRef={layersBtnRef}
        section={section}
        activeLayerId={activeLayerId || PAGE_LAYER_ID}
        onSelectLayer={onSelectLayer}
        onSectionChange={onSectionChange}
        pageLayout={manifest.pageLayout}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />

      <div className="flex flex-1 items-start justify-center overflow-auto bg-neutral-100 p-6">
        <div
          ref={pageFrameRef}
          className={`relative w-full overflow-hidden border border-neutral-200 bg-white ${pageFrameClass(
            manifest.pageLayout
          )}`}
          style={frameStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) selectLayer(PAGE_LAYER_ID);
          }}
        >
          {presentation.backgroundVideo && (
            <video
              src={presentation.backgroundVideo}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          )}

          {/* Body — wrap objects are real floats here so text flows around them */}
          <div
            className={`pen-rich-html absolute inset-0 z-0 overflow-auto ${
              fontsReady ? '' : 'opacity-90'
            }`}
            style={bodyStyle}
            onClick={(e) => {
              e.stopPropagation();
              selectLayer(PAGE_LAYER_ID);
            }}
          >
            {wrapLayers.map((layer) => (
              <BodyWrapObject
                key={layer.id}
                layer={layer}
                allLayers={layers}
                presentation={presentation}
                selected={activeLayerId === layer.id}
                pageEl={pageFrameRef.current}
                onSelect={() => selectLayer(layer.id)}
                onCommit={(patch) => onWrapCommit(layer.id, patch)}
              />
            ))}
            {/* display:contents so Body prose shares the float formatting context */}
            <div
              style={{ display: 'contents' }}
              dangerouslySetInnerHTML={{
                __html: bodyHtml || '<p class="text-neutral-400">Start writing…</p>'
              }}
            />
          </div>

          {/* Absolute overlays only (not wrap) */}
          <LayoutSurface
            className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
            items={items}
            selectedId={pageActive ? null : activeLayerId}
            snapToPageCenter={snapEnabled}
            getLinkedIds={getLinkedIds}
            resizeDisabledIds={groupIds}
            onSelect={(id) => selectLayer(id || PAGE_LAYER_ID)}
            onChange={onLayoutChange}
            renderItem={(item) => {
              const layer = layers.find((l) => l.id === item.id);
              if (!layer || layer.bodyWrap) return null;
              const shell = layerPreviewStyle(layer);
              if (layer.kind === 'group') {
                return (
                  <div
                    className="h-full w-full"
                    style={shell}
                    title={layerDisplayLabel(layer, layers)}
                  />
                );
              }
              if (layer.kind === 'image' && layer.imageSrc) {
                return (
                  <div className="relative h-full w-full" style={shell}>
                    <img
                      src={layer.imageSrc}
                      alt=""
                      className="relative h-full w-full object-contain"
                      draggable={false}
                    />
                  </div>
                );
              }
              if (layer.kind === 'video' && layer.videoSrc) {
                return (
                  <div className="h-full w-full" style={shell}>
                    <video
                      src={layer.videoSrc}
                      className="h-full w-full object-contain"
                      controls
                      playsInline
                    />
                  </div>
                );
              }
              if (layer.backgroundVideo) {
                return (
                  <div className="relative h-full w-full overflow-hidden" style={shell}>
                    <video
                      src={layer.backgroundVideo}
                      className="absolute inset-0 h-full w-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                    <div
                      className="pen-rich-html relative h-full w-full overflow-auto p-2 text-sm"
                      style={{
                        fontFamily: presentation.fontFamily || undefined,
                        color: presentation.textColor || '#111'
                      }}
                      dangerouslySetInnerHTML={{
                        __html:
                          docToHtml(getTextLayerDoc(layer)) ||
                          '<p class="text-neutral-400">Text</p>'
                      }}
                    />
                  </div>
                );
              }
              const html = docToHtml(getTextLayerDoc(layer));
              return (
                <div className="relative h-full w-full overflow-hidden" style={shell}>
                  <div
                    className="pen-rich-html relative h-full w-full overflow-auto p-2 text-sm"
                    style={{
                      fontFamily: presentation.fontFamily || undefined,
                      color: presentation.textColor || '#111'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: html || '<p class="text-neutral-400">Text</p>'
                    }}
                  />
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
