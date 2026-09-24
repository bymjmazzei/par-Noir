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
  clampLayerRect,
  collectFontFamiliesFromDoc,
  contentBoxSize,
  defaultEditorPagePresentation,
  DEFAULT_FLOW_WORKSPACE_HEIGHT_PX,
  DEFAULT_FLOW_WORKSPACE_WIDTH_PX,
  docToHtml,
  fitAspectInBox,
  sizeMediaLayerForAttach,
  getTextLayerDoc,
  isFlowWorkspaceOpen,
  isGooglePenFont,
  isPageLayerId,
  mergePagePresentation,
  migrateSectionLayerGeomToPx,
  normalizeSection,
  PAGE_LAYER_ID,
  pageSheetDims,
  patchLayerStyle,
  recomputeGroupBounds,
  resolvePagePaddingPx,
  resizeSeKeepAspect,
  sectionNeedsLegacyGeomMigrate,
  updateLayerLayout,
  wrapSideFromGeom,
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
import { PageSheetColumn } from './PageSheetColumn';
import { LayerMediaContent } from './LayerMediaContent';
import { PenMediaPlayer } from '@par-noir/feed-tile';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { ensureGoogleFontsLoaded } from '../services/penGoogleFonts';
import type { PenSession } from '../services/penSession';

