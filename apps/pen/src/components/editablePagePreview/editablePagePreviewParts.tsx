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
import { type LayoutItem } from '../layout';
import { WidgetTextInput } from '../WidgetTextInput';
import { layerDisplayLabel } from '../LayersPanel';
import {
  layerChromeStyle,
  layerPreviewStyle
} from '../LayerObjectToolbar';
import { LayerMediaContent } from '../LayerMediaContent';
import { PenMediaPlayer, PublishedEngagementBar } from '@par-noir/feed-tile';
import { usePlaybackMode } from '../../hooks/usePlaybackMode';
import { useResolvedMediaSrc } from '../../hooks/useResolvedMediaSrc';
import type { PenSession } from '../../services/penSession';
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
        : editorPlaybackSrc({ editProxySrc, videoSrc, backgroundVideo: src })
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
    roundable: layer.kind === 'interactive'
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

export function opaqueWrapShell(layer: PenPageLayer): CSSProperties {
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

