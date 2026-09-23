import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { snapLayoutToPageCenter } from '@par-noir/pen-protocol';
import { clampLayoutItem, sortByZ, type LayoutItem } from './types';

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
  renderItem,
  disabled,
  snapToPageCenter,
  getLinkedIds,
  resizeDisabledIds
}: {
  items: LayoutItem[];
  onChange: (next: LayoutItem[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
  renderItem: (item: LayoutItem, selected: boolean) => ReactNode;
  disabled?: boolean;
  snapToPageCenter?: boolean;
  /** When moving `id`, also move these ids by the same delta. */
  getLinkedIds?: (id: string) => string[];
  /** Hide resize handle for these ids (e.g. group roots). */
  resizeDisabledIds?: Set<string> | string[];
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const noResize = useCallback(
    (id: string) => {
      if (!resizeDisabledIds) return false;
      if (Array.isArray(resizeDisabledIds)) return resizeDisabledIds.includes(id);
      return resizeDisabledIds.has(id);
    },
    [resizeDisabledIds]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<LayoutItem>) => {
      onChange(
        items.map((i) => (i.id === id ? clampLayoutItem({ ...i, ...patch }) : i))
      );
    },
    [items, onChange]
  );

  const onPointerDownMove = (e: ReactPointerEvent, item: LayoutItem) => {
    e.stopPropagation();
    onSelect?.(item.id);
    if (disabled || item.positionLocked) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const linked = getLinkedIds?.(item.id) || [];
    const linkedOrig: Record<string, LayoutItem> = {};
    for (const lid of linked) {
      const hit = items.find((i) => i.id === lid);
      if (hit) linkedOrig[lid] = { ...hit };
    }
    setDrag({
      id: item.id,
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...item },
      linkedOrig
    });
  };

  const onPointerDownResize = (e: ReactPointerEvent, item: LayoutItem) => {
    if (disabled || item.positionLocked || noResize(item.id)) return;
    e.stopPropagation();
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
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag || disabled) return;
    const el = surfaceRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / r.width) * 100;
    const dy = ((e.clientY - drag.startY) / r.height) * 100;
    if (drag.mode === 'move') {
      let next = { x: drag.orig.x + dx, y: drag.orig.y + dy, w: drag.orig.w, h: drag.orig.h };
      const snapped = snapLayoutToPageCenter(next, { enabled: snapToPageCenter });
      const appliedDx = snapped.x - drag.orig.x;
      const appliedDy = snapped.y - drag.orig.y;
      setGuides({ v: snapped.snappedX, h: snapped.snappedY });
      const linkedIds = new Set(Object.keys(drag.linkedOrig));
      onChange(
        items.map((i) => {
          if (i.id === drag.id) {
            return clampLayoutItem({ ...i, x: snapped.x, y: snapped.y });
          }
          if (linkedIds.has(i.id)) {
            const orig = drag.linkedOrig[i.id]!;
            return clampLayoutItem({ ...i, x: orig.x + appliedDx, y: orig.y + appliedDy });
          }
          return i;
        })
      );
    } else {
      setGuides({ v: false, h: false });
      updateItem(drag.id, { w: drag.orig.w + dx, h: drag.orig.h + dy });
    }
  };

  const onPointerUp = () => {
    setDrag(null);
    setGuides({ v: false, h: false });
  };

  return (
    <div
      ref={surfaceRef}
      // Callers pass positioning (e.g. absolute inset-0). Do not also set
      // `relative` here — Tailwind position utilities conflict, and `relative`
      // wins in the stylesheet, which drops overlays under Body in the preview.
      className={`touch-none ${className || 'relative'}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerDown={() => onSelect?.(null)}
    >
      {guides.v && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-px -translate-x-1/2 bg-sky-400/80" />
      )}
      {guides.h && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 h-px -translate-y-1/2 bg-sky-400/80" />
      )}
      {sortByZ(items).map((item) => {
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
              left: `${item.x}%`,
              top: `${item.y}%`,
              width: `${item.w}%`,
              height: `${item.h}%`,
              zIndex: item.zIndex
            }}
            onPointerDown={(e) => onPointerDownMove(e, item)}
          >
            <div className="h-full w-full overflow-auto">{renderItem(item, selected)}</div>
            {!disabled && !item.positionLocked && selected && !noResize(item.id) && (
              <div
                className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-sky-500"
                onPointerDown={(e) => onPointerDownResize(e, item)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { LayoutItem };
export { clampLayoutItem, sortByZ };