function ResolvedPageBackground({
  src,
  kind,
  docId,
  session
}: {
  src: string;
  kind: 'image' | 'video';
  docId?: string;
  session?: PenSession | null;
}) {
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  if (!resolved) return null;
  if (kind === 'video') {
    return (
      <div className="pointer-events-none absolute inset-0 z-0">
        <PenMediaPlayer
          src={resolved}
          className="h-full w-full"
          videoStyle={{ objectFit: 'cover' }}
        />
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
      style={{ backgroundImage: `url(${resolved})` }}
    />
  );
}
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

function bodyMarginStyle(presentation: PenPagePresentation): CSSProperties {
  const pad = resolvePagePaddingPx(presentation.padding);
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
  if (layer.kind === 'image' || layer.kind === 'video') {
    shell.backgroundColor = layer.backgroundColor || 'transparent';
    shell.opacity = 1;
    return shell;
  }
  const bg = shell.backgroundColor;
  if (!bg || bg === 'transparent' || String(bg).startsWith('rgba(')) {
    shell.backgroundColor = '#ffffff';
  }
  shell.opacity = 1;
  return shell;
}

type LiveGeom = { x: number; y: number; w: number; h: number };

/**
 * Body wrap in content-box CSS px: zero-width pusher for Y, float + insets for X.
 */
function BodyWrapObject({
  layer,
  allLayers,
  presentation,
  selected,
  contentW,
  contentH,
  onSelect,
  onCommit,
  docId,
  session,
  onNaturalAspect
}: {
  layer: PenPageLayer;
  allLayers: PenPageLayer[];
  presentation: PenPagePresentation;
  selected: boolean;
  contentW: number;
  contentH: number;
  onSelect: () => void;
  onCommit: (geom: LiveGeom & { bodyWrap: 'left' | 'right' }) => void;
  docId?: string;
  session?: PenSession | null;
  onNaturalAspect?: (aspect: number) => void;
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
  const boundsRef = useRef({ contentW, contentH });
  boundsRef.current = { contentW, contentH };
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    orig: LiveGeom;
  } | null>(null);

  useEffect(() => {
    setLive({ x: layer.x, y: layer.y, w: layer.w, h: layer.h });
  }, [layer.x, layer.y, layer.w, layer.h, layer.id]);

  const side = wrapSideFromGeom(live.x, live.w, contentW);
  const wPx = Math.max(24, Math.min(contentW, live.w));
  const hPx = Math.max(24, Math.min(contentH, live.h));
  const yPx = Math.max(0, Math.min(contentH - hPx, live.y));
  const leftInsetPx = Math.max(0, live.x);
  const rightInsetPx = Math.max(0, contentW - live.x - wPx);

  const pusherStyle: CSSProperties = {
    float: side,
    width: 0,
    height: `${yPx}px`,
    margin: 0,
    padding: 0,
    border: 0,
    pointerEvents: 'none'
  };

  const boxStyle: CSSProperties = {
    ...opaqueWrapShell(layer),
    float: side,
    clear: side,
    width: `${wPx}px`,
    height: `${hPx}px`,
    marginTop: 0,
    marginBottom: '0.5em',
    marginLeft: side === 'left' ? `${leftInsetPx}px` : '0.75em',
    marginRight: side === 'right' ? `${rightInsetPx}px` : '0.75em',
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
    if (!drag) return;
    const { contentW: cw, contentH: ch } = boundsRef.current;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === 'move') {
      setLive(
        clampLayerRect(
          {
            x: drag.orig.x + dx,
            y: drag.orig.y + dy,
            w: drag.orig.w,
            h: drag.orig.h
          },
          cw,
          ch
        )
      );
    } else {
      if (layer.kind === 'image' || layer.kind === 'video') {
        const sized = resizeSeKeepAspect(drag.orig, dx, dy);
        const aspect = drag.orig.w / Math.max(1, drag.orig.h);
        const maxW = Math.max(24, cw - drag.orig.x);
        const maxH = Math.max(24, ch - drag.orig.y);
        const fitted = fitAspectInBox(
          aspect,
          Math.min(sized.w, maxW),
          Math.min(sized.h, maxH)
        );
        setLive(clampLayerRect({ ...drag.orig, w: fitted.w, h: fitted.h }, cw, ch));
      } else {
        setLive(
          clampLayerRect(
            {
              x: drag.orig.x,
              y: drag.orig.y,
              w: drag.orig.w + dx,
              h: drag.orig.h + dy
            },
            cw,
            ch
          )
        );
      }
    }
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    const g = liveRef.current;
    const { contentW: cw } = boundsRef.current;
    onCommit({ ...g, bodyWrap: wrapSideFromGeom(g.x, g.w, cw) });
  }

  let inner: ReactNode = null;
  if (layer.kind === 'image' || layer.kind === 'video') {
    inner = (
      <LayerMediaContent
        layer={layer}
        onActivate={onSelect}
        docId={docId}
        session={session}
        onNaturalAspect={onNaturalAspect}
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
    <>
      <div aria-hidden data-wrap-pusher={side} style={pusherStyle} />
      <div
        data-wrap={side}
        role="button"
        tabIndex={0}
        className={`overflow-hidden ${
          selected ? 'ring-2 ring-sky-500' : 'ring-1 ring-stone-300'
        }`}
        style={boxStyle}
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
    </>
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
  onFlowWorkspaceChange,
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
  onFlowWorkspaceChange?: (next: {
    widthPx: number | null;
    heightPx: number | null;
  }) => void;
  onPresentationChange?: (next: Partial<PenPagePresentation>) => void;
  onSnapChange?: (enabled: boolean) => void;
  session?: PenSession | null;
}) {
  const layersBtnRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetMeasureRef = useRef<HTMLDivElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([PAGE_LAYER_ID]);
  const [fontsReady, setFontsReady] = useState(true);
  const [contentOuterH, setContentOuterH] = useState(400);
  const [measuredSheetW, setMeasuredSheetW] = useState(640);

  const pad = resolvePagePaddingPx(
    mergePagePresentation(defaultEditorPagePresentation(), manifest.pagePresentation).padding
  );

  // One-shot legacy % → px migrate
  useEffect(() => {
    if (!sectionNeedsLegacyGeomMigrate(section) && section.layerGeom === 'px') return;
    if (!sectionNeedsLegacyGeomMigrate(section) && (section.layers || []).length === 0) {
      if (section.layerGeom !== 'px') {
        onSectionChange({ ...normalizeSection(section), layerGeom: 'px' });
      }
      return;
    }
    if (!sectionNeedsLegacyGeomMigrate(section)) {
      if (section.layerGeom !== 'px') {
        onSectionChange({ ...normalizeSection(section), layerGeom: 'px' });
      }
      return;
    }
    onSectionChange(migrateSectionLayerGeomToPx(normalizeSection(section), pad));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot when legacy geom detected
  }, [section.slug, section.layerGeom, pad]);

  const prepared = useMemo(
    () => migrateSectionLayerGeomToPx(normalizeSection(section), pad),
    [section, pad]
  );
  const layers = prepared.layers || [];
  const wrapLayers = useMemo(
    () => layers.filter((l) => l.visible !== false && Boolean(l.bodyWrap)),
    [layers]
  );
  const absoluteLayers = useMemo(
    () => layers.filter((l) => l.visible !== false && !l.bodyWrap),
    [layers]
  );
  const items = absoluteLayers.map(layerToItem);
  const groupIds = useMemo(
    () => new Set(layers.filter((l) => l.kind === 'group').map((l) => l.id)),
    [layers]
  );
  const mediaAspectLockIds = useMemo(
    () =>
      new Set(
        layers
          .filter((l) => l.kind === 'image' || l.kind === 'video')
          .map((l) => l.id)
      ),
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
  const flowOpen = isFlowWorkspaceOpen(manifest.flowWorkspaceWidthPx);
  const flowWidth = flowOpen
    ? null
    : Math.round(Number(manifest.flowWorkspaceWidthPx) || DEFAULT_FLOW_WORKSPACE_WIDTH_PX);
  const flowHeight =
    manifest.flowWorkspaceHeightPx == null
      ? null
      : Math.round(Number(manifest.flowWorkspaceHeightPx));
  const sheet = pageSheetDims(manifest.pageLayout, {
    widthPx: manifest.flowWorkspaceWidthPx,
    heightPx: manifest.flowWorkspaceHeightPx
  });
  const contentHInner = Math.max(0, contentOuterH - 2 * pad);
  const box = contentBoxSize(sheet, pad, contentHInner, measuredSheetW);

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

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.max(el.scrollHeight, el.clientHeight, sheet.pageHeightPx || 320);
      setContentOuterH(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [prepared.doc, wrapLayers.length, sheet.pageHeightPx, flowWidth, flowHeight, manifest.pageLayout]);

  useEffect(() => {
    const el = sheetMeasureRef.current;
    if (!el) return;
    const measure = () => setMeasuredSheetW(el.clientWidth || 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flowOpen, flowWidth, manifest.pageLayout]);

  function onLayoutChange(nextItems: LayoutItem[]) {
    let next = updateLayerLayout(prepared, nextItems);
    next = { ...next, layerGeom: 'px' };
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
    patch: LiveGeom & { bodyWrap: 'left' | 'right' }
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
    next = { ...next, layerGeom: 'px' };
    onSectionChange(next);
  }

  function selectLayer(id: string | null) {
    const next = id || PAGE_LAYER_ID;
    onSelectLayer(next);
    setSelectedIds([next]);
  }

  function reshapeLayerToAspect(layerId: string, aspect: number) {
    const layer = prepared.layers?.find((l) => l.id === layerId);
    if (!layer || layer.positionLocked) return;
    const fitted = sizeMediaLayerForAttach(
      { x: layer.x, y: layer.y, w: layer.w, h: layer.h },
      aspect,
      box.width,
      box.height
    );
    const layerAspect = layer.w / Math.max(1, layer.h);
    if (
      Math.abs(layerAspect - aspect) / aspect <= 0.02 &&
      Math.min(layer.w, layer.h) >= 120
    ) {
      return;
    }
    if (
      Math.abs(fitted.w - layer.w) < 0.5 &&
      Math.abs(fitted.h - layer.h) < 0.5
    ) {
      return;
    }
    onSectionChange(
      updateLayerLayout(prepared, [
        {
          id: layer.id,
          x: fitted.x,
          y: fitted.y,
          w: fitted.w,
          h: fitted.h,
          zIndex: layer.zIndex
        }
      ])
    );
  }

  function getLinkedIds(id: string): string[] {
    if (!groupIds.has(id)) return [];
    return layers.filter((l) => l.parentGroupId === id).map((l) => l.id);
  }

  const frameStyle: CSSProperties = pageFrameStyle(presentation);
  const bodyHtml = docToHtml(prepared.doc);
  const bodyStyle = bodyMarginStyle(presentation);
  const isFlow = (manifest.pageLayout || 'flow') === 'flow';

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
        {isFlow && onFlowWorkspaceChange && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              title="Open workspace — fill the panel with no fixed width"
              aria-pressed={flowOpen}
              className={`rounded px-1.5 text-[10px] font-bold uppercase tracking-wide ${
                flowOpen ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-black'
              }`}
              onClick={() =>
                onFlowWorkspaceChange({
                  widthPx: null,
                  heightPx: null
                })
              }
            >
              Open
            </button>
            {!flowOpen && (
              <>
                <label className="flex items-center gap-1 text-[10px] text-neutral-500">
                  W
                  <input
                    type="number"
                    min={320}
                    max={1600}
                    step={16}
                    className="h-6 w-14 rounded border border-neutral-200 px-1 text-[11px] font-bold text-black"
                    value={flowWidth ?? DEFAULT_FLOW_WORKSPACE_WIDTH_PX}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (!Number.isFinite(n)) return;
                      onFlowWorkspaceChange({
                        widthPx: Math.max(320, Math.min(1600, n)),
                        heightPx: flowHeight
                      });
                    }}
                  />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-neutral-500">
                  H
                  <input
                    type="number"
                    min={240}
                    max={4000}
                    step={16}
                    className="h-6 w-14 rounded border border-neutral-200 px-1 text-[11px] font-bold text-black"
                    value={flowHeight ?? DEFAULT_FLOW_WORKSPACE_HEIGHT_PX}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (!Number.isFinite(n)) return;
                      onFlowWorkspaceChange({
                        widthPx: flowWidth ?? DEFAULT_FLOW_WORKSPACE_WIDTH_PX,
                        heightPx: Math.max(240, Math.min(4000, n))
                      });
                    }}
                  />
                </label>
              </>
            )}
            {flowOpen && (
              <button
                type="button"
                title="Lock workspace to a fixed width and height"
                className="rounded px-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400 hover:text-black"
                onClick={() =>
                  onFlowWorkspaceChange({
                    widthPx: DEFAULT_FLOW_WORKSPACE_WIDTH_PX,
                    heightPx: DEFAULT_FLOW_WORKSPACE_HEIGHT_PX
                  })
                }
              >
                Fixed
              </button>
            )}
          </div>
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
            contentWidthPx={box.width}
            contentHeightPx={box.height}
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
        section={prepared}
        activeLayerId={activeLayerId || PAGE_LAYER_ID}
        onSelectLayer={onSelectLayer}
        onSectionChange={onSectionChange}
        pageLayout={manifest.pageLayout}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        contentWidthPx={box.width}
      />

      <div
        ref={scrollerRef}
        className={`flex flex-1 overflow-auto bg-neutral-100 ${
          flowOpen ? 'items-stretch p-0' : 'items-start justify-center p-6'
        }`}
      >
        <PageSheetColumn
          sheetRef={sheetMeasureRef}
          pageLayout={manifest.pageLayout}
          flowWorkspaceWidthPx={manifest.flowWorkspaceWidthPx}
          flowWorkspaceHeightPx={manifest.flowWorkspaceHeightPx}
          contentOuterHeightPx={contentOuterH}
          style={frameStyle}
          className={flowOpen ? 'min-h-full shadow-none' : undefined}
          onClick={() => selectLayer(PAGE_LAYER_ID)}
        >
          {presentation.backgroundVideo && (
            <ResolvedPageBackground
              src={presentation.backgroundVideo}
              kind="video"
              docId={manifest.docId}
              session={session}
            />
          )}
          {!presentation.backgroundVideo && presentation.backgroundImage && (
            <ResolvedPageBackground
              src={presentation.backgroundImage}
              kind="image"
              docId={manifest.docId}
              session={session}
            />
          )}

          {/* Body — padded content box; wrap floats + prose */}
          <div
            ref={bodyRef}
            className={`pen-rich-html relative z-0 ${fontsReady ? '' : 'opacity-90'}`}
            style={{
              ...bodyStyle,
              minHeight: sheet.pageHeightPx || box.height + 2 * pad
            }}
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
                contentW={box.width}
                contentH={box.height}
                onSelect={() => selectLayer(layer.id)}
                onCommit={(patch) => onWrapCommit(layer.id, patch)}
                docId={manifest.docId}
                session={session}
                onNaturalAspect={(aspect) => reshapeLayerToAspect(layer.id, aspect)}
              />
            ))}
            <div
              style={{ display: 'contents' }}
              dangerouslySetInnerHTML={{
                __html: bodyHtml || '<p class="text-neutral-400">Start writing…</p>'
              }}
            />

            {/* Absolute overlays — same content box as Body padding inset */}
            <LayoutSurface
              className="pointer-events-none absolute z-[1]"
              style={
                {
                  top: pad,
                  left: pad,
                  width: box.width,
                  height: box.height
                } as CSSProperties
              }
              items={items}
              bounds={{ width: box.width, height: box.height }}
              selectedId={pageActive ? null : activeLayerId}
              snapToPageCenter={snapEnabled}
              getLinkedIds={getLinkedIds}
              resizeDisabledIds={groupIds}
              lockAspectRatioIds={mediaAspectLockIds}
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
                if (layer.kind === 'image' || layer.kind === 'video') {
                  // Blur is applied on the media element via mediaFilterCss — drop shell filter.
                  const { filter: _f, ...shellRest } = shell as CSSProperties & {
                    filter?: string;
                  };
                  return (
                    <div className="relative h-full w-full" style={shellRest}>
                      <LayerMediaContent
                        layer={layer}
                        onActivate={() => selectLayer(layer.id)}
                        docId={manifest.docId}
                        session={session}
                        onNaturalAspect={(aspect) => reshapeLayerToAspect(layer.id, aspect)}
                      />
                    </div>
                  );
                }
                if (layer.backgroundVideo) {
                  return (
                    <div className="relative h-full w-full overflow-hidden" style={shell}>
                      <div className="absolute inset-0">
                        <ResolvedPageBackground
                          src={layer.backgroundVideo}
                          kind="video"
                          docId={manifest.docId}
                          session={session}
                        />
                      </div>
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
        </PageSheetColumn>
      </div>
    </div>
  );
}
