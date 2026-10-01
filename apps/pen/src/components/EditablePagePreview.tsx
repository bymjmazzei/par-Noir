import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import {
  clampLayerRect,
  pasteboardGutterPx,
  collectFontFamiliesFromDoc,
  clampPageSizePx,
  contentBoxSize,
  createGuideLayer,
  matchPageSize,
  orientPageSize,
  measureToPx,
  defaultEditorPagePresentation,
  DEFAULT_FLOW_WORKSPACE_HEIGHT_PX,
  DEFAULT_FLOW_WORKSPACE_WIDTH_PX,
  docToHtml,
  docToPlainText,
  editorPlaybackSrc,
  fitAspectInBox,
  sizeMediaLayerForAttach,
  getTextLayerDoc,
  isFlowWorkspaceOpen,
  pageAllowsPasteboard,
  isGooglePenFont,
  isPageLayerId,
  applyLayoutAtPlayhead,
  sampleSectionLayers,
  mergePagePresentation,
  migrateSectionLayerGeomToPx,
  normalizeSection,
  PAGE_LAYER_ID,
  PAGE_SIZE_PRESETS,
  publishPlaybackSrc,
  openFlowDragHeightPx,
  pageSheetDims,
  PAGE_MEASURE_UNITS,
  pxToMeasure,
  patchLayerStyle,
  recomputeGroupBounds,
  resolvePagePaddingPx,
  resizeSeKeepAspect,
  sectionNeedsLegacyGeomMigrate,
  timeLayerCaption,
  revealSibling,
  selectPageSize,
  sanitizeWidgetMarkup,
  updateLayerLayout,
  upsertLayer,
  voteFaceForLayer,
  wrapSideFromGeom,
  type PageSizeChoice,
  type PenDocManifest,
  type PenPageLayer,
  type PageMeasureUnit,
  type PenPageOrientation,
  type PenPageView,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { LayoutSurface, type LayoutItem } from '../layout';
import { WidgetTextInput } from './WidgetTextInput';
import { LayersPopover, layerDisplayLabel, pageLayerLabel } from './LayersPanel';
import { IconLayers, IconTapeMeasure } from './icons/PenIcons';
import {
  LayerObjectToolbar,
  layerChromeStyle,
  layerPreviewStyle,
  pageFrameStyle
} from './LayerObjectToolbar';
import { PreviewOrientationMenu } from './PreviewPageBar';
import { PageGuides } from './PageGuides';
import { PageSheetColumn } from './PageSheetColumn';
import { LayerMediaContent } from './LayerMediaContent';
import { PenMediaPlayer, PublishedEngagementBar } from '@par-noir/feed-tile';
import { usePlaybackMode } from '../hooks/usePlaybackMode';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { ensureGoogleFontsLoaded } from '../services/penGoogleFonts';
import type { PenSession } from '../services/penSession';

export function ResolvedPageBackground({
  src,
  kind,
  docId,
  session,
  editProxySrc,
  videoSrc
}: {
  src: string;
  kind: 'image' | 'video';
  docId?: string;
  session?: PenSession | null;
  editProxySrc?: string;
  videoSrc?: string;
}) {
  const playback = usePlaybackMode();
  const playSrc =
    kind === 'video'
      ? playback === 'publish'
        ? publishPlaybackSrc({ videoSrc, backgroundVideo: src })
        : editorPlaybackSrc({ editProxySrc })
      : src;
  const { resolved } = useResolvedMediaSrc(playSrc, { docId, session });
  if (!playSrc || !resolved) return null;
  if (kind === 'video') {
    return (
      <div data-pen-playback={playback} className="pointer-events-none absolute inset-0 z-0">
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
    rotate: layer.rotate ?? layer.mediaRotate,
    positionLocked: layer.positionLocked,
    cornerRadius: layer.cornerRadius,
    roundable: layer.kind === 'interactive'
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
  onNaturalAspect,
  onPollVote,
  onWidgetAction,
  inputValues,
  onInputValue
}: {
  layer: PenPageLayer;
  allLayers: PenPageLayer[];
  presentation: PenPagePresentation;
  selected: boolean;
  contentW: number;
  contentH: number;
  onSelect: () => void;
  onCommit: (geom: LiveGeom & { bodyWrap: 'left' | 'right' }) => void;
  onPollVote?: (layer: PenPageLayer) => void;
  onWidgetAction?: (layer: PenPageLayer) => void;
  inputValues?: Record<string, string>;
  onInputValue?: (layerId: string, value: string) => void;
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

  const wPx = Math.max(24, Math.min(contentW, live.w));
  const hPx = Math.max(24, Math.min(contentH, live.h));
  const yPx = Math.max(0, Math.min(contentH - hPx, live.y));
  // Clamp X into the *used* content box so a stale wide-page x cannot leave a
  // float:left + huge marginLeft that crushes text into a 1-char column.
  const xPx = Math.max(0, Math.min(contentW - wPx, live.x));
  const leftInsetPx = xPx;
  const rightInsetPx = Math.max(0, contentW - xPx - wPx);
  const side = wrapSideFromGeom(xPx, wPx, contentW);

  const pusherStyle: CSSProperties = {
    float: side,
    width: 0,
    height: `${yPx}px`,
    margin: 0,
    padding: 0,
    border: 0,
    pointerEvents: 'none'
  };

  const wrapChrome = layerChromeStyle(layer);
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
    const { contentW: cw, contentH: ch } = boundsRef.current;
    const clamped = clampLayerRect(g, cw, ch);
    onCommit({ ...clamped, bodyWrap: wrapSideFromGeom(clamped.x, clamped.w, cw) });
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
        selected={selected}
      />
    );
  } else if (layer.widgetElement === 'input') {
    inner = (
      <WidgetTextInput
        layer={layer}
        value={inputValues?.[layer.id] || ''}
        onChange={(layerId, value) => onInputValue?.(layerId, value)}
        onSelect={onSelect}
      />
    );
  } else if (layer.kind === 'text') {
    const html = docToHtml(getTextLayerDoc(layer));
    inner = (
      <div
        className="pen-rich-html h-full w-full overflow-hidden p-2 text-sm"
        style={{
          fontFamily: presentation.fontFamily || undefined
        }}
        title={layerDisplayLabel(layer, allLayers)}
        dangerouslySetInnerHTML={{
          __html: html || '<p class="text-neutral-400">Text</p>'
        }}
      />
    );
  } else if (layer.kind === 'embed') {
    inner = (
      <div
        className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden p-2 text-left text-xs text-stone-200"
        title={layerDisplayLabel(layer, allLayers)}
      >
        <div className="font-medium text-stone-100">Embed</div>
        <div className="truncate font-mono text-[10px] text-stone-400">
          {layer.refDocId || '(no ref)'}
        </div>
      </div>
    );
  } else if (layer.kind === 'interactive') {
    inner = (
      <button
        type="button"
        className="flex h-full w-full items-center justify-center overflow-hidden px-3 text-sm font-medium"
        title={`${layer.behavior || 'interactive'} → ${layer.bindDocId || ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (layer.behavior === 'poll.vote') onPollVote?.(layer);
          else if (layer.behavior) onWidgetAction?.(layer);
          onSelect();
        }}
      >
        {layer.label || 'Action'}
      </button>
    );
  }
  if (!inner) return null;

  return (
    <>
      <div aria-hidden data-wrap-pusher={side} style={pusherStyle} />
      <div
        data-layer-id={layer.id}
        data-wrap={side}
        role="button"
        tabIndex={0}
        className={`overflow-visible ${selected ? 'ring-2 ring-sky-500' : ''}`}
        style={{
          ...boxStyle,
          boxShadow: wrapChrome.boxShadow,
          border: wrapChrome.border,
          outline: wrapChrome.outline,
          outlineOffset: wrapChrome.outlineOffset,
          filter: wrapChrome.filter
        }}
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
            className="absolute bottom-0 right-0 z-20 h-3.5 w-3.5 cursor-se-resize bg-sky-500"
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
  onPageSizeChange,
  onPresentationChange,
  onSnapChange,
  session,
  onPollVote,
  onWidgetAction,
  inputValues,
  onInputValue,
  votedOptionByGroup,
  hideActionBind,
  hideObjectTools,
  buttonCaptionById,
  showToolbar = true,
  clearChrome = false,
  toolbarHost = null,
  scrollWithParent = false,
  showAbsoluteLayers = true,
  pageView,
  pageOrientation = 'portrait',
  viewLocked = false,
  engagementGuide = false,
  paintEngagementGuide = false,
  onPageOrientation,
  onPageView,
  onToggleViewLock,
  onToggleEngagementGuide,
  playheadSec = 0,
  onEnterGroup,
  guideSpan
}: {
  manifest: PenDocManifest;
  section: PenSectionContent;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSectionChange: (next: PenSectionContent) => void;
  onPollVote?: (layer: PenPageLayer) => void;
  onWidgetAction?: (layer: PenPageLayer) => void;
  inputValues?: Record<string, string>;
  onInputValue?: (layerId: string, value: string) => void;
  votedOptionByGroup?: Record<string, string>;
  /** Widget trigger lives in the side pane. Do not repeat it on this toolbar. */
  hideActionBind?: boolean;
  hideObjectTools?: boolean;
  buttonCaptionById?: Record<string, string>;
  /** Inactive pages in a multi-page strip hide the object toolbar. */
  showToolbar?: boolean;
  /** When set, the toolbar is drawn here instead of on this page. */
  toolbarHost?: HTMLElement | null;
  /** The preview pane scrolls the pages. This page does not trap that scroll. */
  scrollWithParent?: boolean;
  /** Screen strip paints the background once; this canvas stays clear. */
  clearChrome?: boolean;
  /** Screen draws every page's layers on one strip instead. */
  showAbsoluteLayers?: boolean;
  pageView?: PenPageView;
  pageOrientation?: PenPageOrientation;
  viewLocked?: boolean;
  /** Orientation-menu toggle. Editor session only; not stored on the doc. */
  engagementGuide?: boolean;
  /** Paint the rail on this page. Screen paints it on the strip's right edge only. */
  paintEngagementGuide?: boolean;
  onPageOrientation?: (orientation: PenPageOrientation) => void;
  onPageView?: (view: PenPageView) => void;
  onToggleViewLock?: () => void;
  onToggleEngagementGuide?: () => void;
  /** Section clock. Layers with keys are sampled here for display only. */
  playheadSec?: number;
  onEnterGroup?: (id: string) => void;
  /** Workspace past the page, in this page's pixels. Guide lines run through it. */
  guideSpan?: { left: number; right: number; top: number; bottom: number };
  onPageSizeChange?: (next: PageSizeChoice) => void;
  onPresentationChange?: (next: Partial<PenPagePresentation>) => void;
  onSnapChange?: (enabled: boolean) => void;
  session?: PenSession | null;
}) {
  const layersBtnRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetMeasureRef = useRef<HTMLDivElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [measureUnit, setMeasureUnit] = useState<PageMeasureUnit>('in');
  const pageToolsRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([PAGE_LAYER_ID]);
  const [fontsReady, setFontsReady] = useState(true);
  const [contentOuterH, setContentOuterH] = useState(400);
  const [measuredSheetW, setMeasuredSheetW] = useState(640);
  const [measuredSheetH, setMeasuredSheetH] = useState(0);
  const [panelHeightPx, setPanelHeightPx] = useState(0);

  useEffect(() => {
    if (!pageSizeOpen && !guidesOpen) return;
    function onDoc(e: MouseEvent) {
      if (pageToolsRef.current?.contains(e.target as Node)) return;
      setPageSizeOpen(false);
      setGuidesOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pageSizeOpen, guidesOpen]);

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
  const layers = useMemo(
    () => sampleSectionLayers(prepared, playheadSec),
    [prepared, playheadSec]
  );
  const wrapLayers = useMemo(
    () => layers.filter((l) => l.visible !== false && Boolean(l.bodyWrap)),
    [layers]
  );
  const absoluteLayers = useMemo(
    () => layers.filter((l) => l.visible !== false && !l.bodyWrap),
    [layers]
  );
  const guideLayers = absoluteLayers.filter((layer) => layer.kind === 'guide');
  const items = absoluteLayers.filter((layer) => layer.kind !== 'guide').map(layerToItem);
  const snapGuides = {
    x: guideLayers.filter((layer) => layer.guideAxis !== 'horizontal').map((layer) => layer.x + pad),
    y: guideLayers.filter((layer) => layer.guideAxis === 'horizontal').map((layer) => layer.y + pad)
  };
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
    heightPx: manifest.flowWorkspaceHeightPx,
    sizeId: manifest.pageSize
  });
  const contentHInner = Math.max(0, contentOuterH - 2 * pad);
  const flowFillsPanel = flowOpen && flowHeight == null;
  const dragContentH = flowFillsPanel
    ? openFlowDragHeightPx(contentHInner, panelHeightPx, pad)
    : contentHInner;
  const box = contentBoxSize(
    sheet,
    pad,
    dragContentH,
    measuredSheetW,
    scrollWithParent && measuredSheetH > 0 ? measuredSheetH : undefined
  );
  const artboard = pageAllowsPasteboard(manifest.pageLayout, manifest.flowWorkspaceWidthPx);
  const artboardGutter = artboard && !scrollWithParent
    ? pasteboardGutterPx(
        items.map((item) => ({ x: item.x + pad, y: item.y + pad, w: item.w, h: item.h })),
        box.width + 2 * pad,
        box.height + 2 * pad
      )
    : 0;

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
      const h = scrollWithParent
        ? Math.max(el.clientHeight, 1)
        : Math.max(el.scrollHeight, el.clientHeight, sheet.pageHeightPx || 320);
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
    const measure = () => {
      setMeasuredSheetW(el.clientWidth || 640);
      setMeasuredSheetH(el.clientHeight || 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flowOpen, flowWidth, manifest.pageLayout]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setPanelHeightPx(el.clientHeight || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flowOpen]);

  function onLayoutChange(nextItems: LayoutItem[]) {
    let next = applyLayoutAtPlayhead(prepared, nextItems, playheadSec);
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
    let next = applyLayoutAtPlayhead(
      prepared,
      [
        {
          id: layerId,
          x: patch.x,
          y: patch.y,
          w: patch.w,
          h: patch.h,
          zIndex: layer.zIndex
        }
      ],
      playheadSec
    );
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
      applyLayoutAtPlayhead(
        prepared,
        [
          {
            id: layer.id,
            x: fitted.x,
            y: fitted.y,
            w: fitted.w,
            h: fitted.h,
            zIndex: layer.zIndex
          }
        ],
        playheadSec
      )
    );
  }

  function getLinkedIds(id: string): string[] {
    if (!groupIds.has(id)) return [];
    return layers.filter((l) => l.parentGroupId === id).map((l) => l.id);
  }

  function addGuide(axis: 'vertical' | 'horizontal') {
    const position = axis === 'vertical' ? box.width / 2 : box.height / 2;
    onSectionChange(upsertLayer(prepared, createGuideLayer(axis, position)));
    setGuidesOpen(false);
  }

  function choosePageSize(id: PageSizeChoice['id']) {
    if (!onPageSizeChange) return;
    onPageSizeChange(
      selectPageSize(id, {
        layout: manifest.pageLayout,
        widthPx: manifest.flowWorkspaceWidthPx,
        heightPx: manifest.flowWorkspaceHeightPx,
        sizeId: manifest.pageSize
      },
      pageOrientation
    )
    );
    selectLayer(PAGE_LAYER_ID);
    if (id !== 'custom') setPageSizeOpen(false);
  }

  function setCustomPx(axis: 'width' | 'height', raw: number) {
    if (!onPageSizeChange || !Number.isFinite(raw)) return;
    const px = clampPageSizePx(measureToPx(raw, measureUnit));
    onPageSizeChange({
      id: 'custom',
      label: 'Custom',
      layout: 'flow',
      widthPx: axis === 'width' ? px : customWidthPx,
      heightPx: axis === 'height' ? px : customHeightPx
    });
  }

  const pageSizeChoice = matchPageSize(
    manifest.pageLayout,
    manifest.flowWorkspaceWidthPx,
    manifest.flowWorkspaceHeightPx,
    manifest.pageSize
  );
  const customWidthPx = pageSizeChoice.widthPx ?? DEFAULT_FLOW_WORKSPACE_WIDTH_PX;
  const customHeightPx = pageSizeChoice.heightPx ?? DEFAULT_FLOW_WORKSPACE_HEIGHT_PX;

  const frameStyle: CSSProperties = pageFrameStyle(presentation);
  if (
    scrollWithParent &&
    !clearChrome &&
    frameStyle.backgroundColor === 'transparent' &&
    !frameStyle.backgroundImage
  ) {
    delete frameStyle.backgroundColor;
  }
  const bodyHtml = docToHtml(prepared.doc);
  const bodyStyle = bodyMarginStyle(presentation);
  const chrome = showToolbar ? (
    <>
      <div
        ref={pageToolsRef}
        className="relative z-20 flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-2 py-1.5"
      >
        {onPageSizeChange && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Page size"
              aria-expanded={pageSizeOpen}
              className="h-6 rounded px-1.5 text-[11px] font-bold text-black"
              onClick={() => {
                setPageSizeOpen((open) => !open);
                setGuidesOpen(false);
              }}
            >
              {pageSizeChoice.label}
            </button>
            {pageSizeOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-[min(24rem,70vh)] w-56 overflow-auto rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
                {PAGE_SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={pageSizeChoice.id === preset.id}
                    className={`block w-full rounded px-2 py-1 text-left text-[11px] font-bold ${
                      pageSizeChoice.id === preset.id
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                    onClick={() => choosePageSize(preset.id)}
                  >
                    {orientPageSize(preset, pageOrientation).label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={pageSizeChoice.id === 'custom'}
                  className={`block w-full rounded px-2 py-1 text-left text-[11px] font-bold ${
                    pageSizeChoice.id === 'custom'
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                  onClick={() => choosePageSize('custom')}
                >
                  Custom
                </button>
                {pageSizeChoice.id === 'custom' && (
                  <div className="mt-2 border-t border-neutral-200 pt-2">
                    <div className="mb-2 flex gap-1">
                      {PAGE_MEASURE_UNITS.map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          aria-pressed={measureUnit === unit}
                          className={`flex-1 rounded px-1 py-0.5 text-[10px] font-bold uppercase ${
                            measureUnit === unit
                              ? 'bg-neutral-900 text-white'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                          onClick={() => setMeasureUnit(unit)}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                    <label className="mb-1 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                      Width
                      <input
                        type="number"
                        aria-label="Custom width"
                        step={measureUnit === 'mm' ? 0.1 : 0.01}
                        className="h-7 w-20 rounded border border-neutral-200 px-1.5 text-[12px] font-bold text-black"
                        value={pxToMeasure(customWidthPx, measureUnit)}
                        onChange={(e) => setCustomPx('width', Number(e.target.value))}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                      Height
                      <input
                        type="number"
                        aria-label="Custom height"
                        step={measureUnit === 'mm' ? 0.1 : 0.01}
                        className="h-7 w-20 rounded border border-neutral-200 px-1.5 text-[12px] font-bold text-black"
                        value={pxToMeasure(customHeightPx, measureUnit)}
                        onChange={(e) => setCustomPx('height', Number(e.target.value))}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {pageView && onPageOrientation && onPageView && onToggleViewLock && (
          <PreviewOrientationMenu
            pageOrientation={pageOrientation}
            pageView={pageView}
            viewLocked={viewLocked}
            engagementGuide={engagementGuide}
            onPageOrientation={onPageOrientation}
            onPageView={onPageView}
            onToggleViewLock={onToggleViewLock}
            onToggleEngagementGuide={onToggleEngagementGuide}
          />
        )}
        <div className="relative shrink-0">
          <button
            type="button"
            title="Guidelines"
            aria-label="Guidelines"
            aria-expanded={guidesOpen}
            className={`flex h-6 w-6 items-center justify-center rounded ${
              guidesOpen ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-black'
            }`}
            onClick={() => {
              setGuidesOpen((open) => !open);
              setPageSizeOpen(false);
            }}
          >
            <IconTapeMeasure width={14} height={14} />
          </button>
          {guidesOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                aria-label="Add vertical guide"
                title="Add vertical guide"
                className="flex h-8 w-8 items-center justify-center rounded text-neutral-700 hover:bg-neutral-100"
                onClick={() => addGuide('vertical')}
              >
                <span className="block h-5 w-px bg-neutral-800" />
              </button>
              <button
                type="button"
                aria-label="Add horizontal guide"
                title="Add horizontal guide"
                className="flex h-8 w-8 items-center justify-center rounded text-neutral-700 hover:bg-neutral-100"
                onClick={() => addGuide('horizontal')}
              >
                <span className="block h-px w-5 bg-neutral-800" />
              </button>
            </div>
          )}
        </div>
        {onSnapChange && (
          <button
            type="button"
            title={snapEnabled ? 'Snap to center and guides on' : 'Snap to center and guides off'}
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
            hideActionBind={hideActionBind}
            hideObjectTools={hideObjectTools}
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
        session={session}
        docId={manifest.docId}
        onEnterGroup={onEnterGroup}
      />
    </>
  ) : null;

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col ${
        clearChrome || scrollWithParent ? 'bg-transparent' : 'bg-white'
      }`}
    >
      {chrome && toolbarHost
        ? createPortal(chrome, toolbarHost)
        : scrollWithParent
          ? null
          : chrome}

      <div
        ref={scrollerRef}
        className={
          scrollWithParent
            ? `relative flex h-full min-h-0 w-full flex-col bg-transparent p-0 ${
                artboard ? 'overflow-visible' : 'overflow-hidden'
              }`
            : `relative flex min-h-0 flex-1 overflow-auto ${clearChrome ? 'bg-transparent' : 'bg-neutral-100'} ${
                flowOpen ? 'items-stretch p-0' : 'items-start justify-center p-6'
              }`
        }
        style={artboard ? { padding: artboardGutter } : undefined}
      >
        <PageSheetColumn
          sheetRef={sheetMeasureRef}
          pageLayout={manifest.pageLayout}
          flowWorkspaceWidthPx={manifest.flowWorkspaceWidthPx}
          flowWorkspaceHeightPx={manifest.flowWorkspaceHeightPx}
          pageSize={manifest.pageSize}
          contentOuterHeightPx={contentOuterH}
          style={artboard ? { ...frameStyle, overflow: 'visible' } : frameStyle}
          bare={
            !scrollWithParent &&
            presentation.backgroundColor === 'transparent' &&
            !presentation.backgroundGradient &&
            !presentation.backgroundImage &&
            !presentation.backgroundVideo
          }
          className={
            scrollWithParent
              ? 'h-full min-h-0 w-full shadow-none'
              : flowOpen
                ? 'min-h-full shadow-none'
                : undefined
          }
          fitParent
          containInParent={scrollWithParent}
          onClick={() => selectLayer(PAGE_LAYER_ID)}
          composeExportRoot
        >
          {presentation.backgroundVideo && (
            <ResolvedPageBackground
              src={presentation.backgroundVideo}
              editProxySrc={presentation.editProxySrc}
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
            className={`pen-rich-html relative z-0 ${scrollWithParent ? 'h-full overflow-hidden' : ''} ${fontsReady ? '' : 'opacity-90'}`}
            style={{
              ...bodyStyle,
              minHeight: scrollWithParent ? undefined : sheet.pageHeightPx || box.height + 2 * pad
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
                onPollVote={onPollVote}
                onWidgetAction={onWidgetAction}
                inputValues={inputValues}
                onInputValue={onInputValue}
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

            {/* Layers cover the whole page. Body text keeps the margin. */}
            {showAbsoluteLayers && !scrollWithParent && guideLayers.length > 0 && (
              <PageGuides
                guides={guideLayers.map((layer) => ({
                  id: layer.id,
                  axis: layer.guideAxis === 'horizontal' ? 'horizontal' : 'vertical',
                  position: (layer.guideAxis === 'horizontal' ? layer.y : layer.x) + pad
                }))}
                span={guideSpan}
                onMove={(id, position) => {
                  const layer = guideLayers.find((item) => item.id === id);
                  if (!layer) return;
                  const stored = position - pad;
                  onSectionChange(
                    updateLayerLayout(prepared, [
                      {
                        id,
                        x: layer.guideAxis === 'horizontal' ? layer.x : stored,
                        y: layer.guideAxis === 'horizontal' ? stored : layer.y,
                        w: layer.w,
                        h: layer.h,
                        zIndex: layer.zIndex
                      }
                    ])
                  );
                }}
              />
            )}
            {showAbsoluteLayers && (
            <LayoutSurface
              className="pointer-events-none absolute z-[1] overflow-visible"
              style={
                {
                  top: 0,
                  left: 0,
                  width: box.width + 2 * pad,
                  height: box.height + 2 * pad
                } as CSSProperties
              }
              items={items.map((item) => ({ ...item, x: item.x + pad, y: item.y + pad }))}
              bounds={{ width: box.width + 2 * pad, height: box.height + 2 * pad }}
              freePlacement={artboard}
              frameStyle={(item) => {
                const layer = layers.find((entry) => entry.id === item.id);
                return layer ? layerChromeStyle(layer) : {};
              }}
              selectedId={pageActive ? null : activeLayerId}
              snapToPageCenter={snapEnabled}
              snapGuides={snapGuides}
              guideSpan={guideSpan}
              getLinkedIds={getLinkedIds}
              resizeDisabledIds={groupIds}
              lockAspectRatioIds={mediaAspectLockIds}
              onSelect={(id) => selectLayer(id || PAGE_LAYER_ID)}
              onChange={(next) =>
                onLayoutChange(next.map((item) => ({ ...item, x: item.x - pad, y: item.y - pad })))
              }
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
                        selected={activeLayerId === layer.id}
                      />
                    </div>
                  );
                }
                if (layer.kind === 'embed') {
                  return (
                    <div
                      className="flex h-full w-full flex-col justify-center gap-1 overflow-hidden p-2 text-left text-xs text-stone-200"
                      style={shell}
                      title={layerDisplayLabel(layer, layers)}
                    >
                      <div className="font-medium text-stone-100">Embed</div>
                      <div className="truncate font-mono text-[10px] text-stone-400">
                        {layer.refDocId || '(no ref)'}
                      </div>
                    </div>
                  );
                }
                if (layer.widgetElement === 'svg' && layer.svgSrc) {
                  return (
                    <div
                      className="h-full w-full overflow-hidden"
                      style={shell}
                      dangerouslySetInnerHTML={{ __html: sanitizeWidgetMarkup(layer.svgSrc) }}
                    />
                  );
                }
                if (layer.widgetElement === 'input') {
                  return (
                    <WidgetTextInput
                      layer={layer}
                      value={inputValues?.[layer.id] || ''}
                      onChange={(layerId, value) => onInputValue?.(layerId, value)}
                      onSelect={() => selectLayer(layer.id)}
                    />
                  );
                }
                if (layer.widgetElement === 'html') {
                  return (
                    <iframe
                      title={layer.name || 'Snippet'}
                      sandbox=""
                      className="pointer-events-auto h-full w-full border-0 bg-white"
                      srcDoc={layer.htmlSource || ''}
                    />
                  );
                }
                if (layer.widgetElement === 'time') {
                  return (
                    <div
                      className="flex h-full w-full items-center justify-center text-xs"
                      style={shell}
                    >
                      {timeLayerCaption(layer)}
                    </div>
                  );
                }
                if (layer.kind === 'interactive') {
                  const groupKey = layer.parentGroupId || 'doc';
                  const counts =
                    layers.find((item) => item.id === layer.parentGroupId)?.widgetCounts || null;
                  const runtime =
                    layer.behavior === 'poll.vote'
                      ? voteFaceForLayer(
                          prepared,
                          layer,
                          votedOptionByGroup?.[groupKey] || null,
                          counts
                        ).text
                      : buttonCaptionById?.[layer.id];
                  const face = layer.textDoc ? docToPlainText(layer.textDoc) : '';
                  const rich = face ? docToHtml(layer.textDoc) : '';
                  return (
                    <button
                      type="button"
                      className="pointer-events-auto flex h-full w-full items-center justify-center overflow-hidden px-3 text-sm font-medium"
                      style={shell}
                      title={layer.behavior || 'button'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (layer.behavior === 'poll.vote') onPollVote?.(layer);
                        else if (layer.behavior === 'widget.reveal') {
                          onSectionChange(revealSibling(prepared, layer.id));
                        } else if (layer.behavior) onWidgetAction?.(layer);
                        selectLayer(layer.id);
                      }}
                    >
                      {runtime ? (
                        runtime
                      ) : rich ? (
                        <span
                          className="pen-rich-html"
                          dangerouslySetInnerHTML={{ __html: rich }}
                        />
                      ) : (
                        layer.label || 'Button'
                      )}
                    </button>
                  );
                }
                if (layer.backgroundVideo) {
                  return (
                    <div className="relative h-full w-full overflow-hidden" style={shell}>
                      <div className="absolute inset-0">
                        <ResolvedPageBackground
                          src={layer.backgroundVideo}
                          editProxySrc={layer.editProxySrc}
                          videoSrc={layer.videoSrc}
                          kind="video"
                          docId={manifest.docId}
                          session={session}
                        />
                      </div>
                      <div
                        className="pen-rich-html relative h-full w-full overflow-auto p-2 text-sm"
                        style={{
                          fontFamily: presentation.fontFamily || undefined
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
                        fontFamily: presentation.fontFamily || undefined
                      }}
                      dangerouslySetInnerHTML={{
                        __html: html || '<p class="text-neutral-400">Text</p>'
                      }}
                    />
                  </div>
                );
              }}
            />
            )}
          </div>
        </PageSheetColumn>
        {paintEngagementGuide ? <PublishedEngagementBar /> : null}
      </div>
    </div>
  );
}
