import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { snapLayoutToPageCenter, resizeSeKeepAspect, fitAspectInBox } from '@par-noir/pen-protocol';
import { clampLayoutItem, sortByZ, type LayoutBounds, type LayoutItem } from './types';

type DragMode = 'move' | 'resize';

interface DragState {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  orig: LayoutItem;
  /** Snapshot of linked items at drag start (group members). */
  linkedOrig: Record<string, LayoutItem>;
}

export function LayoutSurface({
  items,
  onChange,
  selectedId,
  onSelect,
  className,
  style,
  renderItem,
  disabled,
  snapToPageCenter,
  getLinkedIds,
  resizeDisabledIds,
  lockAspectRatioIds,
  bounds
}: {
  items: LayoutItem[];
  onChange: (next: LayoutItem[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
  style?: CSSProperties;
  renderItem: (item: LayoutItem, selected: boolean) => ReactNode;
  disabled?: boolean;
  snapToPageCenter?: boolean;
  /** When moving `id`, also move these ids by the same delta. */
  getLinkedIds?: (id: string) => string[];
  /** Hide resize handle for these ids (e.g. group roots). */
  resizeDisabledIds?: Set<string> | string[];
  /** Keep w/h ratio while resizing (image / video layers). */
  lockAspectRatioIds?: Set<string> | string[];
  /** Content-box size in CSS px (clamp + snap). */
  bounds?: LayoutBounds;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Live geometry while dragging — commit to parent only on pointer up. */
  const [preview, setPreview] = useState<Record<string, LayoutItem> | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  /** Pending move — only becomes a drag after a small pointer travel (tap vs drag). */
  const pendingMove = useRef<{
    id: string;
    startX: number;
    startY: number;
    pointerId: number;
    orig: LayoutItem;
    linkedOrig: Record<string, LayoutItem>;
    target: HTMLElement;
  } | null>(null);
  const MOVE_THRESHOLD_PX = 6;
  const noResize = useCallback(
    (id: string) => {
      if (!resizeDisabledIds) return false;
      if (Array.isArray(resizeDisabledIds)) return resizeDisabledIds.includes(id);
      return resizeDisabledIds.has(id);
    },
    [resizeDisabledIds]
  );
  const lockAspect = useCallback(
    (id: string) => {
      if (!lockAspectRatioIds) return false;
      if (Array.isArray(lockAspectRatioIds)) return lockAspectRatioIds.includes(id);
      return lockAspectRatioIds.has(id);
    },
    [lockAspectRatioIds]
  );

  function activeBounds(): LayoutBounds {
    const el = surfaceRef.current;
    return {
      width: boundsRef.current?.width || el?.clientWidth || 736,
      height: boundsRef.current?.height || el?.clientHeight || 976
    };
  }

  const onPointerDownMove = (e: ReactPointerEvent, item: LayoutItem) => {
    e.stopPropagation();
    onSelect?.(item.id);
    if (disabled || item.positionLocked) return;
    // Don't capture / drag yet — let taps reach video play/pause & scrubbers.
    const linked = getLinkedIds?.(item.id) || [];
    const linkedOrig: Record<string, LayoutItem> = {};
    for (const lid of linked) {
      const hit = items.find((i) => i.id === lid);
      if (hit) linkedOrig[lid] = { ...hit };
    }
    pendingMove.current = {
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      orig: { ...item },
      linkedOrig,
      target: e.currentTarget as HTMLElement
    };
  };

  const onPointerDownResize = (e: ReactPointerEvent, item: LayoutItem) => {
    if (disabled || item.positionLocked || noResize(item.id)) return;
    e.stopPropagation();
    pendingMove.current = null;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onSelect?.(item.id);
    setDrag({
      id: item.id,
      mode: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...item },
      linkedOrig: {}
    });
    setPreview({ [item.id]: { ...item } });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (disabled) return;

    if (!drag && pendingMove.current) {
      const p = pendingMove.current;
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (dist < MOVE_THRESHOLD_PX) return;
      p.target.setPointerCapture?.(p.pointerId);
      setDrag({
        id: p.id,
        mode: 'move',
        startX: p.startX,
        startY: p.startY,
        orig: p.orig,
        linkedOrig: p.linkedOrig
      });
      setPreview({ [p.id]: { ...p.orig } });
      pendingMove.current = null;
      return;
    }

    if (!drag) return;
    const b = activeBounds();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === 'move') {
      const next = { x: drag.orig.x + dx, y: drag.orig.y + dy, w: drag.orig.w, h: drag.orig.h };
      const snapped = snapLayoutToPageCenter(next, {
        enabled: snapToPageCenter,
        contentW: b.width,
        contentH: b.height
      });
      const appliedDx = snapped.x - drag.orig.x;
      const appliedDy = snapped.y - drag.orig.y;
      setGuides({ v: snapped.snappedX, h: snapped.snappedY });
      const nextPreview: Record<string, LayoutItem> = {
        [drag.id]: clampLayoutItem({ ...drag.orig, x: snapped.x, y: snapped.y }, b)
      };
      for (const lid of Object.keys(drag.linkedOrig)) {
        const orig = drag.linkedOrig[lid]!;
        nextPreview[lid] = clampLayoutItem(
          {
            ...orig,
            x: orig.x + appliedDx,
            y: orig.y + appliedDy
          },
          b
        );
      }
      setPreview(nextPreview);
    } else {
      setGuides({ v: false, h: false });
      let next: LayoutItem;
      if (lockAspect(drag.id)) {
        const sized = resizeSeKeepAspect(drag.orig, dx, dy);
        const aspect = drag.orig.w / Math.max(1, drag.orig.h);
        const maxW = Math.max(24, b.width - drag.orig.x);
        const maxH = Math.max(24, b.height - drag.orig.y);
        const fitted = fitAspectInBox(
          aspect,
          Math.min(sized.w, maxW),
          Math.min(sized.h, maxH)
        );
        next = clampLayoutItem({ ...drag.orig, w: fitted.w, h: fitted.h }, b);
      } else {
        next = clampLayoutItem(
          {
            ...drag.orig,
            w: drag.orig.w + dx,
            h: drag.orig.h + dy
          },
          b
        );
      }
      setPreview({ [drag.id]: next });
    }
  };

  const onPointerUp = () => {
    pendingMove.current = null;
    if (drag && preview) {
      const base = itemsRef.current;
      onChange(base.map((i) => (preview[i.id] ? { ...i, ...preview[i.id] } : i)));
    }
    setDrag(null);
    setPreview(null);
    setGuides({ v: false, h: false });
  };

  const displayItems = preview
    ? items.map((i) => (preview[i.id] ? { ...i, ...preview[i.id] } : i))
    : items;

  const b = activeBounds();
  const guideX = b.width / 2;
  const guideY = b.height / 2;

  return (
    <div
      ref={surfaceRef}
      // Callers pass positioning (e.g. absolute inset-0). Do not also set
      // `relative` here — Tailwind position utilities conflict.
      className={`touch-none ${className || 'relative'}`}
      style={style}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerDown={() => onSelect?.(null)}
    >
      {guides.v && (
        <div
          className="pointer-events-none absolute top-0 z-30 w-px -translate-x-1/2 bg-sky-400/80"
          style={{ left: guideX, height: '100%' }}
        />
      )}
      {guides.h && (
        <div
          className="pointer-events-none absolute left-0 z-30 h-px -translate-y-1/2 bg-sky-400/80"
          style={{ top: guideY, width: '100%' }}
        />
      )}
      {sortByZ(displayItems).map((item) => {
        const selected = selectedId === item.id;
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className={`absolute box-border overflow-hidden pointer-events-auto ${
              selected ? 'ring-2 ring-sky-500' : 'ring-1 ring-stone-300/80'
            } ${disabled || item.positionLocked ? '' : 'cursor-grab active:cursor-grabbing'}`}
            style={{
              left: item.x,
              top: item.y,
              width: item.w,
              height: item.h,
              zIndex: item.zIndex
            }}
            onPointerDown={(e) => onPointerDownMove(e, item)}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="h-full w-full overflow-hidden">{renderItem(item, selected)}</div>
            {!disabled && !item.positionLocked && selected && !noResize(item.id) && (
              <div
                className="absolute bottom-0 right-0 z-20 h-3.5 w-3.5 cursor-se-resize bg-sky-500"
                onPointerDown={(e) => onPointerDownResize(e, item)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { LayoutItem, LayoutBounds };
export { clampLayoutItem, sortByZ };
