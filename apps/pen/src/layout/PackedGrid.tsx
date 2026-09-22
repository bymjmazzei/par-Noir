import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  DASHBOARD_COLS,
  swapDashboardTiles,
  type DashboardGridTile
} from '../services/penClassPrefs';

/**
 * Packed CSS grid: drag a tile onto another cell to swap (1×1).
 * Not absolute LayoutSurface.
 */
export function PackedGrid({
  tiles,
  onChange,
  className,
  renderTile,
  columns = DASHBOARD_COLS
}: {
  tiles: DashboardGridTile[];
  onChange: (next: DashboardGridTile[]) => void;
  className?: string;
  columns?: number;
  renderTile: (tile: DashboardGridTile, opts: { dragging: boolean; dropTarget: boolean }) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const maxRow = tiles.reduce((m, t) => Math.max(m, t.row + t.rowSpan), 1);

  const tileAtCell = useCallback(
    (col: number, row: number): DashboardGridTile | undefined =>
      tiles.find(
        (t) =>
          col >= t.col &&
          col < t.col + t.colSpan &&
          row >= t.row &&
          row < t.row + t.rowSpan
      ),
    [tiles]
  );

  const cellFromPoint = useCallback(
    (clientX: number, clientY: number): { col: number; row: number } | null => {
      const el = rootRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
        return null;
      }
      const col = Math.min(columns - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * columns)));
      const row = Math.min(maxRow - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * maxRow)));
      return { col, row };
    },
    [columns, maxRow]
  );

  const onPointerDown = (e: ReactPointerEvent, id: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setHoverId(id);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragId) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) {
      setHoverId(null);
      return;
    }
    const hit = tileAtCell(cell.col, cell.row);
    setHoverId(hit?.id || null);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!dragId) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell) {
      const hit = tileAtCell(cell.col, cell.row);
      if (hit && hit.id !== dragId) {
        onChange(swapDashboardTiles(tiles, dragId, hit.id));
      }
    }
    setDragId(null);
    setHoverId(null);
  };

  return (
    <div
      ref={rootRef}
      className={`grid gap-3 ${className || ''}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(10rem, 1fr)'
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (dragId) {
          setDragId(null);
          setHoverId(null);
        }
      }}
    >
      {tiles.map((tile) => {
        const dragging = dragId === tile.id;
        const dropTarget = Boolean(dragId && hoverId === tile.id && dragId !== tile.id);
        return (
          <div
            key={tile.id}
            className={`relative min-h-[10rem] overflow-hidden rounded-lg border bg-white shadow-sm ${
              dropTarget ? 'border-sky-500 ring-2 ring-sky-400' : 'border-stone-200'
            } ${dragging ? 'opacity-60' : ''}`}
            style={{
              gridColumn: `${tile.col + 1} / span ${tile.colSpan}`,
              gridRow: `${tile.row + 1} / span ${tile.rowSpan}`,
              cursor: dragging ? 'grabbing' : 'grab'
            }}
            onPointerDown={(e) => onPointerDown(e, tile.id)}
          >
            {renderTile(tile, { dragging, dropTarget })}
          </div>
        );
      })}
    </div>
  );
}
