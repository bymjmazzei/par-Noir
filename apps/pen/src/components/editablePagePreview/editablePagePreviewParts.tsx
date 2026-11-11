import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
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
  docToPlainText,
  fitAspectInBox,
  sizeMediaLayerForAttach,
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
  selectPageSize,
  sanitizeWidgetMarkup,
  updateLayerLayout,
  upsertLayer,
  applyPageBackgroundVideoDuration,
  voteFaceForLayer,
  wrapSideFromGeom,
  type PageSizeChoice,
  type PenDocManifest,
  type PenPageLayer,
  type PageMeasureUnit,
  type PenPageOrientation,
  type PenPageView,
  type PenPagePresentation,
  type PenTextVerticalAlign,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { type LayoutItem } from '../layout';
import { PreviewLayerFace } from '../PreviewLayerFace';
import { layerFaceStyle, layerFrameStyle } from '@par-noir/feed-tile';
import { useResolvedMediaSrc } from '../../hooks/useResolvedMediaSrc';
import type { PenSession } from '../../services/penSession';
import { waitForPageBackgroundVideoDurationSec } from '../../services/videoLayerDuration';
/** Probe page background video length for the section clock (not tied to timeline UI). */
export function PageBackgroundVideoDuration({
  src,
  docId,
  session,
  onDuration
}: {
  src: string;
  docId?: string;
  session?: PenSession | null;
  onDuration: (seconds: number) => void;
}) {
  const playSrc = publishPlaybackSrc({ backgroundVideo: src });
  const { resolved } = useResolvedMediaSrc(playSrc, { docId, session });
  const report = useRef(onDuration);
  report.current = onDuration;
  const reportedForSrc = useRef<string | null>(null);
  useEffect(() => {
    if (!resolved) return;
    if (reportedForSrc.current === resolved) return;
    let cancel = false;
    void waitForPageBackgroundVideoDurationSec(resolved).then((seconds) => {
      if (cancel || !seconds) return;
      if (reportedForSrc.current === resolved) return;
      reportedForSrc.current = resolved;
      report.current(seconds);
    });
    return () => {
      cancel = true;
    };
  }, [resolved]);
  return null;
}

export function sectionWithPageBackgroundDuration(
  section: PenSectionContent,
  seconds: number
): PenSectionContent {
  return applyPageBackgroundVideoDuration(section, seconds);
}
export function layerToItem(layer: PenPageLayer): LayoutItem {
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
    roundable: layer.kind === 'interactive',
    contentScale: layer.contentScale
  };
}

export function bodyMarginStyle(presentation: PenPagePresentation): CSSProperties {
  const pad = resolvePagePaddingPx(presentation.padding);
  return {
    padding: `${pad}px`,
    fontFamily: presentation.fontFamily || 'Georgia',
    fontSize: `${presentation.fontSize || 16}px`,
    color: presentation.textColor || '#111111',
    textAlign: presentation.textAlign || 'left'
  };
}

/** Body content block inside the flex-column page body. */
export function bodyVerticalAlignStyle(align: PenTextVerticalAlign | undefined): CSSProperties {
  if (align === 'middle') return { marginTop: 'auto', marginBottom: 'auto' };
  if (align === 'bottom') return { marginTop: 'auto' };
  return {};
}

export function opaqueWrapShell(layer: PenPageLayer): CSSProperties {
  const shell = layerFaceStyle(layer);
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
export function BodyWrapObject({
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

  const wrapChrome = layerFrameStyle(layer);
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

  const inner = (
    <PreviewLayerFace
      layer={layer}
      layers={allLayers}
      presentation={presentation}
      session={session}
      docId={docId}
      inputValues={inputValues}
      onInputValue={onInputValue}
      onSelect={onSelect}
      onNaturalAspect={onNaturalAspect}
      selected={selected}
    />
  );

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

