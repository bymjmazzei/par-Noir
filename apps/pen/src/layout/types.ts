/** Shared layout item — rects are % of surface (0–100). */

export interface LayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  positionLocked?: boolean;
}

export function clampLayoutItem(item: LayoutItem): LayoutItem {
  const w = Math.min(100, Math.max(4, item.w));
  const h = Math.min(100, Math.max(4, item.h));
  const x = Math.min(100 - w, Math.max(0, item.x));
  const y = Math.min(100 - h, Math.max(0, item.y));
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
