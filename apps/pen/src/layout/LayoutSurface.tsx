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
}

export function LayoutSurface({
  items,
  onChange,
  selectedId,
  onSelect,
  className,
  renderItem,
  disabled,
  snapToPageCenter
}: {
  items: LayoutItem[];
  onChange: (next: LayoutItem[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
  renderItem: (item: LayoutItem, selected: boolean) => ReactNode;
  disabled?: boolean;
  snapToPageCenter?: boolean;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

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
    setDrag({
      id: item.id,
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...item }
    });
  };

  const onPointerDownResize = (e: ReactPointerEvent, item: LayoutItem) => {
    if (disabled || item.positionLocked) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onSelect?.(item.id);
    setDrag({
      id: item.id,
      mode: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...item }
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
      next = { ...next, x: snapped.x, y: snapped.y };
      setGuides({ v: snapped.snappedX, h: snapped.snappedY });
      updateItem(drag.id, { x: next.x, y: next.y });
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
      className={`relative touch-none ${className || ''}`}
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
            className={`absolute box-border overflow-hidden ${
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
            {!disabled && !item.positionLocked && selected && (
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
