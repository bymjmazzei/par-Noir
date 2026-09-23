/** Shared layout item — rects are CSS px in the content box. */

export interface LayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  positionLocked?: boolean;
}

export type LayoutBounds = { width: number; height: number };

const MIN = 24;

export function clampLayoutItem(
  item: LayoutItem,
  bounds?: LayoutBounds
): LayoutItem {
  const contentW = Math.max(MIN, bounds?.width ?? 736);
  const contentH = Math.max(MIN, bounds?.height ?? 976);
  const w = Math.min(contentW, Math.max(MIN, item.w));
  const h = Math.min(contentH, Math.max(MIN, item.h));
  const x = Math.min(Math.max(0, contentW - w), Math.max(0, item.x));
  const y = Math.min(Math.max(0, contentH - h), Math.max(0, item.y));
  return { ...item, x, y, w, h };
}

export function bringToFront(items: LayoutItem[], id: string): LayoutItem[] {
  const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 0);
  return items.map((i) => (i.id === id ? { ...i, zIndex: maxZ + 1 } : i));
}

/** Swap zIndex with the layer immediately below in stack order. */
export function sendBackward(items: LayoutItem[], id: string): LayoutItem[] {
  const sorted = sortByZ(items);
  const idx = sorted.findIndex((i) => i.id === id);
  if (idx <= 0) return items;
  const below = sorted[idx - 1]!;
  const cur = sorted[idx]!;
  return items.map((i) => {
    if (i.id === cur.id) return { ...i, zIndex: below.zIndex };
    if (i.id === below.id) return { ...i, zIndex: cur.zIndex };
    return i;
  });
}

export function sortByZ(items: LayoutItem[]): LayoutItem[] {
  return [...items].sort((a, b) => a.zIndex - b.zIndex);
}
